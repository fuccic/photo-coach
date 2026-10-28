"use client";

import Link from "next/link";
import { useState } from "react";
import { AddPhotosButton } from "@/components/AddPhotosButton";
import { BottomNav } from "@/components/BottomNav";
import { PlusIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/PhotoThumb";
import { usePhotos } from "@/components/PhotosProvider";

const UNKNOWN = "unknown";

export default function Library() {
  const { photos } = usePhotos();
  const [filter, setFilter] = useState("all");

  const deviceOf = (id: string) => photos.find((p) => p.id === id)?.meta?.device;
  const filters = [{ id: "all", label: "All" }];
  for (const p of photos) {
    const key = p.meta?.device?.id ?? UNKNOWN;
    if (p.meta && !filters.some((f) => f.id === key)) {
      filters.push({ id: key, label: p.meta.device?.name ?? "Unknown" });
    }
  }
  const shown = photos.filter((p) => filter === "all" || (deviceOf(p.id)?.id ?? UNKNOWN) === filter);

  return (
    <>
      <main className="flex grow flex-col gap-4 px-4 pt-14 pb-4 md:pt-8">
        <h1 className="mx-2 text-[26px] font-bold">Library</h1>

        {photos.length === 0 ? (
          <AddPhotosButton className="mx-2 flex h-40 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-muted">
            <PlusIcon size={32} />
            <span className="font-medium">Add a photo</span>
          </AddPhotosButton>
        ) : (
          <>
            {filters.length > 2 && (
              <div role="group" aria-label="Filter photos" className="flex flex-wrap gap-2 px-2">
                {filters.map((f) => {
                  const on = f.id === filter;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setFilter(f.id)}
                      className={`min-h-10 rounded-full px-3.5 text-sm font-medium ${on ? "bg-ink text-bg" : "bg-surface text-ink"}`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="grid grid-cols-3 gap-1.5 md:grid-cols-5 md:gap-3 lg:grid-cols-6">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link href={`/photo/${p.id}`} aria-label={p.fileName} className="block overflow-hidden rounded-xl">
                    <PhotoThumb photo={p} className="aspect-square w-full" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <BottomNav current="/library" />
    </>
  );
}
