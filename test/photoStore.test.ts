import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { deletePhoto, loadPhotos, savePhoto, updatePhoto, type StoredPhoto } from "@/lib/photoStore";

const photo = (id: string, addedAt: number): StoredPhoto => ({
  id,
  fileName: `${id}.jpg`,
  format: "jpeg",
  addedAt,
  original: new Blob(["jpeg bytes"], { type: "image/jpeg" }),
});

describe("photoStore", () => {
  it("keeps photos, newest first, with their details", async () => {
    await savePhoto(photo("old", 1));
    await savePhoto(photo("new", 2));
    await updatePhoto("old", {
      preview: "original",
      meta: { device: null, hasSettings: false, takenAt: new Date("2026-10-01T10:00:00Z") },
      stats: null,
      statsVersion: 1,
    });

    const saved = await loadPhotos();
    expect(saved.map((p) => p.id)).toEqual(["new", "old"]);
    const old = saved[1];
    expect(old.preview).toBe("original");
    expect(old.meta?.takenAt).toEqual(new Date("2026-10-01T10:00:00Z"));
    expect(old.statsVersion).toBe(1);
    expect(await old.original?.text()).toBe("jpeg bytes");
  });

  it("deletes photos, and a late update doesn't bring one back", async () => {
    await deletePhoto("old");
    await updatePhoto("old", { stats: null });
    expect((await loadPhotos()).map((p) => p.id)).toEqual(["new"]);
  });

  it("keeps a small copy when the browser is out of space for the original", async () => {
    const put = IDBObjectStore.prototype.put;
    const full = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      if ((value as StoredPhoto).original) throw new DOMException("Full", "QuotaExceededError");
      return put.call(this, value, key);
    });
    try {
      const small = new Blob(["small jpeg"], { type: "image/jpeg" });
      expect(await savePhoto(photo("big", 3), async () => small)).toBe(false);
      await expect(savePhoto(photo("none", 4), async () => null)).rejects.toThrow("Full");
    } finally {
      full.mockRestore();
    }
    const saved = (await loadPhotos()).find((p) => p.id === "big");
    expect(saved?.original).toBeNull();
    expect(await (saved?.preview as Blob).text()).toBe("small jpeg");
    expect((await loadPhotos()).some((p) => p.id === "none")).toBe(false);
  });
});
