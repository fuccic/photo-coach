/**
 * Finds the EXIF (TIFF) block inside a HEIC/HEIF file.
 *
 * exifr reads HEIC files straight from an iPhone, but ignores the iloc "base_offset" field,
 * which libheif-based tools (converters, editors) use. This parser handles both layouts and is
 * used as a fallback when exifr finds nothing.
 */
export function findHeifExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uint = (at: number, size: number): number => {
    if (size === 0) return 0;
    if (size === 2) return view.getUint16(at);
    if (size === 4) return view.getUint32(at);
    if (size === 8) return view.getUint32(at) * 2 ** 32 + view.getUint32(at + 4);
    throw new Error(`Unsupported field size ${size}`);
  };

  try {
    if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp") return null;
    const meta = findBox(bytes, view, 0, bytes.length, "meta");
    if (!meta) return null;
    const childrenStart = meta.body + 4; // meta is a FullBox
    const iinf = findBox(bytes, view, childrenStart, meta.end, "iinf");
    const iloc = findBox(bytes, view, childrenStart, meta.end, "iloc");
    if (!iinf || !iloc) return null;

    // iinf: find the item id whose type is "Exif".
    const iinfVersion = bytes[iinf.body];
    let at = iinf.body + 4;
    let count = iinfVersion === 0 ? uint(at, 2) : uint(at, 4);
    at += iinfVersion === 0 ? 2 : 4;
    let exifId: number | undefined;
    while (count-- > 0 && at < iinf.end) {
      const infe = readBoxHeader(bytes, view, at, iinf.end);
      if (!infe) break;
      const version = bytes[infe.body];
      if (version >= 2) {
        const idSize = version === 2 ? 2 : 4;
        const id = uint(infe.body + 4, idSize);
        const type = String.fromCharCode(...bytes.subarray(infe.body + 4 + idSize + 2, infe.body + 4 + idSize + 6));
        if (type === "Exif") {
          exifId = id;
          break;
        }
      }
      at = infe.end;
    }
    if (exifId === undefined) return null;

    // iloc: find that item's location.
    const ilocVersion = bytes[iloc.body];
    at = iloc.body + 4;
    const offsetSize = bytes[at] >> 4;
    const lengthSize = bytes[at] & 0xf;
    const baseOffsetSize = bytes[at + 1] >> 4;
    const indexSize = ilocVersion === 1 || ilocVersion === 2 ? bytes[at + 1] & 0xf : 0;
    at += 2;
    const idSize = ilocVersion < 2 ? 2 : 4;
    let items = uint(at, idSize);
    at += idSize;
    while (items-- > 0 && at < iloc.end) {
      const id = uint(at, idSize);
      at += idSize;
      let constructionMethod = 0;
      if (ilocVersion === 1 || ilocVersion === 2) {
        constructionMethod = uint(at, 2) & 0xf;
        at += 2;
      }
      at += 2; // data_reference_index
      const baseOffset = uint(at, baseOffsetSize);
      at += baseOffsetSize;
      const extents = uint(at, 2);
      at += 2;
      if (id === exifId) {
        if (constructionMethod !== 0 || extents < 1) return null;
        const extentOffset = uint(at + indexSize, offsetSize);
        const extentLength = uint(at + indexSize + offsetSize, lengthSize);
        const start = baseOffset + extentOffset;
        if (start + 4 > bytes.length) return null;
        // The Exif item starts with a 4-byte offset to the TIFF header ("Exif\0\0" usually sits in between).
        const tiffStart = start + 4 + view.getUint32(start);
        const end = Math.min(bytes.length, extentLength > 0 ? start + extentLength : bytes.length);
        return tiffStart < end ? bytes.subarray(tiffStart, end) : null;
      }
      at += extents * (indexSize + offsetSize + lengthSize);
    }
    return null;
  } catch {
    return null;
  }
}

type Box = { body: number; end: number };

function readBoxHeader(bytes: Uint8Array, view: DataView, at: number, limit: number): (Box & { type: string }) | null {
  if (at + 8 > limit) return null;
  let size = view.getUint32(at);
  const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
  let body = at + 8;
  if (size === 1) {
    size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
    body = at + 16;
  } else if (size === 0) {
    size = limit - at;
  }
  if (size < body - at) return null;
  return { type, body, end: Math.min(at + size, limit) };
}

function findBox(bytes: Uint8Array, view: DataView, start: number, limit: number, type: string): Box | null {
  let at = start;
  while (at < limit) {
    const box = readBoxHeader(bytes, view, at, limit);
    if (!box) return null;
    if (box.type === type) return box;
    at = box.end;
  }
  return null;
}
