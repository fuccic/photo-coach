import { handHeldLimit, type Issue, type IssueKind } from "../analysis/checks";
import type { ImageStats } from "../analysis/measure";
import type { PhotoMeta, ShootingMode } from "../exif";
import type { CameraGuide, CameraLever, Guide, PhoneLever } from "../instructions";

/*
 * The settings solver (PLAN.md 5.5): turns a problem into one or two setting changes plus the
 * levers to pull on the device. Settings trade off (a faster shutter darkens the photo, so ISO
 * goes up, which adds grain), so a fix balances the exposure where it can and names the cost.
 */

export type Setting = "iso" | "shutter" | "aperture" | "ev";

export type Change = { setting: Setting; from?: number; to: number };

export type Action =
  | { lever: CameraLever; value?: number | ShootingMode }
  | { lever: PhoneLever; value?: undefined };

export type Fix = {
  kind: IssueKind;
  /** A two or three word goal, shown when there's no number to change. */
  goal: string;
  changes: Change[];
  /** In order. Each becomes one or more steps from the device guide. */
  actions: Action[];
  /** What the change costs, in one line. */
  tradeOff?: string;
};

const GOALS: Record<IssueKind, string> = {
  dark: "Brighter",
  bright: "Darker",
  shake: "Hold steadier",
  focus: "Sharp subject",
  grain: "Less grain",
};

export function solveFix(issue: Issue, meta: PhotoMeta | undefined, stats: ImageStats | null | undefined, guide: Guide): Fix {
  const fix = guide.kind === "camera" ? cameraFix(issue, meta ?? undefined, stats, guide) : phoneFix(issue, meta);
  return { kind: issue.kind, goal: GOALS[issue.kind], ...fix };
}

type Solved = Omit<Fix, "kind" | "goal">;

function cameraFix(issue: Issue, meta: PhotoMeta | undefined, stats: ImageStats | null | undefined, guide: CameraGuide): Solved {
  const { limits } = guide;
  const iso = meta?.iso;
  const t = meta?.exposureTime;
  const limit = handHeldLimit(meta);
  // In P, A and S the camera sets its own exposure, so exposure compensation is what makes it
  // brighter or darker; raising ISO would only change the shutter or aperture it picks.
  const manual = meta?.mode === "manual";

  switch (issue.kind) {
    case "dark":
    case "bright": {
      const sign = issue.kind === "dark" ? 1 : -1;
      const stops = exposureStops(issue, stats);
      const ev = meta?.exposureComp ?? 0;
      const evWasOff = sign * ev < -0.3;

      if (manual && iso !== undefined && !evWasOff) {
        const isoTo = snapIso(iso * 2 ** (sign * stops), limits);
        const changes: Change[] = isoTo !== iso ? [{ setting: "iso", from: iso, to: isoTo }] : [];
        const actions: Action[] = changes.length ? [{ lever: "iso", value: isoTo }] : [];
        // Out of ISO range: make up the rest with the shutter, if that stays hand-holdable.
        const left = stops - Math.abs(Math.log2(isoTo / iso));
        if (left >= 0.5 && t !== undefined) {
          const shutterTo = sign > 0 ? snapShutterSlower(t * 2 ** left, limit) : snapShutterFaster(t / 2 ** left, limits.shutterMin);
          if (shutterTo !== t) {
            changes.push({ setting: "shutter", from: t, to: shutterTo });
            actions.push({ lever: "shutter", value: shutterTo });
          }
        }
        if (changes.length) {
          return { changes, actions, tradeOff: sign > 0 && changes[0].setting === "iso" ? "Higher ISO adds a little grain." : undefined };
        }
      }

      const evTo = clamp(Math.round((ev + sign * stops) * 3) / 3, -limits.evMax, limits.evMax);
      const changes: Change[] = [{ setting: "ev", from: meta?.exposureComp, to: evTo }];
      const actions: Action[] = [];
      if (manual) actions.push({ lever: "mode", value: "aperture" });
      actions.push({ lever: "ev", value: evTo });
      if (sign < 0) return { changes, actions };

      // Brighter means a slower shutter. Past the hand-held limit, raise ISO instead.
      const slower = t !== undefined && meta?.mode !== "shutter" ? t * 2 ** (evTo - ev) : undefined;
      if (slower !== undefined && slower > limit * 1.01 && iso !== undefined) {
        const isoTo = snapIso(iso * Math.min(slower / limit, 2 ** stops), limits);
        if (isoTo > iso) {
          changes.push({ setting: "iso", from: iso, to: isoTo });
          actions.push({ lever: "iso", value: isoTo });
          return { changes, actions, tradeOff: "Higher ISO adds a little grain." };
        }
      }
      return { changes, actions, tradeOff: "The shutter gets slower, so hold steady." };
    }

    case "shake": {
      // Fast enough for the lens, and for people walking.
      let target = Math.min(limit, 1 / 125);
      if (t !== undefined && t <= target * 1.01) target = t / 4;
      const shutterTo = snapShutterFaster(target, limits.shutterMin);
      const changes: Change[] = [{ setting: "shutter", from: t, to: shutterTo }];
      const actions: Action[] = [];
      if (!manual && meta?.mode !== "shutter") actions.push({ lever: "mode", value: "shutter" });
      actions.push({ lever: "shutter", value: shutterTo });

      const stops = t !== undefined ? Math.log2(t / shutterTo) : 0;
      if (iso !== undefined && stops >= 0.5) {
        const isoTo = snapIso(iso * 2 ** stops, limits);
        if (isoTo > iso) {
          changes.push({ setting: "iso", from: iso, to: isoTo });
          actions.push({ lever: "iso", value: isoTo });
          return { changes, actions, tradeOff: "Less light gets in, so ISO goes up. A little more grain." };
        }
      }
      return { changes, actions, tradeOff: "Less light gets in, so the photo may be darker." };
    }

    case "focus": {
      const f = meta?.fNumber;
      const focusSteps: Action[] = [{ lever: "focusMode" }, { lever: "focusArea" }, { lever: "halfPress" }];
      // A wide aperture leaves only a thin slice sharp: two stops more gives focus some room.
      if (f === undefined || f > 2.8) return { changes: [], actions: focusSteps };
      const fTo = snapAperture(f * 2);
      const actions: Action[] = [];
      if (!manual && meta?.mode !== "aperture") actions.push({ lever: "mode", value: "aperture" });
      actions.push({ lever: "aperture", value: fTo }, ...focusSteps);
      return {
        changes: [{ setting: "aperture", from: f, to: fTo }],
        actions,
        tradeOff: "Less light gets in, so the shutter gets slower.",
      };
    }

    case "grain": {
      const from = iso ?? limits.isoMin * 16;
      const isoTo = snapIso(Math.max(limits.isoMin, from / 4), limits);
      const changes: Change[] = [{ setting: "iso", from: iso, to: isoTo }];
      const actions: Action[] = [{ lever: "iso", value: isoTo }];
      if (manual && t !== undefined) {
        const shutterTo = snapShutterSlower(t * (from / isoTo), limit);
        if (shutterTo > t) {
          changes.push({ setting: "shutter", from: t, to: shutterTo });
          actions.push({ lever: "shutter", value: shutterTo });
        }
      }
      return { changes, actions, tradeOff: "Lower ISO needs a slower shutter. Brace yourself or use a tripod." };
    }
  }
}

function phoneFix(issue: Issue, meta: PhotoMeta | undefined): Solved {
  const t = meta?.exposureTime;
  // The telephoto lenses gather less light than the main one, so the phone picks slower, grainier shots.
  const zoomed = (meta?.focalLength35 ?? 0) >= 70;
  const lens: Action[] = zoomed ? [{ lever: "mainLens" }] : [];
  const lowLight = (t !== undefined && t >= 1 / 30) || (meta?.iso ?? 0) >= 800;

  switch (issue.kind) {
    case "dark":
      return {
        changes: [],
        actions: [...lens, { lever: "tapSubject" }, { lever: "brighten" }, ...(lowLight ? [{ lever: "nightMode" } as const] : [])],
      };
    case "bright":
      return { changes: [], actions: [{ lever: "tapSubject" }, { lever: "darken" }, { lever: "lock" }] };
    case "shake":
      return {
        changes: [],
        // Exposures this long are almost always Night mode.
        actions: [...lens, ...(t !== undefined && t >= 1 / 4 ? [{ lever: "nightShorter" } as const] : []), { lever: "holdSteady" }],
        tradeOff: zoomed ? "1x takes in more light, so the phone can use a faster shutter." : undefined,
      };
    case "focus":
      return { changes: [], actions: [{ lever: "tapSubject" }, { lever: "lock" }, { lever: "stepBack" }] };
    case "grain":
      return {
        changes: [],
        actions: [...lens, { lever: "moreLight" }, ...(lowLight ? [{ lever: "nightMode" } as const] : [])],
        tradeOff: "Grain means the phone was short of light.",
      };
  }
}

/** How many stops brighter (dark) or darker (bright) to go, from 1 to 3. */
function exposureStops(issue: Issue, stats: ImageStats | null | undefined): number {
  if (!stats) return issue.severity === "big" ? 2 : 1;
  // Brightness values are gamma-encoded: about the 2.2th root of the light that hit the sensor.
  const target = issue.kind === "dark" ? 110 : 120;
  const ev = 2.2 * Math.log2(target / clamp(stats.meanLuma, 4, 250));
  return clamp(Math.round(issue.kind === "dark" ? ev : -ev), 1, 3);
}

// Full stops for ISO, third stops for shutter and aperture, as cameras show them.
const SHUTTERS = [
  8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100, 80, 60, 50,
  40, 30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3, 2.5, 2, 1.6, 1.3, 1,
].map((d) => 1 / d);
const APERTURES = [1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22];

function snapIso(iso: number, limits: CameraGuide["limits"]): number {
  const stops = Math.round(Math.log2(clamp(iso, limits.isoMin, limits.isoMax) / limits.isoMin));
  return Math.min(limits.isoMin * 2 ** stops, limits.isoMax);
}

/** The slowest listed speed at least as fast as `seconds`. */
function snapShutterFaster(seconds: number, fastest: number): number {
  return [...SHUTTERS].reverse().find((s) => s <= seconds * 1.01 && s >= fastest * 0.99) ?? fastest;
}

/** The listed speed closest to `seconds`, but never slower than `slowest`. */
function snapShutterSlower(seconds: number, slowest: number): number {
  const ok = SHUTTERS.filter((s) => s <= slowest * 1.01);
  return ok.reduce((best, s) => (Math.abs(Math.log2(s / seconds)) < Math.abs(Math.log2(best / seconds)) ? s : best), ok[0]);
}

function snapAperture(f: number): number {
  return APERTURES.find((a) => a >= f * 0.97) ?? APERTURES[APERTURES.length - 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
