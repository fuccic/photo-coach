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

/** Shake `length` pixels long, along a diagonal unless told otherwise. */
function motionBlur(img: Scene, length: number, dx = 1, dy = 1): Scene {
  return convolve(img, Array(length).fill(1 / length), dx, dy);
}

/** Pebbles: rounded shapes at every angle, so edges run every way. */
function pebbles(seed = 5): Scene {
  const rand = rng(seed);
  const img = new Float32Array(W * H * 3).fill(0.3);
  for (let k = 0; k < 900; k++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const a = 3 + rand() * 18;
    const b = 3 + rand() * 18;
    const th = rand() * Math.PI;
    const v = 0.03 + 0.6 * rand();
    const r = Math.max(a, b);
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
        const u = (x - cx) * Math.cos(th) + (y - cy) * Math.sin(th);
        const w = -(x - cx) * Math.sin(th) + (y - cy) * Math.cos(th);
        if ((u / a) ** 2 + (w / b) ** 2 <= 1) img.set([v, v * 0.9, v * 0.8], (y * W + x) * 3);
      }
    }
  }
  return img;
}

function fill(img: Scene, x0: number, y0: number, w: number, h: number, c: number[]) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, y0 + h); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, x0 + w); x++) img.set(c, (y * W + x) * 3);
  }
}

/** A street of buildings against the sky: nothing but long straight edges and window grids. */
function street(): Scene {
  const rand = rng(3);
  const img = new Float32Array(W * H * 3);
  fill(img, 0, 0, W, H, [0.4, 0.5, 0.7]);
  for (let b = 0; b < 4; b++) {
    const x0 = b * 160 + 5;
    const top = 60 + rand() * 120;
    fill(img, x0, top, 150, H, [0.2 + 0.3 * rand(), 0.2 + 0.2 * rand(), 0.15 + 0.2 * rand()]);
    for (let wy = top + 15; wy < H - 20; wy += 36) {
      for (let wx = x0 + 10; wx < x0 + 140; wx += 28) fill(img, wx, wy, 16, 22, [0.05, 0.06, 0.08]);
    }
  }
  return img;
}

/** A reflecting pool behind a railing: long horizontal lines, a few posts, a tree line. */
function railing(): Scene {
  const img = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const water = [0.2, 0.3, 0.4 + 0.03 * Math.sin(y * 1.3)];
      img.set(y < 200 ? [0.5, 0.6, 0.8] : y < 300 ? [0.3, 0.3, 0.28] : water, (y * W + x) * 3);
    }
  }
  for (const y of [310, 318, 340]) fill(img, 0, y, W, 2, [0.9, 0.9, 0.85]);
  for (let x = 5; x < W; x += 40) fill(img, x, 310, 3, 32, [0.9, 0.9, 0.85]);
  fill(img, 300, 40, 30, 160, [0.85, 0.85, 0.8]);
  for (let x = 0; x < W; x += 3) fill(img, x, 190 + 6 * Math.sin(x / 9), 3, 12, [0.08, 0.15, 0.06]);
  return img;
}

/** Wide stripes at a slant, like a roofline or a staircase seen at an angle. */
function slantedStripes(angle: number): Scene {
  const img = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.floor((x * Math.cos(angle) + y * Math.sin(angle)) / 40) % 2 ? 0.6 : 0.1;
      img.set([v, v, v], (y * W + x) * 3);
    }
  }
  return img;
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
    expect(kinds(check(toRgba(motionBlur(base, 5, 1, 0))))).toEqual(["shake:small"]);
    const issues = check(toRgba(motionBlur(base, 5, 0, 1)));
    expect(kinds(issues)).toEqual(["shake:big"]);
    expect(issues[0].title).toBe("Blurry");
    expect(issues[0].why).toContain("runs one way");
    // A diagonal shake shows on edges that run every way.
    expect(kinds(check(toRgba(motionBlur(pebbles(), 3, 1, 0))))).toEqual(["shake:small"]);
    expect(kinds(check(toRgba(motionBlur(pebbles(), 5))))).toEqual(["shake:big"]);
  });

  it("doesn't mistake long straight lines for shake", () => {
    // Buildings, a railing over water, slanted stripes: sharp, or a touch soft as lenses are.
    for (const img of [street(), railing(), slantedStripes(0.35)]) {
      for (const soft of [0, 0.6]) {
        const issues = check(toRgba(soft ? gaussianBlur(img, soft) : img, 2));
        expect(issues.map((i) => i.kind)).not.toContain("shake");
      }
    }
    expect(measure(toRgba(street()), W, H).smear).toBeLessThan(0.1);
    expect(measure(toRgba(railing()), W, H).smear).toBeLessThan(0.1);
  });

  it("still sees shake on a street of straight lines", () => {
    expect(kinds(check(toRgba(motionBlur(street(), 5, 1, 0))))).toEqual(["shake:big"]);
    expect(kinds(check(toRgba(motionBlur(railing(), 5, 0, 1))))).toEqual(["shake:small"]);
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

  it("blames movement, not focus, for a soft Night mode photo, and doesn't tell a phone to set a shutter", () => {
    const phone = { ...camera, device: identifyDevice("Apple", "iPhone 18 Pro"), exposureTime: 1, fNumber: 1.8 };
    const [issue] = check(toRgba(gaussianBlur(base, 3)), phone);
    expect(issue.kind).toBe("shake");
    expect(issue.why).not.toMatch(/Aim for|f\/1.8/);
    const [shake] = check(toRgba(motionBlur(base, 9)), phone);
    expect(shake.kind).toBe("shake");
    // The saved shutter speed is one frame of many, so it isn't quoted.
    expect(shake.why).toContain("Night mode keeps taking the photo for a second or more");
    expect(shake.why).not.toContain("1s");
  });

  it("catches the even softness Night mode leaves when the phone or subject moved", () => {
    // Night mode blends its frames, so movement leaves no one-way smear: just a photo a bit softer
    // than a phone's usual crisp output (IMG_2703 and IMG_2733 in the iCloud test).
    const iphone = { ...camera, device: identifyDevice("Apple", "iPhone 18 Pro"), fNumber: 1.8 };
    const soft = toRgba(gaussianBlur(base, 0.5));
    expect(kinds(check(soft, { ...iphone, exposureTime: 1 / 4 }))).toEqual(["shake:small"]);
    // The same softness on a normal phone shot, or a sharp Night mode one, is fine.
    expect(check(soft, { ...iphone, exposureTime: 1 / 60 })).toEqual([]);
    expect(check(toRgba(base), { ...iphone, exposureTime: 1 / 2 })).toEqual([]);
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

/** A flat linear-light colour, with rectangles and discs painted on. */
function canvas(rgb: number[]): Scene {
  const img = new Float32Array(W * H * 3);
  for (let p = 0; p < W * H; p++) img.set(rgb, p * 3);
  return img;
}

function paint(img: Scene, rgb: number[], inside: (x: number, y: number) => boolean): Scene {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) img.set(rgb, (y * W + x) * 3);
  return img;
}

const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const box = (x0: number, y0: number, x1: number, y1: number) => (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;

describe("dark scenes", () => {
  const night = [0.0004, 0.0004, 0.0006];
  const handHeld = { ...camera, exposureTime: 1 / 15, focalLength: 135 };

  it("doesn't call the moon on a night sky too dark, and flags the moon itself as blown out", () => {
    // A white moon covering about 0.4% of the frame, like the 135mm moon shots on a Rebel XT.
    const moon = paint(canvas(night), [1, 1, 1], disc(400, 150, 20));
    const issues = check(toRgba(moon), handHeld);
    expect(issues.some((i) => i.kind === "dark")).toBe(false);
    const [blown] = issues;
    expect(blown).toMatchObject({ kind: "bright", severity: "big", title: "Bright spot blown out", darkScene: true });
    expect(blown.area.length).toBeGreaterThan(0);
    // Without the moon it's just a black photo.
    expect(kinds(check(toRgba(canvas(night)), handHeld))).toEqual(["dark:big"]);
  });

  it("leaves a neon sign at night alone: its colour is bright, not blown out", () => {
    const sign = paint(canvas(night), [1, 0.03, 0.03], (x, y) => box(200, 100, 440, 130)(x, y) || box(300, 130, 320, 300)(x, y));
    paint(sign, [0.004, 0.004, 0.005], box(0, 300, W, H));
    expect(check(toRgba(sign))).toEqual([]);
  });

  it("leaves a flash portrait on a black background alone, but not a dim one", () => {
    // Face and shirt lit by the flash, a little shine on the forehead, night behind.
    const lit = paint(canvas(night), [0.3, 0.2, 0.15], box(220, 120, 420, H));
    paint(lit, [0.97, 0.95, 0.9], box(300, 150, 330, 170));
    expect(check(toRgba(lit))).toEqual([]);
    // The same shot with too little flash: the subject is murky and nothing reaches full brightness.
    const dim = paint(canvas(night), [0.03, 0.02, 0.015], box(220, 120, 420, H));
    paint(dim, [0.09, 0.09, 0.08], box(300, 150, 330, 170));
    expect(check(toRgba(dim)).map((i) => i.kind)).toContain("dark");
  });

  it("leaves a sunset alone, where bright colour fills the sky over a dark sea", () => {
    const sunset = paint(canvas([0.12, 0.035, 0.01]), [0.02, 0.012, 0.012], box(0, H / 2, W, H));
    const clouds = paint(sunset.slice(), [1, 0.45, 0.08], box(0, 150, W, 175));
    expect(check(toRgba(clouds)).some((i) => i.kind === "dark")).toBe(false);
    // Without the glowing clouds the same frame is just underexposed.
    expect(check(toRgba(sunset)).some((i) => i.kind === "dark")).toBe(true);
  });
});
