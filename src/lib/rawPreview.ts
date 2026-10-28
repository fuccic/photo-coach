/**
 * Sony ARW (and most other TIFF-based RAW files) carry a full-size or medium JPEG preview.
 * Browsers can't decode the RAW data itself, so we show that embedded JPEG instead.
 * Walks the IFD chain and returns the largest JPEG referenced by
 * JPEGInterchangeFormat (0x0201) / JPEGInterchangeFormatLength (0x0202).
 */
export function extractEmbeddedJpeg(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  if (view.byteLength < 8) return null;

  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return null; // "II" or "MM"
  const le = order === 0x4949;
  if (view.getUint16(2, le) !== 42) return null;

  let best: { start: number; length: number } | null = null;
  const seen = new Set<number>();
  let ifd = view.getUint32(4, le);

  while (ifd > 0 && ifd + 2 <= view.byteLength && !seen.has(ifd)) {
    seen.add(ifd);
    const count = view.getUint16(ifd, le);
    let start = 0;
    let length = 0;
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) return pick(buffer, best);
      const tag = view.getUint16(entry, le);
      if (tag === 0x0201) start = view.getUint32(entry + 8, le);
      if (tag === 0x0202) length = view.getUint32(entry + 8, le);
    }
    if (start > 0 && length > 0 && start + length <= view.byteLength && (!best || length > best.length)) {
      best = { start, length };
    }
    const nextPtr = ifd + 2 + count * 12;
    ifd = nextPtr + 4 <= view.byteLength ? view.getUint32(nextPtr, le) : 0;
  }
  return pick(buffer, best);
}

function pick(buffer: ArrayBuffer, best: { start: number; length: number } | null): Uint8Array | null {
  if (!best) return null;
  const bytes = new Uint8Array(buffer, best.start, best.length);
  // Must start with a JPEG SOI marker.
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
}
