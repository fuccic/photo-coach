import { handHeldLimit, steadyShutter, type Issue, type IssueKind } from "../analysis/checks";
import type { ImageStats } from "../analysis/measure";
import type { PhotoMeta, ShootingMode } from "../exif";
import type { CameraGuide, CameraLever, Guide, PhoneLever } from "../instructions";

/*
 * The settings solver (PLAN.md 5.5): turns a problem into one or two setting changes plus the
 * levers to pull on the device. Settings trade off (a faster shutter darkens the photo, so ISO
 * goes up, which adds grain), so a fix balances the exposure where it can and names the cost.
 */

export type Setting = "iso" | "shutter" | "aperture" | "ev" | "flash";

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

/**
 * `found` is every problem found on the photo (or just their kinds), so fixes for one problem
 * don't undo another.
 */
export function solveFix(
  issue: Issue,
  meta: PhotoMeta | undefined,
  stats: ImageStats | null | undefined,
  guide: Guide,
  found: readonly (Issue | IssueKind)[] = [],
): Fix {
  const fix = guide.kind === "camera" ? cameraFix(issue, meta ?? undefined, stats, guide, found) : phoneFix(issue, meta);
  return { kind: issue.kind, goal: GOALS[issue.kind], ...fix };
}

type Solved = Omit<Fix, "kind" | "goal"> & { goal?: string };

const SLOWER = "The shutter gets slower, so hold steady.";
const MORE_GRAIN = "Higher ISO adds a little grain.";
const STARVED = "ISO stays put to avoid more grain, so use a tripod or brace yourself.";
const NO_LIGHT = "Too dark for a faster shutter, so brace yourself instead.";
const TRIPOD = "The shutter is too slow to hold, so use a tripod.";
const STILL_WHITE = "Still white? Go darker again.";
const FLASH_REACH = "Or step closer: flash only reaches a few metres.";

function cameraFix(
  issue: Issue,
  meta: PhotoMeta | undefined,
  stats: ImageStats | null | undefined,
  guide: CameraGuide,
  foundIssues: readonly (Issue | IssueKind)[],
): Solved {
  const { limits } = guide;
  const found = foundIssues.map((i) => (typeof i === "string" ? i : i.kind));
  /** The photo's own issue of this kind, so its details (how dark, a dark scene) carry over. */
  const other = (kind: IssueKind): Issue =>
    (kind === issue.kind ? issue : foundIssues.find((i): i is Issue => typeof i !== "string" && i.kind === kind)) ?? {
      ...issue,
      kind,
      darkScene: undefined,
    };
  const iso = meta?.iso;
  const t = meta?.exposureTime;
  const f = meta?.fNumber;
  const limit = handHeldLimit(meta);
  // In P, A and S the camera sets its own exposure, so exposure compensation is what makes it
  // brighter or darker; raising ISO would only change the shutter or aperture it picks.
  const manual = meta?.mode === "manual";
  const flash = meta?.flashFired === true;
  // Dark and grainy together means the camera was short of light. Raising ISO (the dark fix)
  // adds grain and lowering it (the grain fix) darkens the photo further, so both problems get
  // the same plan: more light through the shutter, ISO left where it is.
  const starved = found.includes("dark") && found.includes("grain");
  // How much wider the lens can open than it did, in stops.
  const openRoom = f !== undefined ? Math.max(0, 2 * Math.log2(f / widestAperture(meta))) : 0;
  const isoRoom = iso !== undefined ? Math.log2(limits.isoMax / iso) : 0;

  /**
   * Brighter (sign 1) or darker (sign -1) by `stops`. With `keepIso`, never touches ISO. Never
   * leaves the photo darker than asked: what a setting can't make up, the next one does, and
   * whatever is still missing is said plainly.
   */
  const exposure = (sign: 1 | -1, stops: number, keepIso: boolean): Solved => {
    const ev = meta?.exposureComp ?? 0;
    const evWasOff = sign * ev < -0.3;

    if (manual && iso !== undefined && !evWasOff) {
      const isoTo = keepIso ? iso : snapIso(iso * 2 ** (sign * stops), limits);
      const changes: Change[] = isoTo !== iso ? [{ setting: "iso", from: iso, to: isoTo }] : [];
      const actions: Action[] = changes.length ? [{ lever: "iso", value: isoTo }] : [];
      // Out of ISO range (or keeping it): make up the rest with the shutter. Hand-holdable
      // unless ISO is being kept down, then as slow as it takes.
      let left = stops - Math.abs(Math.log2(isoTo / iso));
      if (left >= 0.5 && t !== undefined) {
        const shutterTo =
          sign > 0 ? snapShutterSlower(t * 2 ** left, keepIso ? SHUTTERS[SHUTTERS.length - 1] : limit) : snapShutterFaster(t / 2 ** left, limits.shutterMin);
        // Snapping to the hand-held limit can land on the wrong side of a slow tripod shutter.
        if (sign > 0 ? shutterTo > t * 1.01 : shutterTo < t * 0.99) {
          changes.push({ setting: "shutter", from: t, to: shutterTo });
          actions.push({ lever: "shutter", value: shutterTo });
          left -= Math.abs(Math.log2(shutterTo / t));
        }
      }
      // Still short of light: open the lens up.
      if (sign > 0 && left >= 0.5 && f !== undefined && openRoom >= 0.5) {
        const fTo = snapApertureWider(f / 2 ** (Math.min(left, openRoom) / 2), widestAperture(meta));
        if (fTo < f * 0.97) {
          changes.push({ setting: "aperture", from: f, to: fTo });
          actions.push({ lever: "aperture", value: fTo });
          left -= 2 * Math.log2(f / fTo);
        }
      }
      // And still short: a shutter too slow to hand-hold, on a tripod.
      let tripod = false;
      if (sign > 0 && !keepIso && left >= 0.5 && t !== undefined) {
        const now = changes.find((c) => c.setting === "shutter");
        const from = now?.to ?? t;
        const slower = snapShutterSlower(from * 2 ** left, SHUTTERS[SHUTTERS.length - 1]);
        if (slower > from * 1.01) {
          if (now) now.to = slower;
          else changes.push({ setting: "shutter", from: t, to: slower });
          const action = actions.find((a) => a.lever === "shutter");
          if (action) action.value = slower;
          else actions.push({ lever: "shutter", value: slower });
          left -= Math.log2(slower / from);
          tripod = true;
        }
      }
      if (changes.length) {
        const tradeOff =
          sign < 0
            ? undefined
            : left >= 0.7
              ? `${shortOf(left)} Add light, or use a tripod.`
              : tripod
                ? TRIPOD
                : keepIso
                ? STARVED
                : changes[0].setting === "iso"
                  ? MORE_GRAIN
                  : changes[0].setting === "aperture"
                    ? WIDER
                    : SLOWER;
        return { changes, actions, tradeOff };
      }
    }

    const evTo = clamp(Math.round((ev + sign * stops) * 3) / 3, -limits.evMax, limits.evMax);
    const changes: Change[] = [];
    const actions: Action[] = [];
    if (manual) actions.push({ lever: "mode", value: "aperture" });
    // In S with the lens already near its smallest opening, the camera can't close it further, so
    // exposure compensation does nothing: a faster shutter is what darkens the photo.
    if (sign < 0 && meta?.mode === "shutter" && t !== undefined && f !== undefined && f >= 16) {
      const shutterTo = snapShutterFaster(t / 2 ** stops, limits.shutterMin);
      if (shutterTo < t * 0.99) {
        changes.push({ setting: "shutter", from: t, to: shutterTo });
        actions.push({ lever: "shutter", value: shutterTo });
      }
    }
    changes.push({ setting: "ev", from: meta?.exposureComp, to: evTo });
    actions.push({ lever: "ev", value: evTo });
    if (sign < 0) return { changes, actions };
    if (keepIso) return { changes, actions, tradeOff: STARVED };

    const gained = evTo - ev;
    // In S the camera brightens by opening the lens. Past its widest, raise ISO for the rest.
    if (meta?.mode === "shutter") {
      if (iso !== undefined && gained > openRoom + 0.5) {
        const isoTo = snapIso(iso * 2 ** (gained - openRoom), limits);
        if (isoTo > iso) {
          changes.push({ setting: "iso", from: iso, to: isoTo });
          actions.push({ lever: "iso", value: isoTo });
          return { changes, actions, tradeOff: MORE_GRAIN };
        }
      }
      return { changes, actions, tradeOff: gained > openRoom + 0.7 ? shortOf(gained - openRoom) : WIDER };
    }
    // Elsewhere brighter means a slower shutter. Past the hand-held limit, raise ISO instead.
    const slower = t !== undefined ? t * 2 ** gained : undefined;
    if (slower !== undefined && slower > limit * 1.01 && iso !== undefined) {
      const isoTo = snapIso(iso * Math.min(slower / limit, 2 ** stops), limits);
      if (isoTo > iso) {
        changes.push({ setting: "iso", from: iso, to: isoTo });
        actions.push({ lever: "iso", value: isoTo });
        return { changes, actions, tradeOff: MORE_GRAIN };
      }
    }
    return { changes, actions, tradeOff: SLOWER };
  };

  /**
   * Flash photos: exposure compensation only changes the background, and the flash's own
   * compensation is what lights the subject. Higher ISO helps both and lets the flash reach further.
   */
  const flashExposure = (sign: 1 | -1, stops: number): Solved => {
    const changes: Change[] = [];
    const actions: Action[] = [];
    if (sign > 0 && iso !== undefined && isoRoom >= 0.5) {
      const isoTo = snapIso(iso * 2 ** Math.min(stops, 2), limits);
      if (isoTo > iso) {
        changes.push({ setting: "iso", from: iso, to: isoTo });
        actions.push({ lever: "iso", value: isoTo });
      }
    }
    const comp = sign * (stops >= 2 ? 2 : 1);
    changes.push({ setting: "flash", to: comp });
    actions.push({ lever: "flashComp", value: comp });
    return { changes, actions, tradeOff: sign > 0 ? FLASH_REACH : undefined };
  };

  /**
   * A faster shutter for shake, with the light it costs made up by the lens and ISO. `want` is
   * how much brighter (or darker, below 0) the photo should also end up, when it was flagged dark
   * or bright too, so one plan fixes both. Never trades shake for a darker photo: when there's
   * not enough light to make up, the shutter only goes as fast as the light allows.
   */
  const steadier = (want: number, keepIso: boolean): Solved => {
    let target = steadyShutter(meta);
    if (t !== undefined && t <= target * 1.01) target = t / 4;
    // With flash, the shutter can't go faster than the flash sync speed.
    const fastest = flash ? Math.max(limits.flashSync, limits.shutterMin) : limits.shutterMin;
    target = Math.max(target, fastest);
    const needMode: Action[] = !manual && meta?.mode !== "shutter" ? [{ lever: "mode", value: "shutter" }] : [];

    if (t === undefined || iso === undefined) {
      const shutterTo = snapShutterFaster(target, fastest);
      return {
        changes: [{ setting: "shutter", from: t, to: shutterTo }],
        actions: [...needMode, { lever: "shutter", value: shutterTo }],
        tradeOff: "Less light gets in, so the photo may be darker.",
      };
    }

    const raise = keepIso ? 0 : isoRoom;
    const lower = Math.log2(limits.isoMin / iso);
    let faster = Math.log2(t / snapShutterFaster(target, fastest));
    let cut = false;
    if (faster + want > openRoom + raise + 0.33) {
      faster = openRoom + raise - want;
      cut = true;
    }
    const shutterTo = faster >= 0.6 ? snapShutterFaster(t / 2 ** faster, fastest) : t;
    faster = Math.log2(t / shutterTo);

    if (faster < 0.6) {
      // No light to spare: brace instead, and brighten (or darken) with ISO only, so the shutter
      // stays as it is.
      const plan: Solved = { changes: [], actions: [], tradeOff: flash ? "Already at the flash's fastest shutter. Brace yourself." : NO_LIGHT };
      if (Math.abs(want) >= 0.5) {
        const isoTo = snapIso(iso * 2 ** clamp(want, lower, raise), limits);
        if (isoTo !== iso) {
          const by = Math.log2(isoTo / iso);
          plan.changes.push({ setting: "iso", from: iso, to: isoTo });
          plan.actions.push({ lever: "iso", value: isoTo });
          // In P, A and S the camera would undo an ISO change with the shutter: tell it to keep it.
          if (!manual) {
            const evTo = clamp(Math.round(((meta?.exposureComp ?? 0) + by) * 3) / 3, -limits.evMax, limits.evMax);
            plan.changes.push({ setting: "ev", from: meta?.exposureComp, to: evTo });
            plan.actions.push({ lever: "ev", value: evTo });
          }
          if (want - by >= 0.7) plan.tradeOff = `${shortOf(want - by)} Add light, and brace yourself.`;
        }
      }
      plan.actions.push({ lever: "steady" });
      return plan;
    }

    const changes: Change[] = [{ setting: "shutter", from: t, to: shutterTo }];
    const actions: Action[] = [...needMode, { lever: "shutter", value: shutterTo }];
    const need = faster + want;
    let isoTo = iso;
    let fTo = f;
    let tradeOff: string | undefined;

    if (manual) {
      // ISO first, then the lens: both have to be set by hand.
      isoTo = snapIso(iso * 2 ** clamp(need, lower, raise), limits);
      const left = need - Math.log2(isoTo / iso);
      if (left >= 0.33 && f !== undefined && openRoom >= 0.33) {
        fTo = snapApertureWider(f / 2 ** (Math.min(left, openRoom) / 2), widestAperture(meta));
      }
    } else {
      // In S the camera opens the lens by itself. ISO covers what the lens can't.
      // Rounded up when brightening, so the photo doesn't end up darker than wanted.
      const extra = need - openRoom;
      if (extra > 0.33) isoTo = snapIso(iso * 2 ** Math.min(want >= 0 ? Math.ceil(extra - 0.25) : extra, raise), limits);
      if (Math.abs(want) >= 0.33) {
        const ev = meta?.exposureComp ?? 0;
        const evTo = clamp(Math.round((ev + want) * 3) / 3, -limits.evMax, limits.evMax);
        if (Math.abs(evTo - ev) >= 0.3) {
          changes.push({ setting: "ev", from: meta?.exposureComp, to: evTo });
          actions.push({ lever: "ev", value: evTo });
        }
      }
    }
    if (isoTo !== iso) {
      changes.push({ setting: "iso", from: iso, to: isoTo });
      actions.push({ lever: "iso", value: isoTo });
    }
    if (fTo !== undefined && f !== undefined && fTo < f * 0.97) {
      changes.push({ setting: "aperture", from: f, to: fTo });
      actions.push({ lever: "aperture", value: fTo });
    }

    const made = Math.log2(isoTo / iso) + (manual ? 2 * Math.log2((f ?? 1) / (fTo ?? f ?? 1)) : Math.min(openRoom, Math.max(need, 0)));
    if (need - made >= 0.7) tradeOff = `${shortOf(need - made)} Add light or brace yourself.`;
    else if (cut) tradeOff = "As fast as the light allows. Brace yourself too.";
    else if (isoTo > iso) tradeOff = "Less light gets in, so ISO goes up. A little more grain.";
    else if (need >= 0.5) tradeOff = WIDER;
    return { changes, actions, tradeOff };
  };

  // Shake together with dark or bright gets one plan, so the two fixes don't fight over the shutter.
  const shaky = found.includes("shake") && !flash;
  const want = found.includes("dark")
    ? exposureStops(other("dark"), stats)
    : found.includes("bright")
      ? -exposureStops(other("bright"), stats)
      : 0;

  switch (issue.kind) {
    case "dark":
    case "bright": {
      const sign = issue.kind === "dark" ? 1 : -1;
      const stops = exposureStops(issue, stats);
      const plan = flash ? flashExposure(sign, stops) : shaky ? steadier(sign * stops, starved) : exposure(sign, stops, starved);
      // How far over a blown-out moon or lamp went can't be measured, so say how to check.
      return issue.darkScene && !plan.tradeOff ? { ...plan, tradeOff: STILL_WHITE } : plan;
    }

    case "shake":
      return steadier(flash ? 0 : want, starved);

    case "focus": {
      const focusSteps: Action[] = [{ lever: "focusMode" }, { lever: "focusArea" }, { lever: "halfPress" }];
      // A wide aperture leaves only a thin slice sharp: two stops more gives focus some room.
      if (f === undefined || f > 2.8) return { changes: [], actions: focusSteps };
      const fTo = snapAperture(f * 2);
      const changes: Change[] = [{ setting: "aperture", from: f, to: fTo }];
      const actions: Action[] = [];
      if (!manual && meta?.mode !== "aperture") actions.push({ lever: "mode", value: "aperture" });
      actions.push({ lever: "aperture", value: fTo });
      let tradeOff = "Less light gets in, so the shutter gets slower.";
      // In M nothing makes up for the smaller opening, so ISO does.
      if (manual && iso !== undefined) {
        const isoTo = snapIso(iso * (fTo / f) ** 2, limits);
        if (isoTo > iso) {
          changes.push({ setting: "iso", from: iso, to: isoTo });
          actions.push({ lever: "iso", value: isoTo });
          tradeOff = "Less light gets in, so ISO goes up. A little more grain.";
        }
      }
      return { changes, actions: [...actions, ...focusSteps], tradeOff };
    }

    case "grain": {
      if (starved) {
        const plan = shaky ? steadier(want, true) : exposure(1, exposureStops(other("dark"), stats), true);
        return { ...plan, goal: "More light" };
      }
      const from = iso ?? limits.isoMin * 16;
      let isoTo = snapIso(Math.max(limits.isoMin, from / 4), limits);
      const changes: Change[] = [];
      const actions: Action[] = [];
      let shutterTo: number | undefined;
      if (manual && t !== undefined) {
        // In M the shutter has to make up for the lower ISO, and only goes as slow as is
        // hand-holdable, so ISO only drops as far as the shutter can follow.
        shutterTo = snapShutterSlower(t * (from / isoTo), limit);
        if (shutterTo <= t * 1.01) shutterTo = t;
        isoTo = Math.max(isoTo, snapIso(from * (t / shutterTo), limits));
      } else if (meta?.mode === "shutter" && f !== undefined) {
        // In S the camera opens the lens to make up for it, as far as the lens goes.
        isoTo = Math.max(isoTo, snapIso(from / 2 ** openRoom, limits));
      }
      if (isoTo >= from) {
        return { changes: [], actions: [{ lever: "steady" }], goal: "More light", tradeOff: "Grain means too little light. Add light, or use a tripod and a lower ISO." };
      }
      changes.push({ setting: "iso", from: iso, to: isoTo });
      actions.push({ lever: "iso", value: isoTo });
      if (shutterTo !== undefined && t !== undefined && shutterTo > t * 1.01) {
        changes.push({ setting: "shutter", from: t, to: shutterTo });
        actions.push({ lever: "shutter", value: shutterTo });
      }
      return { changes, actions, tradeOff: "Lower ISO needs a slower shutter. Brace yourself or use a tripod." };
    }
  }
}

const WIDER = "The lens opens wider, so less of the scene is sharp.";

/** "About 2 stops darker than it should be." */
function shortOf(stops: number): string {
  const n = Math.round(stops);
  return n <= 1 ? "Still a little dark." : `Still about ${n} stops too dark.`;
}

/**
 * The widest aperture the lens opens to at this focal length, from the lens name when it says
 * ("FE 28-70mm F3.5-5.6"), otherwise what kit zooms manage. Never narrower than the photo used.
 */
export function widestAperture(meta?: PhotoMeta): number {
  const f = meta?.fNumber ?? 22;
  const focal = meta?.focalLength;
  const zoom = meta?.lens?.match(/(\d+)-(\d+)\s*mm.*?F\s*([\d.]+)(?:-([\d.]+))?/i);
  const prime = meta?.lens?.match(/(\d+)\s*mm.*?F\s*([\d.]+)/i);
  let widest: number;
  if (zoom) {
    const [lo, hi, a, b] = [Number(zoom[1]), Number(zoom[2]), Number(zoom[3]), Number(zoom[4] ?? zoom[3])];
    const at = focal === undefined || hi <= lo ? 1 : clamp((focal - lo) / (hi - lo), 0, 1);
    widest = a + (b - a) * at;
  } else if (prime) {
    widest = Number(prime[2]);
  } else {
    widest = focal === undefined ? 5.6 : focal <= 35 ? 3.5 : focal <= 70 ? 4.5 : 5.6;
  }
  return Math.min(widest, f);
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
  // A blown-out moon or lamp is usually several stops over: its brightness can't say how many.
  if (issue.darkScene) return 3;
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

/** The listed aperture closest to `f`, but never wider than `widest`. */
function snapApertureWider(f: number, widest: number): number {
  const ok = APERTURES.filter((a) => a >= widest * 0.97);
  return ok.reduce((best, a) => (Math.abs(Math.log2(a / f)) < Math.abs(Math.log2(best / f)) ? a : best), ok[0] ?? widest);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
