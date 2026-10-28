import type { PhotoMeta } from "@/lib/exif";
import { formatAperture, formatIso, formatShutter } from "@/lib/format";

/** Shutter, aperture and ISO as small mono chips, like the camera's own display. */
export function SettingChips({ meta, tone }: { meta: PhotoMeta; tone: "light" | "overlay" }) {
  const chips = [formatShutter(meta.exposureTime), formatAperture(meta.fNumber), formatIso(meta.iso)].filter(Boolean);
  const chipClass = tone === "overlay" ? "bg-black/55 text-white" : "bg-bg";
  return (
    <ul aria-label="Camera settings" className="flex flex-wrap gap-1.5 font-mono text-[13px]">
      {chips.map((c) => (
        <li key={c} className={`rounded-lg px-2 py-1 ${chipClass}`}>
          {c}
        </li>
      ))}
    </ul>
  );
}
