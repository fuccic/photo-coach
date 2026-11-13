import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { findIssues, type Issue } from "@core/analysis/checks";
import type { ImageStats } from "@core/analysis/measure";
import type { PhotoMeta } from "@core/exif";
import { measurePhoto, readMeta } from "./analyze";

export type Photo = {
  id: string;
  uri: string;
  width: number;
  height: number;
  meta?: PhotoMeta;
  /** undefined while checking, null when the photo couldn't be read. */
  stats?: ImageStats | null;
  issues?: Issue[] | null;
};

export type Picked = { uri: string; width: number; height: number };

type Store = { photos: Photo[]; add: (picked: Picked[]) => string[]; remove: (id: string) => void };

const PhotosContext = createContext<Store | null>(null);

/**
 * Photos picked this session, newest first. Kept in memory for now; saving them between launches
 * is a later step (the website uses IndexedDB, the phone app will use its own storage).
 */
export function PhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);

  const update = useCallback((id: string, patch: Partial<Photo>) => {
    setPhotos((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const add = useCallback(
    (picked: Picked[]) => {
      const added = picked.map((p, i) => ({ ...p, id: `${Date.now().toString(36)}-${i}` }));
      setPhotos((all) => [...added, ...all]);
      // One at a time, so a batch of big photos doesn't run the phone out of memory.
      (async () => {
        for (const p of added) {
          const meta = await readMeta(p.uri);
          update(p.id, { meta });
          const stats = await measurePhoto(p.uri, p.width, p.height);
          update(p.id, { stats, issues: stats ? findIssues(stats, meta) : null });
        }
      })();
      return added.map((p) => p.id);
    },
    [update],
  );

  const remove = useCallback((id: string) => setPhotos((all) => all.filter((p) => p.id !== id)), []);

  const value = useMemo(() => ({ photos, add, remove }), [photos, add, remove]);
  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotos(): Store {
  const store = useContext(PhotosContext);
  if (!store) throw new Error("usePhotos needs PhotosProvider");
  return store;
}

export function usePhoto(id: string | undefined): Photo | undefined {
  return usePhotos().photos.find((p) => p.id === id);
}
