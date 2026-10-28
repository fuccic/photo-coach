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
  const recent = photos.slice(0, 3);

  return (
    <>
      <main className="flex grow flex-col gap-7 px-6 pt-14 pb-6">
        <h1 className="text-[26px] font-bold tracking-tight">Photo Coach</h1>

        <AddPhotosButton className="flex h-56 flex-col items-center justify-center gap-3 rounded-3xl bg-accent text-on-accent">
          <AddPhotoIcon size={48} />
          <span className="text-[22px] font-bold">Add a photo</span>
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
              {recent.map((p) => (
                <li key={p.id}>
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
