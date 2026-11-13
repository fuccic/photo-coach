import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { findIssues } from "@core/analysis/checks";
import { measure } from "@core/analysis/measure";
import { readPhotoMeta } from "@core/exif";
import { base64ToBytes, measureJpeg } from "@/lib/decode";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url)));

describe("base64ToBytes", () => {
  it("matches Node's decoder, padded or not", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      const b64 = Buffer.from(bytes).toString("base64");
      expect(base64ToBytes(b64)).toEqual(bytes);
      expect(base64ToBytes(b64.replace(/=+$/, ""))).toEqual(bytes);
    }
  });
});

describe("measureJpeg", () => {
  it("gives the same numbers as measuring the decoded pixels", () => {
    const bytes = fixture("sony-a7ii.jpg");
    const { data, width, height } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    expect(measureJpeg(bytes)).toEqual(measure(data, width, height));
  });

  it("keeps the verdict through the phone's full-quality JPEG round trip", async () => {
    const bytes = fixture("sony-a7ii.jpg");
    const meta = await readPhotoMeta(bytes);
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    const again = jpeg.encode({ data: decoded.data, width: decoded.width, height: decoded.height }, 100).data;
    const kinds = (b: Uint8Array) => findIssues(measureJpeg(b), meta).map((i) => `${i.severity}:${i.kind}`);
    expect(kinds(new Uint8Array(again))).toEqual(kinds(bytes));
  });
});

describe("reading settings on the phone", () => {
  it("reads camera and settings from the first bytes of the file", async () => {
    const meta = await readPhotoMeta(fixture("sony-a7ii.jpg").subarray(0, 1024 * 1024));
    expect(meta.device?.id).toBe("sony-ilce-7m2");
    expect(meta.hasSettings).toBe(true);
  });
});
