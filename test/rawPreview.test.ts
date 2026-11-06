import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readPhotoMeta } from "@/lib/exif";
import { detectFormat } from "@/lib/fileTypes";
import { makePreview } from "@/lib/preview";
import { extractEmbeddedJpeg, extractRawPreview, jpegSize, withOrientation } from "@/lib/rawPreview";
import { buildTiff, fakeJpeg, type Entry, type Ifd } from "./helpers/tiff";

const toBuffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const exifIfd: Ifd = {
  entries: [
    { tag: 0x829a, rational: [[1, 400]] }, // ExposureTime
    { tag: 0x829d, rational: [[11, 1]] }, // FNumber
    { tag: 0x8822, short: [2] }, // ExposureProgram: program
    { tag: 0x8827, short: [400] }, // ISO
    { tag: 0x920a, rational: [[28, 1]] }, // FocalLength
  ],
};
const camera: Entry[] = [
  { tag: 0x010f, ascii: "Canon" },
  { tag: 0x0110, ascii: "Canon EOS DIGITAL REBEL XT" },
  { tag: 0x8769, ifds: [exifIfd] },
];
const strip = (jpeg: Uint8Array, compression = 6): Entry[] => [
  { tag: 0x0103, short: [compression] },
  { tag: 0x0111, offsetOf: jpeg },
  { tag: 0x0117, long: [jpeg.length] },
];

/** Laid out like a Rebel XT CR2: 1536×1024 preview in IFD0, thumbnail, small RGB image, lossless sensor data. */
function cr2({ orientation = 6, preview = fakeJpeg(1536, 1024) } = {}) {
  const thumb = fakeJpeg(160, 120);
  return buildTiff(
    {
      entries: [...camera, { tag: 0x0112, short: [orientation] }, ...strip(preview)],
      next: {
        entries: [{ tag: 0x0201, offsetOf: thumb }, { tag: 0x0202, long: [thumb.length] }],
        next: {
          entries: [{ tag: 0x0103, short: [6] }, { tag: 0x0111, offsetOf: new Uint8Array(64).fill(0x28) }, { tag: 0x0117, long: [64] }],
          next: { entries: strip(fakeJpeg(1758, 2328, 0xc3)) },
        },
      },
    },
    [0x43, 0x52, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00], // "CR", version 2, raw IFD offset
  );
}

/** Laid out like a Lightroom/Adobe DNG: 256px RGB thumbnail in IFD0, sensor data and a 1024px JPEG preview in SubIFDs. */
function dng(orientation = 8) {
  return buildTiff({
    entries: [
      ...camera,
      { tag: 0x00fe, long: [1] }, // SubfileType: reduced resolution
      { tag: 0x0100, long: [256] },
      { tag: 0x0101, long: [171] },
      { tag: 0x0103, short: [1] },
      { tag: 0x0112, short: [orientation] },
      {
        tag: 0x014a,
        ifds: [
          { entries: [{ tag: 0x00fe, long: [0] }, ...strip(fakeJpeg(3516, 2328, 0xc3), 7)] },
          { entries: [{ tag: 0x00fe, long: [1] }, ...strip(fakeJpeg(1024, 683), 7)] },
        ],
      },
    ],
  });
}

describe("extractRawPreview", () => {
  it("pulls the JPEG preview out of an ARW", async () => {
    const file = await readFile(new URL("./fixtures/sony-preview.arw", import.meta.url));
    const jpeg = extractEmbeddedJpeg(toBuffer(file));
    expect(jpeg).not.toBeNull();
    expect([jpeg![0], jpeg![1]]).toEqual([0xff, 0xd8]);
  });

  it("returns null for a non-TIFF file", async () => {
    const file = await readFile(new URL("./fixtures/sony-a7ii.jpg", import.meta.url));
    expect(extractRawPreview(toBuffer(file))).toBeNull();
  });

  it("picks the large preview in a Canon CR2, not the thumbnail or the undecodable sensor data", () => {
    const preview = extractRawPreview(toBuffer(cr2({ orientation: 1 })));
    expect(preview).not.toBeNull();
    expect([preview!.width, preview!.height]).toEqual([1536, 1024]);
    expect(jpegSize(preview!.jpeg, 0, preview!.jpeg.length)).toEqual({ width: 1536, height: 1024 });
  });

  it("finds the preview in a DNG's SubIFDs", () => {
    const preview = extractRawPreview(toBuffer(dng(1)));
    expect([preview!.width, preview!.height]).toEqual([1024, 683]);
  });

  it("carries the camera's orientation into the preview", () => {
    const preview = extractRawPreview(toBuffer(cr2({ orientation: 6 })))!;
    // Portrait shot: reported upright, and the JPEG now holds an EXIF orientation of 6.
    expect([preview.width, preview.height]).toEqual([1024, 1536]);
    expect(String.fromCharCode(...preview.jpeg.subarray(6, 10))).toBe("Exif");
    expect(preview.jpeg[30]).toBe(6);
    expect(jpegSize(preview.jpeg, 0, preview.jpeg.length)).toEqual({ width: 1536, height: 1024 });

    const turnedDng = extractRawPreview(toBuffer(dng(8)))!;
    expect([turnedDng.width, turnedDng.height]).toEqual([683, 1024]);
  });

  it("leaves a preview's own EXIF alone", () => {
    const ownExif = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    const jpeg = fakeJpeg(100, 50, 0xc0, ownExif);
    expect(withOrientation(jpeg, 6)).toBe(jpeg);
    expect(withOrientation(fakeJpeg(100, 50), 1)).toHaveLength(fakeJpeg(100, 50).length);
  });

  it("returns null when the only JPEG is lossless sensor data", () => {
    const file = buildTiff({ entries: [...camera, ...strip(fakeJpeg(3516, 2328, 0xc3))] });
    expect(extractRawPreview(toBuffer(file))).toBeNull();
  });

  it("only trusts a partial read when everything it needs is inside it", () => {
    const whole = cr2({ orientation: 1 });
    const sensorStart = whole.length - fakeJpeg(1758, 2328, 0xc3).length;
    // Cut inside the sensor data: it is recognised as undecodable from its header, so the preview stands.
    expect(extractRawPreview(toBuffer(whole.slice(0, sensorStart + 20)), true)?.width).toBe(1536);
    // Cut before the sensor data starts: can't tell, so ask for the whole file.
    expect(extractRawPreview(toBuffer(whole.slice(0, sensorStart)), true)).toBeNull();
  });

  it("survives IFDs that point at each other", () => {
    const file = cr2({ orientation: 1 });
    // Point IFD0's "next IFD" back at IFD0.
    const view = new DataView(file.buffer);
    const ifd0 = view.getUint32(4, true);
    const count = view.getUint16(ifd0, true);
    view.setUint32(ifd0 + 2 + count * 12, ifd0, true);
    expect(extractRawPreview(toBuffer(file))?.width).toBe(1536);
  });
});

describe("CR2 and DNG files", () => {
  it("are recognised by extension and type", () => {
    expect(detectFormat("IMG_7386.CR2", "")).toBe("cr2");
    expect(detectFormat("photo", "image/x-canon-cr2")).toBe("cr2");
    expect(detectFormat("3rd Review-1.dng", "")).toBe("dng");
    expect(detectFormat("photo", "image/x-adobe-dng")).toBe("dng");
  });

  it("read the Rebel XT's settings from a CR2", async () => {
    const meta = await readPhotoMeta(cr2());
    expect(meta.device?.id).toBe("canon-eos-350d");
    expect(meta.exposureTime).toBeCloseTo(1 / 400);
    expect(meta.fNumber).toBe(11);
    expect(meta.iso).toBe(400);
    expect(meta.mode).toBe("program");
    expect(meta.hasSettings).toBe(true);
  });

  it("read the settings from a DNG without taking its thumbnail size as the photo's", async () => {
    const meta = await readPhotoMeta(new Blob([dng().slice()]));
    expect(meta.device?.id).toBe("canon-eos-350d");
    expect(meta.iso).toBe(400);
    expect(meta.width).toBeUndefined();
  });

  it("get a JPEG preview, or none when there is nothing to show", async () => {
    const preview = await makePreview(new Blob([cr2().slice()]), "IMG_0001.CR2");
    expect(preview).toBeInstanceOf(Blob);
    expect((preview as Blob).type).toBe("image/jpeg");
    expect(await makePreview(new Blob([new Uint8Array(100)]), "broken.dng")).toBeNull();
  });
});
