import { describe, expect, it } from "vitest";
import type { Issue, IssueKind } from "@/lib/analysis/checks";
import type { ImageStats } from "@/lib/analysis/measure";
import { KNOWN_DEVICES, identifyDevice } from "@/lib/devices";
import type { PhotoMeta } from "@/lib/exif";
import { solveFix } from "@/lib/fixes/solver";
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

  it("highlights a real control for every step", () => {
    const guide = guideFor(sony);
    for (const kind of ["dark", "bright", "shake", "focus", "grain"] as const) {
      for (const step of stepsFor(solveFix(issue(kind), meta({ fNumber: 2 }), stats(50), guide), guide)) {
        expect(guide.diagram?.controls[step.control ?? ""], step.text).toBeDefined();
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

  it("never suggests ISO above 1600", () => {
    const { fix, steps } = fixFor("shake", rebel({ mode: "shutter", iso: 800, exposureTime: 1 / 15 }));
    expect(fix.changes).toEqual([
      { setting: "shutter", from: 1 / 15, to: 1 / 125 },
      { setting: "iso", from: 800, to: 1600 },
    ]);
    expect(steps).toEqual(["Turn the main dial to 1/125", "Press ISO (▲) on the cross keys", "Press ▲ or ▼ to 1600", "Press SET"]);
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

  it("highlights a real control for every step it highlights", () => {
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
  });
});

describe("manual links", () => {
  const cameras = [sony, identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT")].map((d) => guideFor(d));

  it("link every camera step group to its own page of the maker's manual", () => {
    for (const guide of cameras) {
      if (guide.kind !== "camera") throw new Error(guide.id);
      expect(guide.manual?.url, guide.id).toMatch(/^https:\/\//);
      for (const [lever, steps] of Object.entries(guide.levers)) {
        const links = steps.filter((s) => s.manual);
        expect(links.length, `${guide.id} ${lever}`).toBeGreaterThan(0);
        for (const { manual } of links) expect(manual!.url.startsWith(guide.manual!.url.replace(/index\.html$/, "")), manual!.url).toBe(true);
      }
      expect(Object.values(guide.levers).flat().some((s) => s.assumed), guide.id).toBe(false);
    }
  });

  it("deep-links Sony Help Guide topics and Canon PDF pages", () => {
    const [a7, rebel] = cameras;
    if (a7.kind !== "camera" || rebel.kind !== "camera") throw new Error();
    expect(a7.levers.iso[0].manual).toEqual({ url: "https://helpguide.sony.net/ilc/1450/v1/en/contents/TP0000386492.html", label: "ISO" });
    expect(rebel.levers.iso[0].manual).toEqual({
      url: "https://gdlp01.c-wss.com/gds/8/0900000278/01/EOSDRXT350DIM-EN.pdf#page=55",
      label: "p. 55",
    });
  });

  it("carries the step's link through to the fix, once per setting", () => {
    const canon = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
    const guide = guideFor(canon);
    const m = meta({ device: canon, mode: "manual", fNumber: 1.8 });
    const steps = stepsFor(solveFix(issue("focus"), m, stats(50), guide), guide, m.mode);
    expect(steps[0].manual?.label).toBe("p. 86");
    expect(steps.filter((s) => s.manual?.label === "p. 70")).toHaveLength(1);
  });

  it("shows each device's manual on My cameras", () => {
    for (const d of KNOWN_DEVICES) expect(d.manual?.url, d.id).toMatch(/^https:\/\//);
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
