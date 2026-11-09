/**
 * Pixel measurements behind the photo checks. Pure functions over RGBA bytes so they run the same
 * in the browser (canvas ImageData) and in tests.
 *
 * Every measurement is taken at the size the photo is analysed at (about 1600px on the long edge),
 * so "blurry" and "grainy" mean "visible when the whole photo fits a screen", not pixel-peeping.
 */

/** Tiles across the long edge. Problem areas are drawn as whole tiles. */
export const GRID = 16;

export type TileStats = {
  /** Average brightness, 0–255. */
  luma: number;
  /** Share of pixels at pure white (every channel maxed out). */
  clipped: number;
  /** Share of pixels close to black. */
  crushed: number;
  /** Detail sharpness (about 1 / blur width in pixels), or null when the tile is too flat to tell. */
  sharpness: number | null;
  /** Grain estimate for this tile, 0–255 scale. Textured tiles over-estimate. */
  noise: number;
};

export type ImageStats = {
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Row by row, `cols` per row. */
  tiles: TileStats[];
  meanLuma: number;
  /** Brightness percentiles, 0–255. */
  p05: number;
  p50: number;
  p95: number;
  p99: number;
  /** Share of the photo at pure white / near black. */
  clipped: number;
  crushed: number;
  /**
   * Share of the photo at full brightness in at least one channel: light sources, a lit subject,
   * a vivid sky. A dark photo with these was exposed for its bright parts, not underexposed.
   */
  highlights: number;
  /** Grain, as a standard deviation on the 0–255 scale. */
  noise: number;
  /** False when the photo has no flat areas to read grain from, so `noise` is a rough guess. */
  noiseSure: boolean;
  /** Sharpness of the sharpest part of the photo, or null when nothing has enough detail to judge. */
  sharpness: number | null;
  /**
   * 0 when detail is equally sharp in every direction, towards 1 when it is smeared one way
   * (camera or subject movement).
   */
  smear: number;
  /** Tiles with enough detail to judge sharpness. */
  detailTiles: number;
};

/** Bump when measure() changes, so saved photos are measured again with the new version. */
export const MEASURE_VERSION = 4;

const CLIP_LEVEL = 252;
const CRUSH_LEVEL = 12;
const HIGHLIGHT_LEVEL = 250;
/** Gradient energy (per pixel, above grain) a tile needs before its sharpness counts. */
const DETAIL_ENERGY = 6;
/** Above this, a tile's detail runs one way only (a wall edge, a pole, a rail): no use for smear. */
const ONE_WAY = 0.8;
/** Two directions are compared only if edges face them about as squarely (see `facing`). */
const FACING_MATCH = 0.5;

export function measure(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): ImageStats {
  const n = width * height;
  const luma = new Float32Array(n);
  const hist = new Uint32Array(256);
  const tileSize = Math.ceil(Math.max(width, height) / GRID);
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tileCount = cols * rows;

  // Per tile: pixel count, luma sum, clipped, crushed, then (interior pixels only) count,
  // gradient energy, laplacian energy, 4 directional energies, grain sum.
  const count = new Float64Array(tileCount);
  const sumL = new Float64Array(tileCount);
  const clip = new Float64Array(tileCount);
  const crush = new Float64Array(tileCount);
  const inner = new Float64Array(tileCount);
  const grad = new Float64Array(tileCount);
  // Per direction (0°, 45°, 90°, 135°): first and second difference energy.
  const d1 = [0, 1, 2, 3].map(() => new Float64Array(tileCount));
  const d2 = [0, 1, 2, 3].map(() => new Float64Array(tileCount));
  // Per direction: gradient energy weighted by cos² and cos⁴ of the angle between the slope and
  // that direction, for how squarely edges face it (see `facing` below) and which way they run.
  const cos2 = [0, 1, 2, 3].map(() => new Float64Array(tileCount));
  const cos4 = [0, 1, 2, 3].map(() => new Float64Array(tileCount));
  const grain = new Float64Array(tileCount);

  const tileOf = (x: number, y: number) => Math.floor(y / tileSize) * cols + Math.floor(x / tileSize);

  let total = 0;
  let clippedPx = 0;
  let crushedPx = 0;
  let highlightPx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      luma[i] = l;
      total += l;
      hist[Math.min(255, Math.round(l))]++;
      const t = tileOf(x, y);
      count[t]++;
      sumL[t] += l;
      // Only pure white counts: one maxed channel is just a strong colour (red flowers, sunsets).
      if (Math.min(r, g, b) >= CLIP_LEVEL) {
        clip[t]++;
        clippedPx++;
      }
      if (Math.max(r, g, b) >= HIGHLIGHT_LEVEL) highlightPx++;
      if (l < CRUSH_LEVEL) {
        crush[t]++;
        crushedPx++;
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const c = luma[i];
      const l = luma[i - 1];
      const r = luma[i + 1];
      const u = luma[i - width];
      const d = luma[i + width];
      const ul = luma[i - width - 1];
      const ur = luma[i - width + 1];
      const dl = luma[i + width - 1];
      const dr = luma[i + width + 1];
      const t = tileOf(x, y);
      const g0 = (r - l) / 2;
      const g45 = (ur - dl) / 2;
      const g90 = (d - u) / 2;
      const g135 = (dr - ul) / 2;
      const s0 = l - 2 * c + r;
      const s45 = ur - 2 * c + dl;
      const s90 = u - 2 * c + d;
      const s135 = ul - 2 * c + dr;
      inner[t]++;
      grad[t] += g0 * g0 + g90 * g90;
      d1[0][t] += g0 * g0;
      d1[1][t] += g45 * g45;
      d1[2][t] += g90 * g90;
      d1[3][t] += g135 * g135;
      d2[0][t] += s0 * s0;
      d2[1][t] += s45 * s45;
      d2[2][t] += s90 * s90;
      d2[3][t] += s135 * s135;
      const gg = g0 * g0 + g90 * g90;
      if (gg > 0) {
        const a0 = g0 * g0;
        const a45 = ((g0 - g90) * (g0 - g90)) / 2;
        const a90 = g90 * g90;
        const a135 = ((g0 + g90) * (g0 + g90)) / 2;
        cos2[0][t] += a0;
        cos2[1][t] += a45;
        cos2[2][t] += a90;
        cos2[3][t] += a135;
        cos4[0][t] += (a0 * a0) / gg;
        cos4[1][t] += (a45 * a45) / gg;
        cos4[2][t] += (a90 * a90) / gg;
        cos4[3][t] += (a135 * a135) / gg;
      }
      // Immerkær (1996) fast noise estimate: this kernel cancels smooth gradients, leaving grain.
      grain[t] += Math.abs(ul - 2 * u + ur - 2 * l + 4 * c - 2 * r + dl - 2 * d + dr);
    }
  }

  const tileNoise = Array.from({ length: tileCount }, (_, t) =>
    inner[t] ? (Math.sqrt(Math.PI / 2) * grain[t]) / (6 * inner[t]) : 0,
  );
  // Grain is best read from flat parts of the photo (sky, walls), where nothing but grain changes
  // from pixel to pixel; texture fools the estimate. Pure black or white hides grain.
  const usable: number[] = [];
  const flat: number[] = [];
  for (let t = 0; t < tileCount; t++) {
    const mean = count[t] ? sumL[t] / count[t] : 0;
    if (!inner[t] || mean < 16 || mean > 235 || clip[t] / count[t] > 0.05) continue;
    usable.push(tileNoise[t]);
    // Pure grain of strength σ gives a gradient energy of σ²; anything well above that is texture.
    if (grad[t] / inner[t] < 1.6 * tileNoise[t] * tileNoise[t] + 0.5) flat.push(tileNoise[t]);
  }
  const noiseSure = flat.length >= 3;
  const noise = noiseSure ? percentile(flat, 0.5) : percentile(usable.length ? usable : tileNoise, 0.1);
  const nv = noise * noise;

  const tiles: TileStats[] = [];
  const sharpList: number[] = [];
  const smearList: number[] = [];
  const weakDir = [0, 0, 0, 0];
  for (let t = 0; t < tileCount; t++) {
    let sharpness: number | null = null;
    if (inner[t] && grad[t] / inner[t] - nv > DETAIL_ENERGY) {
      // Along each direction, second-difference energy falls with the cube of blur width and
      // first-difference energy only linearly, so sqrt(e2 / e1) tracks 1 / blur width whatever
      // the contrast. Grain's own share of each energy is removed first.
      const e1 = d1.map((a) => a[t] / inner[t] - nv / 2);
      const strongest = Math.max(...e1);
      const ratios = d2.map((a, k) => {
        // Directions that run along the tile's edges carry no information about blur. Keep the
        // threshold low: a direction blurred by shake also loses most of its energy.
        if (e1[k] < Math.max(DETAIL_ENERGY / 4, 0.08 * strongest)) return Infinity;
        const e2 = Math.max(a[t] / inner[t] - 6 * nv, 0);
        // Diagonal neighbours are √2 apart.
        return Math.sqrt(e2 / e1[k]) / (k % 2 ? Math.SQRT2 : 1);
      });
      const valid = ratios.filter(Number.isFinite);
      // A tile is only as sharp as its blurriest direction: shake smears one way only.
      sharpness = Math.min(...valid);
      sharpList.push(sharpness);

      // Smear compares how sharp the tile looks across different directions, and straight lines
      // fool that in two ways. A crisp edge looks wider to a direction that crosses it at a slant,
      // and the diagonal and straight-across readings don't agree on a crisp edge (the √2 above
      // only holds for soft ones), so a wall, a pole or a railing reads as smeared when it isn't.
      // So: skip tiles whose detail all runs one way (a single line can't show which way the
      // camera moved anyway), and only compare a direction with the one at right angles to it
      // (0° with 90°, 45° with 135°), and only when edges face both about as squarely.
      const jxx = cos2[0][t];
      const jyy = cos2[2][t];
      const jxy = (cos2[3][t] - cos2[1][t]) / 2;
      const oneWay = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy || 1);
      if (valid.length >= 3 && oneWay <= ONE_WAY) {
        // cos² of the slant at which edges cross this direction, averaged the way the energies
        // average it: 1 when edges face it squarely, ¾ for detail that runs every way.
        const facing = [0, 1, 2, 3].map((k) => (cos2[k][t] > 0 ? cos4[k][t] / cos2[k][t] : 0.75));
        let best = -1;
        let weak = -1;
        for (const [i, j] of [
          [0, 2],
          [1, 3],
        ]) {
          if (!Number.isFinite(ratios[i]) || !Number.isFinite(ratios[j])) continue;
          if (Math.min(facing[i], facing[j]) < FACING_MATCH * Math.max(facing[i], facing[j])) continue;
          const smear = 1 - Math.min(ratios[i], ratios[j]) / Math.max(ratios[i], ratios[j]);
          if (smear > best) {
            best = smear;
            weak = ratios[i] < ratios[j] ? i : j;
          }
        }
        if (best >= 0) {
          smearList.push(best);
          weakDir[weak]++;
        }
      }
    }
    tiles.push({
      luma: count[t] ? sumL[t] / count[t] : 0,
      clipped: count[t] ? clip[t] / count[t] : 0,
      crushed: count[t] ? crush[t] / count[t] : 0,
      sharpness,
      noise: tileNoise[t],
    });
  }

  // Shake smears every tile the same way; texture smears tiles in assorted directions.
  const sameWay = smearList.length ? Math.max(...weakDir) / smearList.length : 0;
  const smear = smearList.length >= 3 ? percentile(smearList, 0.5) * sameWay : 0;

  return {
    width,
    height,
    cols,
    rows,
    tiles,
    meanLuma: total / n,
    p05: histPercentile(hist, n, 0.05),
    p50: histPercentile(hist, n, 0.5),
    p95: histPercentile(hist, n, 0.95),
    p99: histPercentile(hist, n, 0.99),
    clipped: clippedPx / n,
    crushed: crushedPx / n,
    highlights: highlightPx / n,
    noise,
    noiseSure,
    // Judge the sharpest parts: a photo with a sharp subject and a soft background is fine.
    sharpness: sharpList.length >= 3 ? percentile(sharpList, 0.9) : null,
    smear,
    detailTiles: sharpList.length,
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function histPercentile(hist: Uint32Array, n: number, p: number): number {
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= p * n) return v;
  }
  return 255;
}
