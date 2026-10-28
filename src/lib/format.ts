/** 0.0333 -> "1/30s", 2 -> "2s", 0.4 -> "0.4s" */
export function formatShutter(seconds?: number): string | undefined {
  if (seconds === undefined || !(seconds > 0)) return undefined;
  if (seconds >= 0.3) {
    return `${Number(seconds.toFixed(1))}s`;
  }
  return `1/${Math.round(1 / seconds)}s`;
}

export function formatAperture(fNumber?: number): string | undefined {
  if (fNumber === undefined || !(fNumber > 0)) return undefined;
  return `f/${Number(fNumber.toFixed(1))}`;
}

export function formatIso(iso?: number): string | undefined {
  if (iso === undefined || !(iso > 0)) return undefined;
  return `ISO ${Math.round(iso)}`;
}

export function formatFocal(mm?: number): string | undefined {
  if (mm === undefined || !(mm > 0)) return undefined;
  return `${Number(mm.toFixed(1))}mm`;
}

export function formatExposureComp(ev?: number): string | undefined {
  if (ev === undefined || Number.isNaN(ev)) return undefined;
  if (ev === 0) return "0 EV";
  const rounded = Number(ev.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded} EV`;
}
