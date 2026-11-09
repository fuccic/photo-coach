import { describe, expect, it } from "vitest";
import { equivalentFocal, identifyDevice, isStabilized } from "@/lib/devices";
import { handHeldLimit } from "@/lib/analysis/checks";

describe("identifyDevice", () => {
  it("knows the MVP devices", () => {
    expect(identifyDevice("SONY", "ILCE-7M2")?.supported).toBe(true);
    expect(identifyDevice("Apple", "iPhone 18 Pro")?.supported).toBe(true);
  });

  it("knows the Canon Rebel XT by all three of its names", () => {
    for (const model of ["Canon EOS DIGITAL REBEL XT", "Canon EOS 350D DIGITAL", "Canon EOS Kiss Digital N"]) {
      expect(identifyDevice("Canon", model), model).toEqual({ id: "canon-eos-350d", name: "Canon Rebel XT", kind: "camera", supported: true });
    }
    expect(identifyDevice("Canon", "Canon EOS DIGITAL REBEL XTi")?.supported).toBe(false);
    expect(isStabilized(identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT"))).toBe(false);
  });

  it("does not confuse close relatives", () => {
    expect(identifyDevice("SONY", "ILCE-7RM2")?.supported).toBe(false);
    expect(identifyDevice("Apple", "iPhone 18 Pro Max")?.supported).toBe(false);
  });

  it("names unknown devices from Make and Model", () => {
    expect(identifyDevice("Canon", "Canon EOS R50")).toMatchObject({ name: "Canon EOS R50", kind: "camera", supported: false });
    expect(identifyDevice("NIKON CORPORATION", "NIKON Z 50")).toMatchObject({ name: "NIKON Z 50" });
    expect(identifyDevice("Apple", "iPhone 7")).toMatchObject({ name: "iPhone 7", kind: "phone", supported: false });
    expect(identifyDevice("Google", "Pixel 9")).toMatchObject({ name: "Google Pixel 9", kind: "phone" });
  });

  it("returns null without Make or Model", () => {
    expect(identifyDevice(undefined, "  ")).toBeNull();
  });
});

describe("equivalentFocal", () => {
  const rebel = identifyDevice("Canon", "Canon EOS DIGITAL REBEL XT");
  const sony = identifyDevice("SONY", "ILCE-7M2");
  const iphone = identifyDevice("Apple", "iPhone 18 Pro");

  it("multiplies by the camera's crop factor", () => {
    expect(equivalentFocal({ device: rebel, focalLength: 50 })).toBeCloseTo(80);
    expect(equivalentFocal({ device: sony, focalLength: 50 })).toBe(50);
  });

  it("trusts the 35mm figure in EXIF when there is one", () => {
    expect(equivalentFocal({ device: rebel, focalLength: 50, focalLength35: 81 })).toBe(81);
    expect(equivalentFocal({ device: iphone, focalLength: 6.9, focalLength35: 24 })).toBe(24);
  });

  it("takes unknown cameras as full frame, and knows nothing for phones without a 35mm figure", () => {
    expect(equivalentFocal({ device: identifyDevice("Canon", "Canon EOS R50"), focalLength: 50 })).toBe(50);
    expect(equivalentFocal({ device: iphone, focalLength: 6.9 })).toBeUndefined();
    expect(equivalentFocal(undefined)).toBeUndefined();
  });

  it("asks for a faster shutter on the Rebel XT than on a full-frame camera with the same lens", () => {
    const base = { hasSettings: true, focalLength: 50 } as const;
    expect(handHeldLimit({ ...base, device: rebel })).toBeCloseTo(1 / 80);
    expect(handHeldLimit({ ...base, device: identifyDevice("Canon", "Canon EOS 5D") })).toBeCloseTo(1 / 50);
  });
});
