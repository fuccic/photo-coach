/**
 * Builds small little-endian TIFF files shaped like real RAW files (Canon CR2, DNG), so RAW
 * handling can be tested without committing multi-megabyte camera files.
 */
export type Entry =
  | { tag: number; short: number[] }
  | { tag: number; long: number[] }
  | { tag: number; ascii: string }
  | { tag: number; rational: [number, number][] }
  /** A LONG holding the offset of `data` (e.g. StripOffsets, JPEGInterchangeFormat). */
  | { tag: number; offsetOf: Uint8Array }
  /** A LONG list holding the offsets of other IFDs (SubIFDs, ExifIFD). */
  | { tag: number; ifds: Ifd[] };

export type Ifd = { entries: Entry[]; next?: Ifd };

export function buildTiff(ifd0: Ifd, header: number[] = []): Uint8Array {
  const out: number[] = [0x49, 0x49, 42, 0, 0, 0, 0, 0, ...header];
  const put32 = (at: number, v: number) => {
    out[at] = v & 0xff;
    out[at + 1] = (v >>> 8) & 0xff;
    out[at + 2] = (v >>> 16) & 0xff;
    out[at + 3] = (v >>> 24) & 0xff;
  };
  const align = () => {
    if (out.length % 2) out.push(0);
  };
  const append = (bytes: ArrayLike<number>) => {
    align();
    const at = out.length;
    for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
    return at;
  };
  const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const le32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

  const write = (ifd: Ifd): number => {
    const entries = [...ifd.entries].sort((a, b) => a.tag - b.tag);
    align();
    const at = out.length;
    out.push(...le16(entries.length));
    const slots: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      slots.push(out.length);
      out.push(...new Array(12).fill(0));
    }
    const nextSlot = out.length;
    out.push(0, 0, 0, 0);

    entries.forEach((e, i) => {
      const s = slots[i];
      const head = (type: number, count: number) => {
        out.splice(s, 8, ...le16(e.tag), ...le16(type), ...le32(count));
      };
      const value = (bytes: number[]) => {
        if (bytes.length <= 4) out.splice(s + 8, 4, ...bytes, ...new Array(4 - bytes.length).fill(0));
        else put32(s + 8, append(bytes));
      };
      if ("short" in e) {
        head(3, e.short.length);
        value(e.short.flatMap(le16));
      } else if ("long" in e) {
        head(4, e.long.length);
        value(e.long.flatMap(le32));
      } else if ("ascii" in e) {
        const bytes = [...new TextEncoder().encode(e.ascii), 0];
        head(2, bytes.length);
        value(bytes);
      } else if ("rational" in e) {
        head(5, e.rational.length);
        value(e.rational.flatMap(([n, d]) => [...le32(n), ...le32(d)]));
      } else if ("offsetOf" in e) {
        head(4, 1);
        put32(s + 8, append(e.offsetOf));
      } else {
        head(4, e.ifds.length);
        const offsets = e.ifds.map(write);
        value(offsets.flatMap(le32));
      }
    });
    if (ifd.next) put32(nextSlot, write(ifd.next));
    return at;
  };

  put32(4, write(ifd0));
  return new Uint8Array(out);
}

/** A JPEG whose only content is a frame header: enough for size and "can a browser decode it" checks. */
export function fakeJpeg(width: number, height: number, sof = 0xc0, extra: number[] = []): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, // an (empty) table before the frame header, as in CR2s
    ...extra,
    0xff, sof, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}
