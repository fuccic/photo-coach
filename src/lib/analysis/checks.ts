import type { PhotoMeta } from "../exif";
import { formatAperture, formatExposureComp, formatIso, formatShutter } from "../format";
import type { ImageStats } from "./measure";

export type IssueKind = "dark" | "bright" | "shake" | "focus" | "grain";
export type Severity = "big" | "small";

export type Issue = {
  kind: IssueKind;
  severity: Severity;
  title: string;
  /** One or two plain sentences, shown behind "Why?". */
  why: string;
  /** Tile indices (see ImageStats.tiles) where the problem shows most. */
  area: number[];
};

/*
 * Thresholds were tuned on sample photos with known amounts of under/over exposure, blur, shake
 * and added grain, measured at the analysis size (about 1600px on the long edge).
 */
const DARK = { bigMean: 45, bigTop: 110, smallMean: 75, smallP95: 170, greyTop: 150, greyMean: 120 };
const BRIGHT = { bigClip: 0.25, bigMean: 200, smallClip: 0.06, smallMean: 175 };
/** Sharpness is about 1 / blur width in pixels: sharp photos score 1 to 2+. */
const SHARP = { big: 0.55, small: 0.8, smeared: 1.25, smearedBig: 0.9 };
const SMEAR = { shake: 0.3, slow: 0.25, big: 0.45, alone: 0.45 };
const GRAIN = { big: 4.5, small: 2.5, minIso: 800 };

const ORDER: IssueKind[] = ["dark", "bright", "shake", "focus", "grain"];

export function findIssues(stats: ImageStats, meta?: PhotoMeta): Issue[] {
  const issues = [dark(stats, meta), bright(stats, meta), blur(stats, meta), grain(stats, meta)].filter(
    (i): i is Issue => i !== undefined,
  );
  // Grain is mostly a side effect of the light; say so when both show up.
  const grainy = issues.find((i) => i.kind === "grain");
  if (grainy && issues.some((i) => i.kind === "dark")) grainy.why += " Brightening a dark photo makes grain worse.";
  return issues.sort(
    (a, b) => Number(b.severity === "big") - Number(a.severity === "big") || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
  );
}

function dark(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  const grey = s.p99 < DARK.greyTop && s.meanLuma < DARK.greyMean;
  const big = s.meanLuma < DARK.bigMean || s.p99 < DARK.bigTop;
  const small = (s.meanLuma < DARK.smallMean && s.p95 < DARK.smallP95) || grey;
  if (!big && !small) return undefined;

  const why = [big ? "Most of the photo is lost in shadow." : "The photo came out darker than the scene."];
  if (grey) why.push("Even the brightest parts are grey, not white.");
  if (meta?.exposureComp !== undefined && meta.exposureComp <= -0.7) {
    why.push(`Exposure was turned down to ${formatExposureComp(meta.exposureComp)}.`);
  } else if (meta?.iso !== undefined && meta.iso <= 200) {
    why.push(`ISO was only ${Math.round(meta.iso)}, so there was room to go brighter.`);
  }
  return {
    kind: "dark",
    severity: big ? "big" : "small",
    title: big ? "Too dark" : "A bit dark",
    why: why.join(" "),
    area: tilesWhere(s, (t) => t.luma < 50),
  };
}

function bright(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  const big = s.clipped > BRIGHT.bigClip || s.meanLuma > BRIGHT.bigMean;
  const small = s.clipped > BRIGHT.smallClip || s.meanLuma > BRIGHT.smallMean;
  if (!big && !small) return undefined;

  const why: string[] = [];
  if (s.clipped > BRIGHT.smallClip) {
    why.push(`${Math.round(s.clipped * 100)}% of the photo is pure white, so the detail there is gone.`);
  }
  if (s.meanLuma > BRIGHT.smallMean) why.push("The whole photo looks washed out.");
  if (meta?.exposureComp !== undefined && meta.exposureComp >= 0.7) {
    why.push(`Exposure was turned up to ${formatExposureComp(meta.exposureComp)}.`);
  }
  return {
    kind: "bright",
    severity: big ? "big" : "small",
    title: big ? "Too bright" : "A bit bright",
    why: why.join(" "),
    area: tilesWhere(s, (t) => t.clipped > 0.3),
  };
}

function blur(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  if (s.sharpness === null) return undefined;
  // A shutter too slow to hand-hold makes shake likely, so a smaller smear is enough to call it.
  const slow = slowShutter(meta);
  const smeared = s.smear >= (slow ? SMEAR.slow : SMEAR.shake);
  // Shake can leave edges that run along it crisp, so a strong one-way smear counts on its own.
  const blurry = s.sharpness < SHARP.small || (smeared && s.sharpness < SHARP.smeared) || s.smear >= SMEAR.alone;
  if (!blurry) return undefined;

  const big = s.sharpness < SHARP.big || (s.smear >= SMEAR.big && s.sharpness < SHARP.smearedBig);
  const shake = smeared || slow === true;
  const shutter = formatShutter(meta?.exposureTime);
  const why: string[] = [];

  if (shake) {
    why.push(big ? "The whole photo is smeared." : "Details are slightly smeared.");
    if (smeared) why.push("The smear runs one way, which means the camera or the subject moved.");
    if (slow && shutter) {
      why.push(`${shutter} is slow to hold steady${focalText(meta)}. Aim for ${formatShutter(handHeldLimit(meta))} or faster.`);
    }
  } else {
    why.push(big ? "Nothing in the photo is sharp." : "Even the sharpest part is a little soft.");
    if (slow === false && shutter) why.push(`At ${shutter} it isn't shake, so focus missed.`);
    if (meta?.fNumber !== undefined && meta.fNumber <= 2.8) {
      why.push(`At ${formatAperture(meta.fNumber)} only a thin slice of the scene can be sharp.`);
    }
  }
  const limit = smeared ? SHARP.smeared : SHARP.small;
  return {
    kind: shake ? "shake" : "focus",
    severity: big ? "big" : "small",
    title: shake ? (big ? "Blurry" : "A bit blurry") : big ? "Out of focus" : "A bit soft",
    why: why.join(" "),
    area: tilesWhere(s, (t) => t.sharpness !== null && t.sharpness < limit),
  };
}

function grain(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  if (s.noise < GRAIN.small) return undefined;
  // Low ISO photos aren't grainy: busy texture (grass, fur, crowds) is what fooled the estimate.
  if (meta?.iso !== undefined ? meta.iso < GRAIN.minIso : !s.noiseSure) return undefined;

  const why = ["The photo has visible grain, most of all in the dark areas."];
  if (meta?.iso !== undefined) why.push(`${formatIso(meta.iso)} is high, and higher ISO means more grain.`);
  return {
    kind: "grain",
    severity: s.noise >= GRAIN.big ? "big" : "small",
    title: s.noise >= GRAIN.big ? "Grainy" : "A bit grainy",
    why: why.join(" "),
    area: tilesWhere(s, (t) => t.luma > 16 && t.luma < 110),
  };
}

/** The usual hand-held rule: 1 / (35mm-equivalent focal length) seconds. */
function handHeldLimit(meta?: PhotoMeta): number {
  const focal = meta?.focalLength35 ?? (meta?.device?.kind === "camera" ? meta.focalLength : undefined);
  return 1 / Math.max(focal ?? 30, 15);
}

/** undefined when the shutter speed is unknown. */
function slowShutter(meta?: PhotoMeta): boolean | undefined {
  if (meta?.exposureTime === undefined) return undefined;
  return meta.exposureTime > handHeldLimit(meta) * 1.01;
}

function focalText(meta?: PhotoMeta): string {
  const focal = meta?.focalLength35 ?? (meta?.device?.kind === "camera" ? meta.focalLength : undefined);
  return focal ? ` at ${Math.round(focal)}mm` : "";
}

function tilesWhere(s: ImageStats, test: (t: ImageStats["tiles"][number]) => boolean): number[] {
  const out: number[] = [];
  s.tiles.forEach((t, i) => test(t) && out.push(i));
  return out;
}
