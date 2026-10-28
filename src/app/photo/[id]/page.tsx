"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DeviceLabel } from "@/components/DeviceLabel";
import { BackIcon, NextIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/PhotoThumb";
import { usePhotos } from "@/components/PhotosProvider";
import { SettingChips } from "@/components/SettingChips";
import { TopBar } from "@/components/TopBar";
import type { PhotoMeta } from "@/lib/exif";
import { formatExposureComp, formatFocal } from "@/lib/format";

const MODE_NAMES: Record<NonNullable<PhotoMeta["mode"]>, string> = {
  manual: "M",
  program: "P",
  aperture: "A",
  shutter: "S",
  other: "Scene",
};

export default function PhotoReview() {
  const { id } = useParams<{ id: string }>();
  const { photos, lastBatch } = usePhotos();
  const inBatch = lastBatch.includes(id);
  const sequence = inBatch ? lastBatch : photos.map((p) => p.id);
  const index = sequence.indexOf(id);
  const photo = photos.find((p) => p.id === id);

  if (!photo) {
    return (
      <>
        <TopBar back="/" />
        <main className="flex grow flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
          <p className="text-lg font-medium">This photo is gone</p>
          <p className="text-muted">Photos stay on this page only until you close it.</p>
          <Link href="/" className="flex min-h-12 items-center rounded-2xl bg-accent px-6 font-bold text-on-accent">
            Add a photo
          </Link>
        </main>
      </>
    );
  }

  const meta = photo.meta;
  const prev = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : undefined;

  const details = meta
    ? [
        { label: "Focal length", value: formatFocal(meta.focalLength35 ?? meta.focalLength) },
        { label: "Mode", value: meta.mode ? MODE_NAMES[meta.mode] : undefined },
        { label: "Exposure", value: formatExposureComp(meta.exposureComp) },
        { label: "Flash", value: meta.flashFired === undefined ? undefined : meta.flashFired ? "On" : "Off" },
      ].filter((d) => d.value)
    : [];

  return (
    <>
      <TopBar
        back={inBatch ? "/upload" : "/library"}
        right={
          sequence.length > 1 && (
            <div className="flex">
              <PagerLink id={prev} label="Previous photo">
                <BackIcon />
              </PagerLink>
              <PagerLink id={next} label="Next photo">
                <NextIcon />
              </PagerLink>
            </div>
          )
        }
      >
        {sequence.length > 1 && (
          <span className="text-[15px] text-muted">
            {index + 1} of {sequence.length}
          </span>
        )}
      </TopBar>

      <main className="flex grow flex-col gap-4 px-4 pb-8 md:grid md:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] md:items-start md:gap-8">
        <div className="relative overflow-hidden rounded-[20px] bg-[#1a1916]">
          <PhotoThumb photo={photo} fit="contain" className="h-[min(60vh,420px)] w-full md:h-[calc(100dvh-14rem)] md:min-h-[360px]" />
          {meta?.hasSettings && (
            <div className="absolute bottom-3 left-3">
              <SettingChips meta={meta} tone="overlay" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-20">
          <div className="flex flex-col gap-1 px-1">
            <DeviceLabel device={meta?.device} className="text-[15px] font-medium" />
            {meta?.lens && <span className="truncate text-sm text-muted">{meta.lens}</span>}
          </div>

          {meta && !meta.hasSettings && (
            <p className="rounded-[18px] bg-warn/25 p-4 text-[15px]">
              No camera settings in this file. Messaging apps often remove them, so try the original photo.
            </p>
          )}

          {details.length > 0 && (
            <dl className="grid grid-cols-2 gap-2">
              {details.map((d) => (
                <div key={d.label} className="rounded-2xl bg-surface px-4 py-3">
                  <dt className="text-xs text-muted">{d.label}</dt>
                  <dd className="font-mono text-lg">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </main>
    </>
  );
}

function PagerLink({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  if (!id) {
    return (
      <span aria-hidden="true" className="flex size-11 items-center justify-center text-line">
        {children}
      </span>
    );
  }
  return (
    <Link href={`/photo/${id}`} aria-label={label} className="flex size-11 items-center justify-center">
      {children}
    </Link>
  );
}
