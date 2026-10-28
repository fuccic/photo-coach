"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { analyzeImage } from "@/lib/analysis/analyzeImage";
import type { ImageStats } from "@/lib/analysis/measure";
import { readPhotoMeta, type PhotoMeta } from "@/lib/exif";
import { detectFormat, type PhotoFormat } from "@/lib/fileTypes";
import { makePreviewUrl } from "@/lib/preview";

export type Photo = {
  id: string;
  fileName: string;
  format: PhotoFormat;
  /** undefined while loading, null when the browser can't show this file. */
  previewUrl?: string | null;
  /** undefined while the metadata is being read. */
  meta?: PhotoMeta;
  /** Pixel measurements for the photo checks: undefined while measuring, null when it couldn't be read. */
  stats?: ImageStats | null;
};

type PhotosContextValue = {
  /** Newest first. */
  photos: Photo[];
  /** Photos from the most recent "Add a photo", in the order picked. */
  lastBatch: string[];
  addFiles: (files: File[]) => string[];
};

const PhotosContext = createContext<PhotosContextValue | null>(null);

// Photos stay in this browser tab only (PLAN.md: no accounts or uploads in the MVP).
export function PhotosProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lastBatch, setLastBatch] = useState<string[]>([]);

  const update = useCallback((id: string, patch: Partial<Photo>) => {
    setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // Photos are measured one at a time (about 0.1s each) so a big batch doesn't freeze the page.
  const queue = useRef(Promise.resolve());
  const measureLater = useCallback(
    (id: string, url: string | null) => {
      if (!url) return update(id, { stats: null });
      queue.current = queue.current.then(async () => {
        await new Promise((r) => setTimeout(r));
        update(id, { stats: await analyzeImage(url) });
      });
    },
    [update],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const added: Photo[] = files.map((file) => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        format: detectFormat(file.name, file.type),
      }));
      setPhotos((list) => [...[...added].reverse(), ...list]);
      setLastBatch(added.map((p) => p.id));

      added.forEach((photo, i) => {
        const file = files[i];
        readPhotoMeta(file).then((meta) => update(photo.id, { meta }));
        makePreviewUrl(file).then((previewUrl) => {
          update(photo.id, { previewUrl });
          measureLater(photo.id, previewUrl);
        });
      });
      return added.map((p) => p.id);
    },
    [update, measureLater],
  );

  const value = useMemo(() => ({ photos, lastBatch, addFiles }), [photos, lastBatch, addFiles]);
  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotos(): PhotosContextValue {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside PhotosProvider");
  return ctx;
}
