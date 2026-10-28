import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readPhotoMeta } from "@/lib/exif";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

describe("readPhotoMeta", () => {
  it("reads settings from a Sony α7 II JPEG", async () => {
    const meta = await readPhotoMeta(await fixture("sony-a7ii.jpg"));
    expect(meta.device).toEqual({ id: "sony-ilce-7m2", name: "Sony α7 II", kind: "camera", supported: true });
    expect(meta.exposureTime).toBeCloseTo(1 / 30);
    expect(meta.fNumber).toBe(5.6);
    expect(meta.iso).toBe(100);
    expect(meta.focalLength).toBe(35);
    expect(meta.exposureComp).toBeCloseTo(-1 / 3);
    expect(meta.mode).toBe("aperture");
    expect(meta.flashFired).toBe(false);
    expect(meta.lens).toBe("FE 28-70mm F3.5-5.6 OSS");
    expect(meta.takenAt?.getFullYear()).toBe(2026);
    expect(meta.hasSettings).toBe(true);
  });

  it("reads settings from an iPhone 18 Pro HEIC", async () => {
    const meta = await readPhotoMeta(await fixture("iphone-18-pro.heic"));
    expect(meta.device?.name).toBe("iPhone 18 Pro");
    expect(meta.device?.kind).toBe("phone");
    expect(meta.exposureTime).toBeCloseTo(1 / 120);
    expect(meta.fNumber).toBeCloseTo(1.7);
    expect(meta.iso).toBe(64);
    expect(meta.focalLength35).toBe(24);
    expect(meta.mode).toBe("program");
    expect(meta.hasSettings).toBe(true);
  });

  it("reads the camera from a Sony ARW", async () => {
    const meta = await readPhotoMeta(await fixture("sony-preview.arw"));
    expect(meta.device?.name).toBe("Sony α7 II");
  });

  it("reports missing settings instead of failing", async () => {
    const meta = await readPhotoMeta(await fixture("no-exif.jpg"));
    expect(meta.device).toBeNull();
    expect(meta.hasSettings).toBe(false);
  });

  it("treats a non-image file as having no settings", async () => {
    const meta = await readPhotoMeta(new TextEncoder().encode("not a photo"));
    expect(meta.hasSettings).toBe(false);
  });
});
