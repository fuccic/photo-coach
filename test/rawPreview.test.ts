import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractEmbeddedJpeg } from "@/lib/rawPreview";

describe("extractEmbeddedJpeg", () => {
  it("pulls the JPEG preview out of an ARW", async () => {
    const file = await readFile(new URL("./fixtures/sony-preview.arw", import.meta.url));
    const jpeg = extractEmbeddedJpeg(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    expect(jpeg).not.toBeNull();
    expect([jpeg![0], jpeg![1]]).toEqual([0xff, 0xd8]);
  });

  it("returns null for a non-TIFF file", async () => {
    const file = await readFile(new URL("./fixtures/sony-a7ii.jpg", import.meta.url));
    expect(extractEmbeddedJpeg(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))).toBeNull();
  });
});
