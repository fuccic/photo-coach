import jpeg from "jpeg-js";
import { measure, type ImageStats } from "@core/analysis/measure";

/**
 * Measures a JPEG's pixels with the same code the website uses. Kept free of React Native imports
 * so it can be tested in Node.
 */
export function measureJpeg(bytes: Uint8Array): ImageStats {
  const { data, width, height } = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return measure(data, width, height);
}

/** Base64 to bytes without Buffer or atob, which Hermes may not have. */
export function base64ToBytes(b64: string): Uint8Array {
  const table = new Uint8Array(128);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  // Some platforms hand back a data URL ("data:image/jpeg;base64,...").
  const clean = b64.slice(b64.indexOf(",") + 1).replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = table[clean.charCodeAt(i)];
    const b = table[clean.charCodeAt(i + 1)];
    const c = table[clean.charCodeAt(i + 2)];
    const d = table[clean.charCodeAt(i + 3)];
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
