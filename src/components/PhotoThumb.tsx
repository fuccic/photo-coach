/* eslint-disable @next/next/no-img-element -- previews are local object URLs, not optimisable remote images */
import type { Photo } from "./PhotosProvider";
import { DeviceIcon } from "./DeviceLabel";

export function PhotoThumb({ photo, className = "", fit = "cover" }: { photo: Photo; className?: string; fit?: "cover" | "contain" }) {
  if (photo.previewUrl) {
    return (
      <img
        src={photo.previewUrl}
        alt=""
        className={`${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-[#3a3440] text-white/60 ${className}`}>
      {photo.previewUrl === undefined ? (
        <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white/80" role="status" aria-label="Loading" />
      ) : (
        <DeviceIcon device={photo.meta?.device} size={28} />
      )}
    </div>
  );
}
