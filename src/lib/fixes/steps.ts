import type { ShootingMode } from "../exif";
import { formatAperture, formatExposureComp, formatIso, formatShutter } from "../format";
import type { Guide, Step } from "../instructions";
import type { Action, Change, Fix } from "./solver";

/** The fix as numbered one-line steps for this device. */
export function stepsFor(fix: Fix, guide: Guide): Step[] {
  return fix.actions.flatMap((action) => {
    const recipe = (guide.levers as Record<string, Step[]>)[action.lever] ?? [];
    const value = action.value === undefined ? "" : formatValue(action, guide);
    return recipe.map((s) => ({ ...s, text: s.text.replace("{value}", value) }));
  });
}

function formatValue(action: Action, guide: Guide): string {
  const v = action.value;
  if (typeof v === "string") {
    return guide.kind === "camera" && v !== "other" ? guide.modeNames[v as Exclude<ShootingMode, "other">] : v;
  }
  if (v === undefined) return "";
  switch (action.lever) {
    case "iso":
      return String(Math.round(v));
    case "shutter":
      return formatShutter(v)?.replace(/s$/, "") ?? "";
    case "aperture":
      return formatAperture(v) ?? "";
    case "ev":
      return formatEv(v);
    default:
      return String(v);
  }
}

/** +1, -0.7, 0: how exposure dials are marked. */
function formatEv(ev: number): string {
  const r = Number(ev.toFixed(1));
  return r > 0 ? `+${r}` : String(r);
}

/** A change as the two sides of "ISO 100 → 800". A side is missing when the photo didn't record it. */
export function formatChange(c: Change): { from?: string; to: string } {
  switch (c.setting) {
    case "iso":
      return { from: formatIso(c.from), to: c.from === undefined ? `ISO ${c.to}` : String(c.to) };
    case "shutter":
      return { from: formatShutter(c.from), to: formatShutter(c.to) ?? "" };
    case "aperture":
      return { from: formatAperture(c.from), to: formatAperture(c.to) ?? "" };
    case "ev":
      return { from: formatExposureComp(c.from ?? 0), to: formatExposureComp(c.to) ?? "" };
  }
}
