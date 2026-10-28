import { describe, expect, it } from "vitest";
import { identifyDevice } from "@/lib/devices";

describe("identifyDevice", () => {
  it("knows the MVP devices", () => {
    expect(identifyDevice("SONY", "ILCE-7M2")?.supported).toBe(true);
    expect(identifyDevice("Apple", "iPhone 18 Pro")?.supported).toBe(true);
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
