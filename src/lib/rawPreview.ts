/**
 * RAW files (Sony ARW, Canon CR2, DNG) are TIFF-based and carry one or more JPEG previews next to
 * the sensor data. Browsers can't decode the sensor data, so we show the largest preview instead.
 *
 * Previews are found two ways:
 * - JPEGInterchangeFormat (0x0201) / JPEGInterchangeFormatLength (0x0202): ARW, CR2 thumbnail.
 * - A single strip (0x0111 / 0x0117) with JPEG compression (6 or 7): CR2's 1536×1024 preview in
 *   IFD0, DNG previews in SubIFDs (0x014A).
 * Only baseline/progressive JPEGs count: CR2 and DNG store the sensor data as lossless JPEG
 * (SOF3), which also starts with FFD8 but no browser can decode.
 */

export type RawPreview = {
  /** A JPEG the browser can show, already carrying the RAW file's orientation. */
  jpeg: Uint8Array;
  width: number;
  height: number;
};

type Candidate = { start: number; length: number; width: number; height: number };

const TAG = {
  compression: 0x0103,
  stripOffsets: 0x0111,
  orientation: 0x0112,
  stripByteCounts: 0x0117,
  subIfds: 0x014a,
  jpegStart: 0x0201,
  jpegLength: 0x0202,
} as const;

/** Stops a corrupt file from sending us round in circles. */
const MAX_IFDS = 64;

/**
 * `buffer` may be just the start of the file (`partial`): then null is returned whenever something
 * points past its end, so the caller can retry with the whole file rather than miss a bigger preview.
 */
export function extractRawPreview(buffer: ArrayBuffer, partial = false): RawPreview | null {
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;

  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return null; // "II" or "MM"
  const le = order === 0x4949;
  if (view.getUint16(2, le) !== 42) return null;

  const bytes = new Uint8Array(buffer);
  let best: Candidate | null = null;
  let orientation = 1;
  const seen = new Set<number>();
  let cutOff = false;
  const inside = (end: number) => {
    if (end <= view.byteLength) return true;
    cutOff = true;
    return false;
  };
  // IFD0's chain first, then any SubIFDs found along the way (DNG keeps its previews there).
  const todo: { offset: number; isIfd0: boolean; followNext: boolean }[] = [
    { offset: view.getUint32(4, le), isIfd0: true, followNext: true },
  ];

  while (todo.length && seen.size < MAX_IFDS) {
    const { offset, isIfd0, followNext } = todo.shift()!;
    if (offset <= 0 || seen.has(offset) || !inside(offset + 2)) continue;
    seen.add(offset);

    const count = view.getUint16(offset, le);
    if (!inside(offset + 2 + count * 12)) continue;
    const tags = new Map<number, { type: number; n: number; at: number }>();
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      tags.set(view.getUint16(entry, le), { type: view.getUint16(entry + 2, le), n: view.getUint32(entry + 4, le), at: entry + 8 });
    }
    const first = (tag: number): number | undefined => {
      const t = tags.get(tag);
      if (!t || t.n < 1) return undefined;
      if (t.type === 3) return view.getUint16(t.at, le); // SHORT, stored inline
      if (t.type === 4 || t.type === 13) return view.getUint32(t.at, le); // LONG / IFD
      return undefined;
    };

    if (isIfd0) orientation = first(TAG.orientation) ?? 1;

    const offer = (start: number | undefined, length: number | undefined) => {
      if (!start || !length) return;
      // The frame header is near the start, so a sensor-data strip running past a partial read is
      // still recognised (and skipped) without needing the rest of the file.
      const frame = jpegFrame(bytes, start, length);
      if (!frame) {
        inside(Math.min(start + length, start + 65536)); // not a JPEG, or its header was cut off
        return;
      }
      if (!frame.decodable || !inside(start + length)) return;
      if (!best || frame.width * frame.height > best.width * best.height) best = { start, length, width: frame.width, height: frame.height };
    };
    offer(first(TAG.jpegStart), first(TAG.jpegLength));
    const compression = first(TAG.compression);
    if ((compression === 6 || compression === 7) && tags.get(TAG.stripOffsets)?.n === 1) {
      offer(first(TAG.stripOffsets), first(TAG.stripByteCounts));
    }

    const subs = tags.get(TAG.subIfds);
    if (subs && subs.n > 0) {
      const list = subs.n === 1 ? subs.at : view.getUint32(subs.at, le);
      for (let i = 0; i < Math.min(subs.n, MAX_IFDS); i++) {
        const p = list + i * 4;
        if (inside(p + 4)) todo.push({ offset: view.getUint32(p, le), isIfd0: false, followNext: false });
      }
    }
    if (followNext) {
      const next = offset + 2 + count * 12;
      if (inside(next + 4)) todo.push({ offset: view.getUint32(next, le), isIfd0: false, followNext: true });
    }
  }

  const found = best as Candidate | null;
  if (!found || (partial && cutOff)) return null;
  const jpeg = withOrientation(bytes.subarray(found.start, found.start + found.length), orientation);
  const turned = orientation >= 5 && orientation <= 8;
  return { jpeg, width: turned ? found.height : found.width, height: turned ? found.width : found.height };
}

/** Kept for callers that only want the bytes. */
export function extractEmbeddedJpeg(buffer: ArrayBuffer): Uint8Array | null {
  return extractRawPreview(buffer)?.jpeg ?? null;
}

/**
 * Width and height of a JPEG a browser can decode (baseline SOF0, extended SOF1, progressive SOF2),
 * or null for anything else, including the lossless JPEG (SOF3) that holds CR2/DNG sensor data.
 */
export function jpegSize(bytes: Uint8Array, start: number, length: number): { width: number; height: number } | null {
  const frame = jpegFrame(bytes, start, length);
  return frame?.decodable ? { width: frame.width, height: frame.height } : null;
}

/** The JPEG frame header, or null when there's no JPEG here or its header isn't within `bytes`. */
function jpegFrame(bytes: Uint8Array, start: number, length: number) {
  const end = Math.min(bytes.length, start + length);
  if (bytes[start] !== 0xff || bytes[start + 1] !== 0xd8) return null;
  let i = start + 2;
  while (i + 4 <= end) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > end) return null;
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width, height, decodable: marker <= 0xc2 && width > 0 && height > 0 };
    }
    if (marker === 0xda || marker === 0xd9) return null; // image data before any frame header
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

/**
 * RAW previews usually have no EXIF of their own, so the camera's "rotate this" flag lives only
 * in the RAW file and the browser would show portrait shots sideways. Adds a tiny EXIF block
 * holding just the orientation, which browsers apply when showing and decoding the image.
 */
export function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  if (orientation < 2 || orientation > 8 || hasExif(jpeg)) return jpeg;
  // "Exif\0\0" + little-endian TIFF header + IFD0 with one SHORT entry (Orientation) + no next IFD.
  const app1 = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, 2));
  out.set(app1, 2);
  out.set(jpeg.subarray(2), 2 + app1.length);
  return out;
}

function hasExif(jpeg: Uint8Array): boolean {
  let i = 2;
  while (i + 10 <= jpeg.length && jpeg[i] === 0xff) {
    const marker = jpeg[i + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === 0xe1 && String.fromCharCode(...jpeg.subarray(i + 4, i + 8)) === "Exif") return true;
    i += 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
  }
  return false;
}
