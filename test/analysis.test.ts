import { describe, expect, it } from "vitest";
import { findIssues } from "@/lib/analysis/checks";
import { measure } from "@/lib/analysis/measure";
import { identifyDevice } from "@/lib/devices";
import type { PhotoMeta } from "@/lib/exif";

// Synthetic scenes stand in for real photos: shapes with hard edges and a smooth sky, which we
// then darken, blow out, blur, shake or make grainy by known amounts.
const W = 640;
const H = 480;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Linear-light RGB, 0–1, so exposure changes behave like a camera's. */
type Scene = Float32Array;

function scene(seed = 1): Scene {
  const rand = rng(seed);
  const img = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      // Smooth sky on top, ground below.
      const v = y < H / 3 ? 0.35 + 0.2 * (y / H) : 0.12;
      img[i] = v * 0.9;
      img[i + 1] = v;
      img[i + 2] = y < H / 3 ? v * 1.3 : v * 0.8;
    }
  }
  for (let k = 0; k < 160; k++) {
    const x0 = Math.floor(rand() * W);
    const y0 = Math.floor(H / 3 + rand() * (H * 2) / 3);
    const w = 6 + Math.floor(rand() * 60);
    const h = 6 + Math.floor(rand() * 60);
    const c = [rand(), rand(), rand()].map((v) => 0.02 + 0.5 * v);
    const round = rand() < 0.5;
    for (let y = y0; y < Math.min(H, y0 + h); y++) {
      for (let x = x0; x < Math.min(W, x0 + w); x++) {
        if (round && ((x - x0 - w / 2) / (w / 2)) ** 2 + ((y - y0 - h / 2) / (h / 2)) ** 2 > 1) continue;
        img.set(c, (y * W + x) * 3);
      }
    }
  }
  return img;
}

function expose(img: Scene, ev: number): Scene {
  return img.map((v) => v * 2 ** ev);
}

function gaussianBlur(img: Scene, sigma: number): Scene {
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b);
  return convolve(convolve(img, k.map((v) => v / sum), 1, 0), k.map((v) => v / sum), 0, 1);
}

/** Shake along a diagonal, `length` pixels long. */
function motionBlur(img: Scene, length: number): Scene {
  return convolve(img, Array(length).fill(1 / length), 1, 1);
}

function convolve(img: Scene, k: number[], dx: number, dy: number): Scene {
  const out = new Float32Array(img.length);
  const r = (k.length - 1) / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let j = 0; j < k.length; j++) {
          const xx = Math.min(W - 1, Math.max(0, x + Math.round((j - r) * dx)));
          const yy = Math.min(H - 1, Math.max(0, y + Math.round((j - r) * dy)));
          acc += k[j] * img[(yy * W + xx) * 3 + c];
        }
        out[(y * W + x) * 3 + c] = acc;
      }
    }
  }
  return out;
}

/** Encode to 8-bit sRGB like a JPEG would, optionally adding grain (standard deviation in 0–255 levels). */
function toRgba(img: Scene, grain = 0, seed = 7): Uint8ClampedArray {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) {
      const v = Math.min(1, Math.max(0, img[p * 3 + c]));
      const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
      out[p * 4 + c] = s * 255 + (grain ? grain * gauss() : 0);
    }
    out[p * 4 + 3] = 255;
  }
  return out;
}

const camera: PhotoMeta = {
  device: { id: "sony-ilce-7m2", name: "Sony α7 II", kind: "camera", supported: true },
  exposureTime: 1 / 250,
  fNumber: 8,
  iso: 100,
  focalLength: 35,
  hasSettings: true,
};

function check(rgba: Uint8ClampedArray, meta: PhotoMeta = camera) {
  return findIssues(measure(rgba, W, H), meta);
}

const kinds = (issues: ReturnType<typeof check>) => issues.map((i) => `${i.kind}:${i.severity}`);

describe("photo checks", () => {
  const base = scene();

  it("finds nothing wrong with a well exposed, sharp photo", () => {
    expect(kinds(check(toRgba(base)))).toEqual([]);
  });

  it("spots a dark photo, and how dark", () => {
    expect(kinds(check(toRgba(expose(base, -1.5))))).toEqual(["dark:small"]);
    const issues = check(toRgba(expose(base, -3.5)));
    expect(kinds(issues)).toEqual(["dark:big"]);
    expect(issues[0].why).toContain("ISO was only 100");
    expect(issues[0].area.length).toBeGreaterThan(0);
  });

  it("blames exposure compensation when it was turned down", () => {
    const [issue] = check(toRgba(expose(base, -3.5)), { ...camera, exposureComp: -2 });
    expect(issue.why).toContain("-2 EV");
  });

  it("spots blown highlights", () => {
    const issues = check(toRgba(expose(base, 2.5)));
    expect(kinds(issues)).toEqual(["bright:big"]);
    expect(issues[0].why).toMatch(/\d+% of the photo is pure white/);
  });

  it("tells a soft photo from a badly focused one", () => {
    expect(kinds(check(toRgba(gaussianBlur(base, 1))))).toEqual(["focus:small"]);
    const issues = check(toRgba(gaussianBlur(base, 3)));
    expect(kinds(issues)).toEqual(["focus:big"]);
    expect(issues[0].title).toBe("Out of focus");
    expect(issues[0].why).toContain("At 1/250s it isn't shake");
  });

  it("recognises camera shake by its one-way smear", () => {
    expect(kinds(check(toRgba(motionBlur(base, 5))))).toEqual(["shake:small"]);
    const issues = check(toRgba(motionBlur(base, 9)));
    expect(kinds(issues)).toEqual(["shake:big"]);
    expect(issues[0].title).toBe("Blurry");
    expect(issues[0].why).toContain("runs one way");
  });

  it("blames a slow shutter for blur", () => {
    const [issue] = check(toRgba(gaussianBlur(base, 3)), { ...camera, exposureTime: 1 / 8 });
    expect(issue.kind).toBe("shake");
    // The α7 II's stabilisation buys about two stops over 1 / focal length.
    expect(issue.why).toContain("1/8s is slow to hold steady at 35mm. Aim for 1/9s or faster.");
    const canon = identifyDevice("Canon", "Canon EOS R50");
    const [other] = check(toRgba(gaussianBlur(base, 3)), { ...camera, device: canon, exposureTime: 1 / 8 });
    expect(other.why).toContain("Aim for 1/35s or faster.");
  });

  it("doesn't blame a phone's Night mode exposure for a soft photo, or tell it to set a shutter", () => {
    const phone = { ...camera, device: identifyDevice("Apple", "iPhone 18 Pro"), exposureTime: 1, fNumber: 1.8 };
    const [issue] = check(toRgba(gaussianBlur(base, 3)), phone);
    expect(issue.kind).toBe("focus");
    expect(issue.why).not.toMatch(/Aim for|f\/1.8/);
    const [shake] = check(toRgba(motionBlur(base, 9)), phone);
    expect(shake.kind).toBe("shake");
    expect(shake.why).toContain("Night mode took 1s");
  });

  it("doesn't call strong colours pure white", () => {
    const red = new Float32Array(W * H * 3);
    for (let p = 0; p < W * H; p++) red.set([1, 0.08 + 0.1 * ((p * 7) % 11) / 11, 0.05], p * 3);
    const stats = measure(toRgba(red), W, H);
    expect(stats.clipped).toBe(0);
    expect(findIssues(stats, camera).some((i) => i.kind === "bright")).toBe(false);
  });

  it("spots grain at high ISO, and ignores it at low ISO", () => {
    const grainy = toRgba(base, 8);
    const issues = check(grainy, { ...camera, iso: 6400 });
    expect(kinds(issues)).toEqual(["grain:big"]);
    expect(issues[0].why).toContain("ISO 6400 is high");
    expect(kinds(check(toRgba(base, 4), { ...camera, iso: 3200 }))).toEqual(["grain:small"]);
    expect(check(grainy, camera)).toEqual([]);
  });

  it("puts big problems first and links grain to darkness", () => {
    const issues = check(toRgba(expose(base, -3.5), 6), { ...camera, iso: 12800 });
    expect(issues[0].severity).toBe("big");
    const grain = issues.find((i) => i.kind === "grain");
    expect(grain?.why).toContain("Both come from too little light.");
  });

  it("does not judge sharpness on a featureless photo", () => {
    const flat = new Float32Array(W * H * 3).fill(0.2);
    const stats = measure(toRgba(flat), W, H);
    expect(stats.sharpness).toBeNull();
    expect(findIssues(stats, camera).some((i) => i.kind === "focus" || i.kind === "shake")).toBe(false);
  });

  it("works without any camera settings", () => {
    expect(kinds(findIssues(measure(toRgba(gaussianBlur(base, 3)), W, H)))).toEqual(["focus:big"]);
  });
});
