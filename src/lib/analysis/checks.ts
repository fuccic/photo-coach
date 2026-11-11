import { equivalentFocal, isStabilized } from "../devices";
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
  /** Found on a photo that is meant to be mostly dark (see isDarkScene). */
  darkScene?: true;
};

/*
 * Thresholds were tuned on sample photos with known amounts of under/over exposure, blur, shake
 * and added grain, measured at the analysis size (about 1600px on the long edge).
 */
const DARK = { bigMean: 45, bigTop: 110, smallMean: 75, smallP95: 170, greyTop: 150, greyMean: 120 };
const BRIGHT = { bigClip: 0.25, bigMean: 200, smallClip: 0.06, smallMean: 175 };
/** Sharpness is about 1 / blur width in pixels: sharp photos score 1 to 2+. */
const SHARP = { big: 0.55, small: 0.8, smeared: 1.25, smearedBig: 0.9, night: 1.2 };
const SMEAR = { shake: 0.3, slow: 0.25, big: 0.45, alone: 0.45 };
const GRAIN = { big: 4.5, small: 2.5, minIso: 800 };
/**
 * Dark scenes (see isDarkScene). `lit` and `vivid` are shares of the photo's non-black part at full
 * brightness. Tuned on real Canon Rebel XT photos: moon shots, neon signs and flash portraits on a
 * black background score 0.5% to 27%, dim flash group shots that really were too dark under 0.2%.
 */
const SCENE = { crushed: 0.2, lit: 0.003, vivid: 0.02, blown: 0.0005, blownBig: 0.002 };
/** Phone exposures this long are almost always Night mode. */
const NIGHT_MODE = 1 / 4;

const ORDER: IssueKind[] = ["dark", "bright", "shake", "focus", "grain"];

export function findIssues(stats: ImageStats, meta?: PhotoMeta): Issue[] {
  const issues = [dark(stats, meta), bright(stats, meta), blur(stats, meta), grain(stats, meta)].filter(
    (i): i is Issue => i !== undefined,
  );
  // Grain is mostly a side effect of the light; say so when both show up.
  const grainy = issues.find((i) => i.kind === "grain");
  if (grainy && issues.some((i) => i.kind === "dark")) grainy.why += " Both come from too little light.";
  return issues.sort(
    (a, b) => Number(b.severity === "big") - Number(a.severity === "big") || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
  );
}

/**
 * True for photos meant to be mostly dark: the moon or a neon sign on a black sky, a sunset, a
 * flash portrait at night. Their bright parts reach full brightness, so the camera exposed for
 * those and the rest is dark because the scene is. Brightening would only blow out the subject.
 */
export function isDarkScene(s: ImageStats): boolean {
  const lit = (s.highlights ?? 0) / Math.max(1 - s.crushed, 0.01);
  return (s.crushed >= SCENE.crushed && lit >= SCENE.lit) || lit >= SCENE.vivid;
}

function dark(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  if (isDarkScene(s)) return undefined;
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
  if (!big && !small) return blownSpot(s);

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

function blownSpot(s: ImageStats): Issue | undefined {
  // A white moon or lamp on a dark photo is too small for the check above, but it is the subject.
  // The dark surroundings fool the camera into a long exposure that burns it out.
  if (s.crushed >= SCENE.crushed && isDarkScene(s) && s.clipped >= SCENE.blown && s.clipped >= 0.5 * (s.highlights ?? 0)) {
    return {
      kind: "bright",
      severity: s.clipped >= SCENE.blownBig ? "big" : "small",
      title: "Bright spot blown out",
      why: "The brightest part is pure white, so its detail is gone. The dark around it fooled the camera into going too bright.",
      area: tilesWhere(s, (t) => t.clipped > 0.01),
      darkScene: true,
    };
  }
  return undefined;
}

function blur(s: ImageStats, meta?: PhotoMeta): Issue | undefined {
  if (s.sharpness === null) return undefined;
  // Phones pick their own shutter speed, so a slow one alone doesn't mean shake there.
  const phone = meta?.device?.kind === "phone";
  const slow = phone ? undefined : slowShutter(meta);
  const nightLong = phone && meta?.exposureTime !== undefined && meta.exposureTime >= NIGHT_MODE;
  const smeared = s.smear >= (slow || nightLong ? SMEAR.slow : SMEAR.shake);
  // Night mode lines up and blends its frames, so movement during them softens the photo evenly
  // instead of smearing it one way, and the phone's sharpening keeps a few light edges crisp. Sharp
  // Night mode photos still score 1.3 or more; shaken ones about 1.0 (iPhone 18 Pro, 2026-11 test).
  const nightSoft = nightLong && s.sharpness < SHARP.night;
  // Shake can leave edges that run along it crisp, so a strong one-way smear counts on its own.
  const blurry =
    s.sharpness < SHARP.small || (smeared && s.sharpness < SHARP.smeared) || s.smear >= SMEAR.alone || nightSoft;
  if (!blurry) return undefined;

  const big = s.sharpness < SHARP.big || (s.smear >= SMEAR.big && s.sharpness < SHARP.smearedBig);
  // In Night mode, movement during the long capture is a likelier cause than a focus miss.
  const shake = smeared || slow === true || nightLong;
  const shutter = formatShutter(meta?.exposureTime);
  const why: string[] = [];

  if (shake) {
    why.push(big ? "The whole photo is smeared." : "Details are slightly smeared.");
    if (smeared) why.push("The smear runs one way, which means the camera or the subject moved.");
    if (slow && shutter) {
      why.push(`${shutter} is slow to hold steady${focalText(meta)}. Aim for ${formatShutter(handHeldLimit(meta))} or faster.`);
    }
    // Not the saved shutter speed: that is one frame's, and Night mode stacks many of them
    // (IMG_2703 saved 1/4s for a 3.5s capture).
    if (nightLong) why.push("Night mode keeps taking the photo for a second or more, so the phone and the subject had to stay still that long.");
  } else {
    why.push(big ? "Nothing in the photo is sharp." : "Even the sharpest part is a little soft.");
    if (slow === false && shutter) why.push(`At ${shutter} it isn't shake, so focus missed.`);
    // A phone's small sensor keeps plenty sharp even at f/1.8, and its aperture can't be changed.
    if (!phone && meta?.fNumber !== undefined && meta.fNumber <= 2.8) {
      why.push(`At ${formatAperture(meta.fNumber)} only a thin slice of the scene can be sharp.`);
    }
  }
  const limit = nightSoft ? SHARP.night : smeared ? SHARP.smeared : SHARP.small;
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

/**
 * The usual hand-held rule: 1 / (35mm-equivalent focal length) seconds. Stabilisation buys about
 * two stops in practice (makers claim more, but that needs good technique).
 */
export function handHeldLimit(meta?: PhotoMeta): number {
  const focal = equivalentFocal(meta);
  return (isStabilized(meta?.device) ? 4 : 1) / Math.max(focal ?? 30, 15);
}

/** The shutter speed a shake fix aims for: hand-holdable, and quick enough for people walking. */
export function steadyShutter(meta?: PhotoMeta): number {
  return Math.min(handHeldLimit(meta), 1 / 125);
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
