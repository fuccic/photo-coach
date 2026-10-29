import { describe, expect, it } from "vitest";
import { identifyDevice, isStabilized } from "@/lib/devices";

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
