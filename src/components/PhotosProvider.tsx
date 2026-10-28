"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { analyzeImage } from "@/lib/analysis/analyzeImage";
import { MEASURE_VERSION, type ImageStats } from "@/lib/analysis/measure";
import { readPhotoMeta, type PhotoMeta } from "@/lib/exif";
import { detectFormat, type PhotoFormat } from "@/lib/fileTypes";
import { askToKeepPhotos, deletePhoto, loadPhotos, savePhoto, updatePhoto, type StoredPhoto } from "@/lib/photoStore";
import { makePreview } from "@/lib/preview";

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
  /** True when the browser couldn't save it, so it is gone once the tab closes. */
  unsaved?: boolean;
};

type PhotosContextValue = {
  /** Newest first. */
  photos: Photo[];
  /** False until saved photos have been loaded. */
  ready: boolean;
  /** Photos from the most recent "Add a photo", in the order picked. */
  lastBatch: string[];
  addFiles: (files: File[]) => string[];
  removePhoto: (id: string) => void;
};

const PhotosContext = createContext<PhotosContextValue | null>(null);

// Photos are saved in this browser only (PLAN.md: no accounts or uploads in the MVP).
export function PhotosProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [ready, setReady] = useState(false);
  const [lastBatch, setLastBatch] = useState<string[]>([]);
  const urls = useRef(new Map<string, string>());

  const update = useCallback((id: string, patch: Partial<Photo>) => {
    setPhotos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // Photos are measured one at a time (about 0.1s each) so a big batch doesn't freeze the page.
  const queue = useRef(Promise.resolve());
  const measureLater = useCallback(
    (id: string, url: string | null) => {
      queue.current = queue.current.then(async () => {
        await new Promise((r) => setTimeout(r));
        const stats = url ? await analyzeImage(url) : null;
        update(id, { stats });
        updatePhoto(id, { stats, statsVersion: MEASURE_VERSION }).catch(() => {});
      });
    },
    [update],
  );

  /** Fills in whatever a photo is still missing: metadata, preview, measurements. */
  const prepare = useCallback(
    (rec: StoredPhoto) => {
      const { id, original } = rec;
      if (rec.meta === undefined) {
        readPhotoMeta(original ?? new Uint8Array()).then((meta) => {
          update(id, { meta });
          updatePhoto(id, { meta }).catch(() => {});
        });
      }
      const preview =
        rec.preview !== undefined
          ? Promise.resolve(rec.preview)
          : original
            ? makePreview(original, rec.fileName).then((p) => {
                updatePhoto(id, { preview: p }).catch(() => {});
                return p;
              })
            : Promise.resolve(null);
      preview.then((p) => {
        const blob = p === "original" ? original : p;
        const url = blob ? URL.createObjectURL(blob) : null;
        if (url) urls.current.set(id, url);
        update(id, { previewUrl: url });
        if (rec.stats === undefined || rec.statsVersion !== MEASURE_VERSION) measureLater(id, url);
      });
    },
    [update, measureLater],
  );

  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadPhotos()
      .then((saved) => {
        const fresh = (rec: StoredPhoto) => rec.statsVersion === MEASURE_VERSION;
        const restored: Photo[] = saved.map((rec) => ({
          id: rec.id,
          fileName: rec.fileName,
          format: rec.format,
          meta: rec.meta,
          stats: fresh(rec) ? rec.stats : undefined,
        }));
        // Photos added while loading stay on top.
        setPhotos((list) => [...list, ...restored.filter((r) => !list.some((p) => p.id === r.id))]);
        saved.forEach(prepare);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [prepare]);

  const addFiles = useCallback(
    (files: File[]) => {
      const now = Date.now();
      const added: StoredPhoto[] = files.map((file, i) => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        format: detectFormat(file.name, file.type),
        // Keeps the picked order when several photos are added at once.
        addedAt: now + i,
        original: file,
      }));
      setPhotos((list) => [...added.map(({ id, fileName, format }) => ({ id, fileName, format })).reverse(), ...list]);
      setLastBatch(added.map((p) => p.id));

      askToKeepPhotos();
      for (const rec of added) {
        savePhoto(rec).catch(() => update(rec.id, { unsaved: true }));
        prepare(rec);
      }
      return added.map((p) => p.id);
    },
    [update, prepare],
  );

  const removePhoto = useCallback((id: string) => {
    setPhotos((list) => list.filter((p) => p.id !== id));
    setLastBatch((batch) => batch.filter((b) => b !== id));
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    deletePhoto(id).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ photos, ready, lastBatch, addFiles, removePhoto }),
    [photos, ready, lastBatch, addFiles, removePhoto],
  );
  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotos(): PhotosContextValue {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside PhotosProvider");
  return ctx;
}
