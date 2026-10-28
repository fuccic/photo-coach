"use client";

import Link from "next/link";
import { AddPhotosButton } from "@/components/AddPhotosButton";
import { BottomNav } from "@/components/BottomNav";
import { DeviceIcon } from "@/components/DeviceLabel";
import { AddPhotoIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/PhotoThumb";
import { usePhotos } from "@/components/PhotosProvider";
import { KNOWN_DEVICES } from "@/lib/devices";

export default function Home() {
  const { photos } = usePhotos();
  const recent = photos.slice(0, 6);

  return (
    <>
      <main className="flex grow flex-col gap-7 px-6 pt-14 pb-6 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:content-start md:gap-x-10 md:pt-10">
        <h1 className="text-[26px] font-bold tracking-tight md:sr-only">Photo Coach</h1>

        <AddPhotosButton className="flex h-56 flex-col items-center justify-center gap-3 rounded-3xl bg-accent text-on-accent hover:bg-accent-ink md:row-span-2 md:h-[420px]">
          <AddPhotoIcon size={48} />
          <span className="text-[22px] font-bold">Add a photo</span>
          <span className="hidden text-sm opacity-85 md:block">or drop photos here</span>
        </AddPhotosButton>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-medium text-muted">My cameras</h2>
          <ul className="flex flex-wrap gap-2">
            {KNOWN_DEVICES.map((d) => (
              <li key={d.id} className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-3.5 text-[15px]">
                <DeviceIcon device={{ ...d, supported: true }} size={18} />
                {d.name}
              </li>
            ))}
          </ul>
        </section>

        {recent.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-medium text-muted">Recent</h2>
            <ul className="grid grid-cols-3 gap-2">
              {recent.map((p, i) => (
                <li key={p.id} className={i >= 3 ? "hidden md:block" : undefined}>
                  <Link href={`/photo/${p.id}`} aria-label={p.fileName} className="block overflow-hidden rounded-2xl">
                    <PhotoThumb photo={p} className="aspect-square w-full" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <BottomNav current="/" />
    </>
  );
}
