/**
 * Face sharpness. Pure functions over RGBA bytes, like measure.ts; finding the faces is done by
 * detectFaces.ts in the browser.
 *
 * A face is the one subject that has to be sharp, and the photo-wide sharpness in measure.ts can't
 * tell: it judges the sharpest parts, so a crisp background hides a soft face (focus landed
 * behind the person), and in Night mode a person who moved during the long capture blurs while the
 * room stays sharp.
 */

export type FaceStats = {
  /** Where the face is, as shares of the photo's width and height: [left, top, width, height]. */
  box: [number, number, number, number];
  /** How sure the face finder was, 0–1. */
  score: number;
  /** Fine detail in the face (see faceDetail), or null when the face is too small or flat to judge. */
  detail: number | null;
};

/** Faces are compared at this width, so a big face and a small one are judged alike. */
export const FACE_WIDTH = 96;

/**
 * How much of a face's detail is in the finest band (eyelashes, hair, skin texture) compared with
 * the next coarser band (eyes, nose, mouth). Blur and smear remove the finest band first; a sharp
 * face scores about 0.8 to 1.5, a soft or moved one 0.3 to 0.7 (Nov 2026 test photos).
 *
 * `box` is in pixels. Null when the face is narrower than FACE_WIDTH (it would have to be enlarged,
 * which softens it) or has no detail at all.
 */
export function faceDetail(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  box: { x: number; y: number; w: number; h: number },
): number | null {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.w));
  const y1 = Math.min(height, Math.ceil(box.y + box.h));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < FACE_WIDTH || bh < FACE_WIDTH / 2) return null;

  // Shrink to FACE_WIDTH by averaging, which keeps whatever detail survives at that size.
  const scale = FACE_WIDTH / bw;
  const w = FACE_WIDTH;
  const h = Math.max(1, Math.round(bh * scale));
  const sum = new Float64Array(w * h);
  const cnt = new Float64Array(w * h);
  for (let y = y0; y < y1; y++) {
    const ty = Math.min(h - 1, Math.floor((y - y0) * scale));
    for (let x = x0; x < x1; x++) {
      const tx = Math.min(w - 1, Math.floor((x - x0) * scale));
      const i = (y * width + x) * 4;
      sum[ty * w + tx] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      cnt[ty * w + tx]++;
    }
  }
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = cnt[i] ? sum[i] / cnt[i] : 0;

  const b1 = gaussian(a, w, h, 1);
  const b2 = gaussian(b1, w, h, Math.sqrt(3)); // σ1 then σ√3 is σ2 overall.
  const m = 4;
  let e0 = 0;
  let e1 = 0;
  for (let y = m; y < h - m; y++) {
    for (let x = m; x < w - m; x++) {
      const i = y * w + x;
      e0 += (a[i] - b1[i]) ** 2;
      e1 += (b1[i] - b2[i]) ** 2;
    }
  }
  const n = (w - 2 * m) * (h - 2 * m);
  // A face with almost no shape at all (pitch dark, or blurred past recognition) tells nothing.
  if (n <= 0 || e1 / n < 0.5) return null;
  return e0 / e1;
}

function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const ks = k.reduce((s, v) => s + v, 0);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += k[j + r] * src[y * w + Math.min(w - 1, Math.max(0, x + j))];
      tmp[y * w + x] = s / ks;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += k[j + r] * tmp[Math.min(h - 1, Math.max(0, y + j)) * w + x];
      out[y * w + x] = s / ks;
    }
  }
  return out;
}
