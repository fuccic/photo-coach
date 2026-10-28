import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
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
});
