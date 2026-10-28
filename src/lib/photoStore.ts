import type { ImageStats } from "./analysis/measure";
import type { PhotoMeta } from "./exif";
import type { PhotoFormat } from "./fileTypes";

/**
 * Saved photos, kept in this browser's IndexedDB so they survive closing the tab.
 * Nothing leaves the device (PLAN.md: no accounts or uploads in the MVP).
 */
export type StoredPhoto = {
  id: string;
  fileName: string;
  format: PhotoFormat;
  /** Milliseconds since 1970, when the photo was added. Newest is shown first. */
  addedAt: number;
  /** The file as picked, or null when the browser ran out of space and only the preview was kept. */
  original: Blob | null;
  /**
   * What the app shows: "original" when the browser can show the file itself, a converted JPEG for
   * HEIC (outside Safari) and RAW, null when it can't be shown, undefined until it has been made.
   */
  preview?: Blob | "original" | null;
  meta?: PhotoMeta;
  stats?: ImageStats | null;
  /** MEASURE_VERSION the stats were taken with. Older stats are measured again. */
  statsVersion?: number;
};

const DB_NAME = "photo-coach";
const STORE = "photos";

let opening: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  opening.catch(() => (opening = undefined));
  return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const req = work(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Every saved photo, newest first. */
export async function loadPhotos(): Promise<StoredPhoto[]> {
  const all = await run<StoredPhoto[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

/** Saves a new photo. If the browser is out of space, tries again without the original file. */
export async function savePhoto(photo: StoredPhoto): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(photo));
  } catch (e) {
    if (!isQuotaError(e) || !photo.original) throw e;
    await run("readwrite", (s) => s.put({ ...photo, original: null }));
  }
}

/** Updates a saved photo. Does nothing if it was deleted meanwhile. */
export async function updatePhoto(id: string, patch: Partial<Omit<StoredPhoto, "id">>): Promise<void> {
  await run("readwrite", (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (req.result) s.put({ ...req.result, ...patch });
    };
  });
}

export async function deletePhoto(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Asks the browser not to clear saved photos when space is low. Some browsers show a prompt. */
export function askToKeepPhotos(): void {
  navigator.storage?.persisted?.().then((kept) => kept || navigator.storage.persist()).catch(() => {});
}

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "QuotaExceededError";
}
