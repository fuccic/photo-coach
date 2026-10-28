"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DeviceLabel } from "@/components/DeviceLabel";
import { AreaIcon, BackIcon, NextIcon } from "@/components/icons";
import { AreaOverlay, IssueBadge, usePhotoIssues } from "@/components/Issues";
import { PhotoThumb } from "@/components/PhotoThumb";
import { usePhotos, type Photo } from "@/components/PhotosProvider";
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
  // Remount per photo so the picked problem and toggles start fresh.
  return <Review key={id} id={id} />;
}

function Review({ id }: { id: string }) {
  const { photos, lastBatch } = usePhotos();
  const inBatch = lastBatch.includes(id);
  const sequence = inBatch ? lastBatch : photos.map((p) => p.id);
  const index = sequence.indexOf(id);
  const photo = photos.find((p) => p.id === id);
  const issues = usePhotoIssues(photo);
  const [picked, setPicked] = useState(0);
  const [showArea, setShowArea] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

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
  const selected = issues?.[picked];
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
          {showArea && selected && photo.stats && <AreaOverlay stats={photo.stats} area={selected.area} />}
          {selected && selected.area.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArea(!showArea)}
              aria-label="Show problem area"
              aria-pressed={showArea}
              className={`absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-white ${showArea ? "bg-accent" : "bg-black/55"}`}
            >
              <AreaIcon />
            </button>
          )}
          {meta?.hasSettings && (
            <div className="absolute bottom-3 left-3">
              <SettingChips meta={meta} tone="overlay" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-20">
          <Problems
            photo={photo}
            issues={issues}
            picked={picked}
            onPick={(i) => {
              setPicked(i);
              setShowWhy(false);
              setShowArea(false);
            }}
            showWhy={showWhy}
            onToggleWhy={() => setShowWhy(!showWhy)}
          />

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

const TILE = "flex min-h-24 flex-col items-start gap-2 rounded-2xl border-2 bg-surface p-3 text-left";

function Problems({
  photo,
  issues,
  picked,
  onPick,
  showWhy,
  onToggleWhy,
}: {
  photo: Photo;
  issues: ReturnType<typeof usePhotoIssues>;
  picked: number;
  onPick: (i: number) => void;
  showWhy: boolean;
  onToggleWhy: () => void;
}) {
  if (issues === undefined) {
    return (
      <div className={`${TILE} border-transparent`} role="status">
        <span className="size-8 animate-spin rounded-full border-3 border-line border-t-accent" aria-hidden="true" />
        <span className="font-bold">Checking…</span>
      </div>
    );
  }
  if (issues === null) {
    return (
      <p className="rounded-[18px] bg-surface p-4 text-[15px] text-muted">
        {photo.previewUrl === null ? "This browser can't open this file, so it can't be checked." : "This photo couldn't be checked."}
      </p>
    );
  }
  if (issues.length === 0) {
    return (
      <div className={`${TILE} border-transparent`}>
        <IssueBadge kind="good" tone="good" />
        <span className="text-[15px] font-bold">Looks good</span>
      </div>
    );
  }

  const selected = issues[picked] ?? issues[0];
  return (
    <section aria-label="Problems" className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {issues.map((issue, i) => (
          <button
            key={issue.kind}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={issue === selected}
            className={`${TILE} ${issue === selected ? "border-accent" : "border-transparent"}`}
          >
            <IssueBadge kind={issue.kind} tone={issue.severity} />
            <span className="text-[15px] leading-tight font-bold">{issue.title}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-[18px] bg-surface p-4">
        <div className="flex items-center gap-3">
          <span className="grow font-mono text-sm text-muted uppercase">{selected.severity === "big" ? "Big problem" : "Small problem"}</span>
          <button
            type="button"
            onClick={onToggleWhy}
            aria-expanded={showWhy}
            className="min-h-12 rounded-[14px] border border-line px-4 text-base"
          >
            Why?
          </button>
        </div>
        {showWhy && <p className="text-[15px] leading-snug text-muted">{selected.why}</p>}
      </div>
    </section>
  );
}
