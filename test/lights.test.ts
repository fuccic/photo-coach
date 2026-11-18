import { describe, expect, it } from "vitest";
import { measureLights } from "@/lib/analysis/lights";
import { findIssues } from "@/lib/analysis/checks";
import { measure } from "@/lib/analysis/measure";
import { identifyDevice } from "@/lib/devices";
import type { PhotoMeta } from "@/lib/exif";

const W = 800;
const H = 600;

/** A dim room with a string of small warm lights, each drawn along the path the camera took. */
function stringLights(path: (t: number) => [number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) rgba.set([30, 22, 18, 255], i * 4);
  for (let k = 0; k < 24; k++) {
    const x0 = 60 + (k % 8) * 90;
    const y0 = 120 + Math.floor(k / 8) * 150 + (k % 3) * 12;
    for (let s = 0; s <= 40; s++) {
      const [dx, dy] = path(s / 40);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const x = Math.round(x0 + dx + ox);
          const y = Math.round(y0 + dy + oy);
          if (x >= 0 && x < W && y >= 0 && y < H) rgba.set([255, 240, 200, 255], (y * W + x) * 4);
        }
      }
    }
  }
  return rgba;
}

const still = stringLights(() => [0, 0]);
const shaken = stringLights((t) => [14 * t, 6 * t]);
const iphone: PhotoMeta = { hasSettings: true, device: identifyDevice("Apple", "iPhone 18 Pro"), exposureTime: 1 / 15, iso: 3200 };

describe("lights", () => {
  it("finds point lights and sees them as dots when the camera held still", () => {
    const { lights, lightStreak } = measureLights(still, W, H);
    expect(lights).toBe(24);
    expect(lightStreak).toBeLessThan(0.1);
  });

  it("sees the lights streak the same way when the camera moved", () => {
    const { lights, lightStreak } = measureLights(shaken, W, H);
    expect(lights).toBe(24);
    expect(lightStreak).toBeGreaterThan(0.6);
  });

  it("ignores big bright areas that aren't lights", () => {
    const wall = new Uint8ClampedArray(W * H * 4).fill(250);
    expect(measureLights(wall, W, H).lights).toBe(0);
  });

  it("calls a phone night photo with streaked lights blurry, and leaves the still one alone", () => {
    const blur = findIssues(measure(shaken, W, H), iphone).find((i) => i.kind === "shake");
    expect(blur?.why).toContain("The lights turned into streaks that all run the same way");
    expect(findIssues(measure(still, W, H), iphone).some((i) => i.kind === "shake")).toBe(false);
  });
});
