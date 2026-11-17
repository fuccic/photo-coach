/**
 * Small light sources (string lights, lamps, candles, signs) are the clearest sign of camera shake
 * in a night photo. Each one is a point, so it draws the path the camera took while the shutter was
 * open: dots when the camera held still, matching streaks or squiggles when it moved. Night mode
 * blends many frames and sharpens the result, which hides shake from the edge-based sharpness
 * reading, but it can't put a streaked light back into a dot.
 *
 * Moving people smear on their own, each a different way, and leave the lights alone, so this
 * reading is about the camera, not the subject.
 */

export type LightStats = {
  /** Small, bright, isolated lights found. */
  lights: number;
  /**
   * 0 when the lights point every which way (round dots), towards 1 when they are all stretched
   * the same way (the camera moved). Only meaningful with a handful of lights or more.
   */
  lightStreak: number;
};

/** How much brighter than its surroundings (0–255) a spot has to be. */
const LIFT = 80;
/** The brightest pixel of a light must reach this (0–255, brightest channel)... */
const PEAK = 245;
/** ...and this overall brightness, so a light is near white, not just a strong red or blue. */
const PEAK_LUMA = 200;
/**
 * Its surroundings must be at most this share of its peak: a light in the dark, not a shine on a
 * shirt or a hat, whose stripes and seams would line up like a streak.
 */
const ISOLATED = 0.4;
/** Spots smaller than this many pixels are noise or glints. */
const MIN_AREA = 4;

/**
 * `rgba` at the analysis size (about 1600px on the long edge). Lights are found with a white
 * top-hat: brightness minus a "grey opening" that removes anything narrower than about 1% of the
 * long edge, so lamps and bulbs stay and walls and faces go.
 */
export function measureLights(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): LightStats {
  const n = width * height;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);

  const k = Math.max(7, Math.round(Math.max(width, height) / 100));
  const opened = dilate(erode(v, width, height, k), width, height, k);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (v[i] - opened[i] > LIFT) mask[i] = 1;

  const around = boxMean(v, width, height, 3 * k);
  const label = new Int32Array(n);
  const stack: number[] = [];
  // Average shape of the lights, each normalised to the same size: [xx, xy, yy].
  const shape = [0, 0, 0];
  let lights = 0;
  let next = 0;

  for (let start = 0; start < n; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    label[start] = next;
    stack.push(start);
    let area = 0;
    let peak = 0;
    let peakLuma = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      peak = Math.max(peak, v[p]);
      peakLuma = Math.max(peakLuma, 0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2]);
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
      syy += y * y;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && mask[q] && !label[q]) {
          label[q] = next;
          stack.push(q);
        }
      }
    }
    if (area < MIN_AREA || peak < PEAK || peakLuma < PEAK_LUMA) continue;
    const cx = sx / area;
    const cy = sy / area;
    if (around[Math.round(cy) * width + Math.round(cx)] > ISOLATED * peak) continue;
    // Spread of the spot (pixels count as small squares, hence the 1/12), scaled to unit size.
    const xx = sxx / area - cx * cx + 1 / 12;
    const xy = sxy / area - cx * cy;
    const yy = syy / area - cy * cy + 1 / 12;
    const size = xx + yy;
    shape[0] += xx / size;
    shape[1] += xy / size;
    shape[2] += yy / size;
    lights++;
  }

  if (!lights) return { lights: 0, lightStreak: 0 };
  // How stretched the average shape is: round dots, or streaks pointing every way, average out to
  // a circle; streaks that share a direction don't.
  const [xx, xy, yy] = shape.map((s) => s / lights);
  const lightStreak = Math.sqrt((xx - yy) ** 2 + 4 * xy * xy) / (xx + yy);
  return { lights, lightStreak };
}

/** Minimum over a k×k square (separable). */
function erode(src: Float32Array, w: number, h: number, k: number): Float32Array {
  return slide(slide(src, w, h, k, true, Math.min), w, h, k, false, Math.min);
}

/** Maximum over a k×k square (separable). */
function dilate(src: Float32Array, w: number, h: number, k: number): Float32Array {
  return slide(slide(src, w, h, k, true, Math.max), w, h, k, false, Math.max);
}

/** Min or max over a window of k pixels along rows or columns, clamped at the borders. */
function slide(
  src: Float32Array,
  w: number,
  h: number,
  k: number,
  rows: boolean,
  pick: (a: number, b: number) => number,
): Float32Array {
  const out = new Float32Array(src.length);
  const before = Math.floor((k - 1) / 2);
  const after = k - 1 - before;
  const [lines, len, step, stride] = rows ? [h, w, 1, w] : [w, h, w, 1];
  // van Herk / Gil-Werman: running min/max in blocks of k, so the cost doesn't grow with k.
  const fwd = new Float32Array(len);
  const bwd = new Float32Array(len);
  for (let line = 0; line < lines; line++) {
    const base = line * stride;
    for (let i = 0; i < len; i++) {
      const val = src[base + i * step];
      fwd[i] = i % k === 0 ? val : pick(fwd[i - 1], val);
    }
    for (let i = len - 1; i >= 0; i--) {
      const val = src[base + i * step];
      bwd[i] = i === len - 1 || (i + 1) % k === 0 ? val : pick(bwd[i + 1], val);
    }
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - before);
      const hi = Math.min(len - 1, i + after);
      out[base + i * step] = pick(bwd[lo], fwd[hi]);
    }
  }
  return out;
}

/** Mean over a size×size square around each pixel, from a summed-area table. */
function boxMean(src: Float32Array, w: number, h: number, size: number): Float32Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.floor(size / 2);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}
