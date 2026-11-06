import { describe, expect, it } from "vitest";
import type { Issue, IssueKind } from "@/lib/analysis/checks";
import type { ImageStats } from "@/lib/analysis/measure";
import { KNOWN_DEVICES, identifyDevice } from "@/lib/devices";
import type { PhotoMeta } from "@/lib/exif";
import { solveFix, widestAperture, type Change, type Fix } from "@/lib/fixes/solver";
import { formatChange, stepsFor } from "@/lib/fixes/steps";
import { guideFor } from "@/lib/instructions";

const sony = identifyDevice("SONY", "ILCE-7M2");
const iphone = identifyDevice("Apple", "iPhone 18 Pro");

function meta(over: Partial<PhotoMeta> = {}): PhotoMeta {
  return { device: sony, exposureTime: 1 / 30, fNumber: 5.6, iso: 100, focalLength: 50, mode: "aperture", hasSettings: true, ...over };
}

function issue(kind: IssueKind, severity: Issue["severity"] = "big"): Issue {
  return { kind, severity, title: "", why: "", area: [] };
}

const stats = (meanLuma: number) => ({ meanLuma }) as ImageStats;

function fixFor(kind: IssueKind, m: PhotoMeta, s?: ImageStats) {
  const guide = guideFor(m.device);
  const fix = solveFix(issue(kind), m, s, guide);
  return { fix, steps: stepsFor(fix, guide, m.mode).map((st) => st.text) };
}

describe("solveFix on the Sony α7 II", () => {
  it("brightens with the exposure dial in A, and raises ISO when the shutter would get too slow", () => {
    const { fix, steps } = fixFor("dark", meta(), stats(40));
    // 1/30s × 8 is too slow even with the α7 II's stabilisation (about 1/12s at 50mm).
    expect(fix.changes).toEqual([
      { setting: "ev", from: undefined, to: 3 },
      { setting: "iso", from: 100, to: 400 },
    ]);
    expect(steps).toEqual(["Exposure dial to +3", "Press ISO on the wheel", "Turn the wheel to 400", "Press the center"]);
    expect(fix.tradeOff).toMatch(/grain/);
  });

  it("never suggests a faster shutter for a dark photo", () => {
    // M on a tripod: ISO already at the top, shutter already slower than hand-holdable.
    const { fix } = fixFor("dark", meta({ mode: "manual", iso: 6400, exposureTime: 1 / 4 }), stats(40));
    for (const c of fix.changes) {
      if (c.setting === "shutter") expect(c.to).toBeGreaterThan(c.from ?? 0);
      if (c.setting === "iso") expect(c.to).toBeGreaterThanOrEqual(c.from ?? 0);
    }
    expect(fix.changes.length).toBeGreaterThan(0);
  });

  it("gives a dark and grainy photo one plan that leaves ISO alone", () => {
    const m = meta({ iso: 3200, exposureTime: 1 / 60 });
    const guide = guideFor(m.device);
    const both = ["dark", "grain"] as const;
    const dark = solveFix(issue("dark"), m, stats(40), guide, [...both]);
    const grain = solveFix(issue("grain"), m, stats(40), guide, [...both]);
    expect(dark.changes).toEqual([{ setting: "ev", from: undefined, to: 3 }]);
    expect(grain.changes).toEqual(dark.changes);
    expect(grain.tradeOff).toMatch(/tripod/);

    const manual = meta({ iso: 3200, exposureTime: 1 / 60, mode: "manual" });
    const inM = solveFix(issue("grain"), manual, stats(40), guide, [...both]);
    expect(inM.changes).toEqual([{ setting: "shutter", from: 1 / 60, to: 1 / 8 }]);
  });

  it("raises ISO in M, where the exposure dial does nothing", () => {
    const { fix, steps } = fixFor("dark", meta({ mode: "manual", exposureTime: 1 / 125 }), stats(60));
    expect(fix.changes).toEqual([{ setting: "iso", from: 100, to: 400 }]);
    expect(steps[0]).toBe("Press ISO on the wheel");
  });

  it("undoes exposure compensation on a bright photo", () => {
    const { fix, steps } = fixFor("bright", meta({ exposureComp: 1 }), stats(185));
    expect(fix.changes).toEqual([{ setting: "ev", from: 1, to: 0 }]);
    expect(steps).toEqual(["Exposure dial to 0"]);
  });

  it("fixes shake with a faster shutter in S, and ISO to keep the brightness", () => {
    const { fix, steps } = fixFor("shake", meta());
    expect(fix.changes).toEqual([
      { setting: "shutter", from: 1 / 30, to: 1 / 125 },
      { setting: "iso", from: 100, to: 400 },
    ]);
    expect(steps.slice(0, 2)).toEqual(["Mode dial to S", "Turn the rear dial to 1/125"]);
    expect(formatChange(fix.changes[0])).toEqual({ from: "1/30s", to: "1/125s" });
    expect(formatChange(fix.changes[1])).toEqual({ from: "ISO 100", to: "400" });
  });

  it("keeps ISO within what the sensor handles well", () => {
    const { fix } = fixFor("shake", meta({ iso: 3200, exposureTime: 1 / 8 }));
    expect(fix.changes[1]).toEqual({ setting: "iso", from: 3200, to: 6400 });
  });

  it("goes faster still when the shutter was already quick", () => {
    const { fix, steps } = fixFor("shake", meta({ mode: "shutter", exposureTime: 1 / 250 }));
    expect(fix.changes[0].to).toBeCloseTo(1 / 1000);
    expect(steps[0]).toBe("Turn the rear dial to 1/1000");
  });

  it("sets AF-S and a spot for missed focus, and stops down a wide aperture", () => {
    expect(fixFor("focus", meta()).steps).toEqual([
      "Press Fn",
      "Focus Mode: AF-S",
      "Focus Area: Flexible Spot",
      "Half-press until the box goes green",
    ]);
    const wide = fixFor("focus", meta({ fNumber: 1.8, mode: "program" }));
    expect(wide.fix.changes).toEqual([{ setting: "aperture", from: 1.8, to: 3.5 }]);
    expect(wide.steps.slice(0, 2)).toEqual(["Mode dial to A", "Turn the front dial to f/3.5"]);
  });

  it("lowers ISO for grain, and slows the shutter in M only as far as is hand-holdable", () => {
    expect(fixFor("grain", meta({ iso: 3200 })).fix.changes).toEqual([{ setting: "iso", from: 3200, to: 800 }]);
    const m = fixFor("grain", meta({ iso: 3200, mode: "manual", exposureTime: 1 / 200 }));
    expect(m.fix.changes).toEqual([
      { setting: "iso", from: 3200, to: 800 },
      { setting: "shutter", from: 1 / 200, to: 1 / 50 },
    ]);
  });

  it("highlights a real control for every step it highlights", () => {
    const guide = guideFor(sony);
    for (const kind of ["dark", "bright", "shake", "focus", "grain"] as const) {
      for (const step of stepsFor(solveFix(issue(kind), meta({ fNumber: 2 }), stats(50), guide), guide)) {
        if (step.control) expect(guide.diagram?.controls[step.control], step.text).toBeDefined();
      }
    }
  });
});

describe("solveFix on the iPhone 18 Pro", () => {
  const phone = (over: Partial<PhotoMeta> = {}) => meta({ device: iphone, mode: "program", fNumber: 1.8, focalLength35: 24, ...over });

  it("uses Camera app gestures, never ISO", () => {
    const { fix, steps } = fixFor("dark", phone({ exposureTime: 1 / 60, iso: 200 }));
    expect(fix.changes).toEqual([]);
    expect(fix.goal).toBe("Brighter");
    expect(steps).toEqual(["Tap the subject", "Drag the sun up"]);
  });

  it("suggests Night mode in low light, and 1x when zoomed in", () => {
    const { steps } = fixFor("dark", phone({ exposureTime: 1 / 15, iso: 1600, focalLength35: 120 }));
    expect(steps).toEqual(["Tap 1x", "Tap the subject", "Drag the sun up", "Tap the moon, then hold still"]);
  });

  it("shortens Night mode for shake on long exposures", () => {
    expect(fixFor("shake", phone({ exposureTime: 1 })).steps[0]).toBe("Tap the moon, pick a shorter time");
  });

  it("marks gestures not yet checked on the iPhone 18 Pro", () => {
    const guide = guideFor(iphone);
    const steps = stepsFor(solveFix(issue("bright"), phone(), undefined, guide), guide);
    expect(steps.every((s) => s.assumed)).toBe(true);
  });
});

describe("solveFix on the Canon Rebel XT", () => {
  const canon = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
  const rebel = (over: Partial<PhotoMeta> = {}) => meta({ device: canon, ...over });

  it("brightens with Av± and the main dial, within its ±2 range", () => {
    const { fix, steps } = fixFor("dark", rebel({ exposureTime: 1 / 250 }), stats(30));
    expect(fix.changes).toEqual([{ setting: "ev", from: undefined, to: 2 }]);
    expect(steps).toEqual(["Hold Av±, turn the main dial to +2"]);
  });

  it("never suggests ISO above 1600, so the shutter only goes as fast as the light allows", () => {
    const { fix, steps } = fixFor("shake", rebel({ mode: "shutter", iso: 800, exposureTime: 1 / 15 }));
    // 1/125 would need 3 stops of light: ISO has 1 left and the lens about ⅔ at 50mm.
    expect(fix.changes).toEqual([
      { setting: "shutter", from: 1 / 15, to: 1 / 50 },
      { setting: "iso", from: 800, to: 1600 },
    ]);
    expect(steps).toEqual(["Turn the main dial to 1/50", "Press ISO on the cross keys", "Press ◀ or ▶ to 1600", "Press SET"]);
    expect(fix.tradeOff).toMatch(/as fast as the light allows/i);
  });

  it("names the modes as the Canon dial does", () => {
    expect(fixFor("shake", rebel({ mode: "program" })).steps[0]).toBe("Mode dial to Tv");
    expect(fixFor("focus", rebel({ mode: "program", fNumber: 1.8 })).steps.slice(0, 2)).toEqual([
      "Mode dial to Av",
      "Turn the main dial to f/3.5",
    ]);
  });

  it("uses Av± for the aperture in M, where the main dial sets the shutter", () => {
    const { steps } = fixFor("focus", rebel({ mode: "manual", fNumber: 1.8 }));
    expect(steps.slice(0, 1)).toEqual(["Hold Av±, turn the main dial to f/3.5"]);
    expect(steps).toContain("Press the AF point button");
  });

  it("switches M to Av for exposure compensation", () => {
    const { steps } = fixFor("bright", rebel({ mode: "manual", iso: undefined }), stats(220));
    expect(steps).toEqual(["Mode dial to Av", "Hold Av±, turn the main dial to -2"]);
  });

  it("highlights a real control for every step it highlights, and marks unchecked key positions", () => {
    const guide = guideFor(canon);
    for (const mode of ["program", "aperture", "shutter", "manual"] as const) {
      for (const kind of ["dark", "bright", "shake", "focus", "grain"] as const) {
        const m = rebel({ mode, fNumber: 2 });
        const steps = stepsFor(solveFix(issue(kind), m, stats(50), guide), guide, m.mode);
        expect(steps.length, `${kind} in ${mode}`).toBeGreaterThan(0);
        for (const step of steps) {
          if (step.control) expect(guide.diagram?.controls[step.control], step.text).toBeDefined();
        }
      }
    }
    expect(guide.kind === "camera" && guide.levers.iso[0].assumed).toBe(true);
  });
});

/** How much brighter the photo gets, in stops, from changes to settings set by hand (M). */
function stopsBrighter(changes: Change[]): number {
  return changes.reduce((sum, c) => {
    const from = c.from ?? c.to;
    if (c.setting === "iso" || c.setting === "shutter") return sum + Math.log2(c.to / from);
    if (c.setting === "aperture") return sum + 2 * Math.log2(from / c.to);
    return sum;
  }, 0);
}

const kindsOf = (f: Fix) => f.changes.map((c) => c.setting);

describe("solveFix keeps the exposure balanced", () => {
  const canon = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
  const rebel = (over: Partial<PhotoMeta> = {}) => meta({ device: canon, focalLength: 28, ...over });
  const solve = (kind: IssueKind, m: PhotoMeta, found: (Issue | IssueKind)[] = [], s?: ImageStats, base = issue(kind)) => {
    const guide = guideFor(m.device);
    const fix = solveFix(base, m, s, guide, found);
    return { fix, steps: stepsFor(fix, guide, m.mode).map((st) => st.text) };
  };

  it("never leaves a photo darker when fixing shake in M", () => {
    for (const device of [sony, canon]) {
      for (const t of [1 / 2, 1 / 8, 1 / 30, 1 / 60]) {
        for (const iso of [100, 400, 1600]) {
          for (const fNumber of [2.8, 5.6, 11]) {
            const { fix } = solve("shake", meta({ device, mode: "manual", exposureTime: t, iso, fNumber }));
            expect(stopsBrighter(fix.changes), `${device?.id} ${t}s ISO ${iso} f/${fNumber}`).toBeGreaterThan(-0.5);
          }
        }
      }
    }
  });

  it("opens the lens and goes only as fast as the light allows, instead of a darker photo", () => {
    // The report's IMG_7311 case in M: 0.3s at f/11 is 5 stops slower than 1/125.
    const { fix, steps } = solve("shake", rebel({ mode: "manual", exposureTime: 0.3, fNumber: 11, iso: 400, focalLength: 135 }));
    expect(stopsBrighter(fix.changes)).toBeGreaterThan(-0.5);
    expect(kindsOf(fix)).toEqual(["shutter", "iso", "aperture"]);
    expect(fix.changes[2]).toEqual({ setting: "aperture", from: 11, to: 5.6 });
    expect(steps).toContain("Hold Av±, turn the main dial to f/5.6");
    expect(fix.tradeOff).toMatch(/as fast as the light allows/i);
  });

  it("braces instead when there's no light to spare for a faster shutter", () => {
    const { fix, steps } = solve("shake", rebel({ mode: "shutter", iso: 1600, exposureTime: 1 / 15, fNumber: 3.5 }));
    expect(fix.changes).toEqual([]);
    expect(steps).toEqual(["Use a tripod, or brace on a wall"]);
    expect(fix.goal).toBe("Hold steadier");
    expect(fix.tradeOff).toMatch(/too dark for a faster shutter/i);
  });

  it("gives a dark and blurry photo one plan, so the two fixes don't fight", () => {
    const m = rebel({ mode: "shutter", exposureTime: 1 / 15, fNumber: 3.5, iso: 400 });
    const found: IssueKind[] = ["dark", "shake"];
    const dark = solve("dark", m, found, stats(40));
    const shake = solve("shake", m, found, stats(40));
    expect(dark.fix.changes).toEqual(shake.fix.changes);
    // Brighter by raising ISO, not by a slower shutter.
    expect(dark.fix.changes.find((c) => c.setting === "shutter")?.to ?? 0).toBeLessThanOrEqual(1 / 15);
    expect(dark.fix.changes).toContainEqual({ setting: "iso", from: 400, to: 1600 });
  });

  it("raises ISO in S when the lens is already wide open", () => {
    // The 0.8s, f/5.6, 135mm night shot (IMG_7367): exposure comp alone can't open the lens further.
    const { fix } = solve("dark", rebel({ mode: "shutter", exposureTime: 0.8, fNumber: 5.6, focalLength: 135 }), [], stats(25));
    expect(fix.changes).toEqual([
      { setting: "ev", from: undefined, to: 2 },
      { setting: "iso", from: 100, to: 400 },
    ]);
  });

  it("darkens with the shutter in S when the lens is already at its smallest opening", () => {
    // The 1s, f/22 snow frames (IMG_7374): the camera can't close the lens any more.
    const { fix, steps } = solve("bright", rebel({ mode: "shutter", exposureTime: 1, fNumber: 22 }), [], stats(220));
    expect(fix.changes).toEqual([
      { setting: "shutter", from: 1, to: 1 / 4 },
      { setting: "ev", from: undefined, to: -2 },
    ]);
    expect(steps[0]).toBe("Turn the main dial to 1/4");
  });

  it("makes up for stopping down in M, so a focus fix doesn't darken the photo", () => {
    const { fix } = solve("focus", meta({ mode: "manual", fNumber: 1.8, iso: 200 }));
    expect(fix.changes).toEqual([
      { setting: "aperture", from: 1.8, to: 3.5 },
      { setting: "iso", from: 200, to: 800 },
    ]);
  });

  it("lowers ISO for grain in M only as far as the shutter can follow", () => {
    // 1/15s at 28mm is already slower than hand-holdable on the Rebel XT: no room to slow it.
    const { fix, steps } = solve("grain", rebel({ mode: "manual", iso: 1600, exposureTime: 1 / 15 }));
    expect(fix.changes).toEqual([]);
    expect(fix.goal).toBe("More light");
    expect(steps).toEqual(["Use a tripod, or brace on a wall"]);
  });

  it("goes slower than hand-holdable in M once ISO and the lens are maxed out, and says so", () => {
    const { fix } = solve("dark", rebel({ mode: "manual", iso: 1600, exposureTime: 1 / 30, fNumber: 3.5 }), [], stats(40));
    expect(fix.changes).toEqual([{ setting: "shutter", from: 1 / 30, to: 1 / 4 }]);
    expect(fix.tradeOff).toMatch(/tripod/);
  });

  it("says plainly when even that isn't enough", () => {
    const { fix } = solve("dark", rebel({ mode: "manual", iso: 1600, exposureTime: 1 / 2, fNumber: 3.5 }), [], stats(5));
    expect(fix.changes).toEqual([{ setting: "shutter", from: 1 / 2, to: 1 }]);
    expect(fix.tradeOff).toMatch(/still about 2 stops too dark/i);
  });
});

describe("solveFix for dark scenes", () => {
  const canon = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
  const moon: Issue = { ...issue("bright"), title: "Bright spot blown out", darkScene: true };
  const moonMeta = (over: Partial<PhotoMeta> = {}) =>
    meta({ device: canon, mode: "program", exposureTime: 1 / 13, fNumber: 5.6, iso: 400, focalLength: 135, ...over });

  it("turns exposure down for a blown-out moon, never up", () => {
    const guide = guideFor(canon);
    const fix = solveFix(moon, moonMeta(), stats(2), guide, [moon]);
    expect(fix.changes).toEqual([{ setting: "ev", from: undefined, to: -2 }]);
    expect(stepsFor(fix, guide, "program").map((s) => s.text)).toEqual(["Hold Av±, turn the main dial to -2"]);
    expect(fix.tradeOff).toBe("Still white? Go darker again.");
  });

  it("lets a faster shutter darken a blurry moon, without raising ISO to make up for it", () => {
    const guide = guideFor(canon);
    const m = moonMeta({ mode: "shutter", exposureTime: 1 / 20 });
    const found = [moon, issue("shake", "small")];
    const bright = solveFix(moon, m, stats(2), guide, found);
    const shake = solveFix(found[1], m, stats(2), guide, found);
    expect(bright.changes).toEqual(shake.changes);
    expect(bright.changes.find((c) => c.setting === "shutter")?.to).toBeCloseTo(1 / 160);
    expect(bright.changes.some((c) => c.setting === "iso")).toBe(false);
    expect(bright.changes).toContainEqual({ setting: "ev", from: undefined, to: -2 });
  });
});

describe("solveFix with flash", () => {
  const canon = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
  const flashed = (over: Partial<PhotoMeta> = {}) =>
    meta({ device: canon, mode: "program", flashFired: true, exposureTime: 1 / 60, fNumber: 4, iso: 400, focalLength: 28, ...over });

  it("uses flash compensation and ISO for a dark flash photo, not exposure compensation", () => {
    const guide = guideFor(canon);
    const fix = solveFix(issue("dark", "small"), flashed(), stats(80), guide, ["dark"]);
    expect(fix.changes).toEqual([
      { setting: "iso", from: 400, to: 800 },
      { setting: "flash", to: 1 },
    ]);
    expect(formatChange(fix.changes[1])).toEqual({ to: "Flash +1" });
    const steps = stepsFor(fix, guide, "program");
    expect(steps.map((s) => s.text)).toEqual([
      "Press ISO on the cross keys",
      "Press ◀ or ▶ to 800",
      "Press SET",
      "Press MENU",
      "Pick Flash exp comp, press SET",
      "Press ◀ or ▶ to +1",
      "Press SET",
    ]);
    expect(steps.find((s) => s.text.startsWith("Pick Flash"))?.assumed).toBe(true);
    expect(fix.tradeOff).toMatch(/step closer/);
  });

  it("turns the flash down for a bright flash photo", () => {
    const fix = solveFix(issue("bright", "small"), flashed(), stats(185), guideFor(canon), ["bright"]);
    expect(fix.changes).toEqual([{ setting: "flash", to: -1 }]);
  });

  it("never sets a shutter faster than the flash can keep up with", () => {
    for (const exposureTime of [1 / 15, 1 / 60, 1 / 200]) {
      const fix = solveFix(issue("shake"), flashed({ mode: "shutter", exposureTime }), undefined, guideFor(canon), ["shake"]);
      const shutter = fix.changes.find((c) => c.setting === "shutter");
      if (shutter) expect(shutter.to).toBeGreaterThanOrEqual(1 / 200 - 1e-9);
    }
    // Already at 1/200s (the report's IMG_7241): brace instead of an impossible 1/800s.
    const at = solveFix(issue("shake"), flashed({ exposureTime: 1 / 200, fNumber: 16 }), undefined, guideFor(canon), ["shake"]);
    expect(at.changes).toEqual([]);
    expect(at.actions).toEqual([{ lever: "steady" }]);
  });

  it("has flash compensation steps on every camera guide", () => {
    for (const device of [sony, canon, identifyDevice("Nikon", "Z 50")]) {
      const guide = guideFor(device);
      const fix = solveFix(issue("dark"), flashed({ device, iso: 6400 }), stats(30), guide, ["dark"]);
      expect(stepsFor(fix, guide, "program").some((s) => s.text.includes("+2")), guide.id).toBe(true);
    }
  });
});

describe("widestAperture", () => {
  it("reads the lens name, and guesses from the focal length otherwise", () => {
    expect(widestAperture(meta({ lens: "FE 28-70mm F3.5-5.6 OSS", focalLength: 28, fNumber: 8 }))).toBeCloseTo(3.5);
    expect(widestAperture(meta({ lens: "FE 28-70mm F3.5-5.6 OSS", focalLength: 70, fNumber: 8 }))).toBeCloseTo(5.6);
    expect(widestAperture(meta({ lens: "FE 50mm F1.8", focalLength: 50, fNumber: 8 }))).toBeCloseTo(1.8);
    expect(widestAperture(meta({ lens: undefined, focalLength: 135, fNumber: 11 }))).toBe(5.6);
    // Never narrower than what the photo was taken at.
    expect(widestAperture(meta({ lens: undefined, focalLength: 50, fNumber: 1.8 }))).toBe(1.8);
  });
});

describe("guideFor", () => {
  it("has a guide for every supported device", () => {
    for (const d of KNOWN_DEVICES) expect(guideFor(identifyDevice(...exifFor(d.id)))?.id).toBe(d.id);
  });

  it("falls back to general steps", () => {
    expect(guideFor(identifyDevice("Canon", "Canon EOS R50")).id).toBe("generic-camera");
    expect(guideFor(identifyDevice("Google", "Pixel 9")).id).toBe("generic-phone");
    expect(guideFor(null).id).toBe("generic-camera");
    const { steps } = fixFor("shake", meta({ device: null }));
    expect(steps[0]).toBe("Mode dial to S or Tv");
  });
});

function exifFor(id: string): [string, string] {
  const exif: Record<string, [string, string]> = {
    "sony-ilce-7m2": ["SONY", "ILCE-7M2"],
    "apple-iphone-18-pro": ["Apple", "iPhone 18 Pro"],
    "canon-eos-350d": ["Canon", "Canon EOS DIGITAL REBEL XT"],
  };
  return exif[id];
}
