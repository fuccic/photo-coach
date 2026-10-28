import { describe, expect, it } from "vitest";
import { formatAperture, formatExposureComp, formatFocal, formatIso, formatShutter } from "@/lib/format";

describe("format", () => {
  it("formats shutter speeds the way cameras show them", () => {
    expect(formatShutter(1 / 30)).toBe("1/30s");
    expect(formatShutter(1 / 8000)).toBe("1/8000s");
    expect(formatShutter(0.5)).toBe("0.5s");
    expect(formatShutter(2)).toBe("2s");
    expect(formatShutter(0)).toBeUndefined();
  });

  it("formats aperture, ISO, focal length and exposure compensation", () => {
    expect(formatAperture(5.6)).toBe("f/5.6");
    expect(formatAperture(1.78)).toBe("f/1.8");
    expect(formatIso(100)).toBe("ISO 100");
    expect(formatFocal(6.765)).toBe("6.8mm");
    expect(formatExposureComp(-1 / 3)).toBe("-0.3 EV");
    expect(formatExposureComp(0.7)).toBe("+0.7 EV");
    expect(formatExposureComp(0)).toBe("0 EV");
  });
});
