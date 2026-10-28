"use client";

import Link from "next/link";
import { AddPhotosButton } from "@/components/AddPhotosButton";
import { DeviceLabel } from "@/components/DeviceLabel";
import { AlertIcon, PlusIcon } from "@/components/icons";
import { IssueSummary } from "@/components/Issues";
import { PhotoThumb } from "@/components/PhotoThumb";
import { usePhotos } from "@/components/PhotosProvider";
import { SettingChips } from "@/components/SettingChips";
import { TopBar } from "@/components/TopBar";

export default function Upload() {
  const { photos, lastBatch } = usePhotos();
  const batch = lastBatch.map((id) => photos.find((p) => p.id === id)).filter((p) => p !== undefined);
  const reading = batch.some((p) => !p.meta);

  return (
    <>
      <TopBar
        back="/"
        right={
          <AddPhotosButton label="Add more photos" className="flex size-11 md:hidden items-center justify-center rounded-full bg-surface">
            <PlusIcon />
          </AddPhotosButton>
        }
      >
        <h1 className="text-[22px] font-bold">{batch.length === 1 ? "1 photo" : `${batch.length} photos`}</h1>
      </TopBar>

      <main className="flex grow flex-col gap-3 px-6 pt-2 pb-6 md:grid md:grow-0 md:grid-cols-2 md:content-start lg:grid-cols-3">
        {batch.length === 0 && (
          <AddPhotosButton className="flex h-40 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-muted">
            <PlusIcon size={32} />
            <span className="font-medium">Pick photos</span>
          </AddPhotosButton>
        )}
        {batch.map((p) => (
          <article key={p.id} className="flex items-center gap-3.5 rounded-[18px] bg-surface p-3">
            <PhotoThumb photo={p} className="size-21 shrink-0 rounded-xl" />
            <div className="flex min-w-0 grow flex-col gap-2">
              <DeviceLabel device={p.meta?.device} className="text-[13px] text-muted" />
              {!p.meta ? (
                <span className="text-sm text-muted">Reading…</span>
              ) : p.meta.hasSettings ? (
                <SettingChips meta={p.meta} tone="light" />
              ) : (
                <span className="flex min-h-9 items-center gap-1.5 self-start rounded-full bg-warn px-3 text-sm font-medium text-[#121826]">
                  <AlertIcon size={16} />
                  No settings found
                </span>
              )}
              <IssueSummary photo={p} />
            </div>
          </article>
        ))}
      </main>

      {batch.length > 0 && (
        <div className="sticky bottom-0 bg-bg px-6 pt-2 pb-8 md:static md:flex md:justify-end">
          <Link
            href={`/photo/${batch[0].id}`}
            aria-disabled={reading}
            className={`flex min-h-14 items-center justify-center rounded-2xl hover:bg-accent-ink md:w-72 bg-accent text-lg font-bold text-on-accent ${reading ? "pointer-events-none opacity-60" : ""}`}
          >
            Review
          </Link>
        </div>
      )}
    </>
  );
}
