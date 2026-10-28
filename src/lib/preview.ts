import { detectFormat } from "./fileTypes";
import { extractEmbeddedJpeg } from "./rawPreview";

/** Returns an object URL the browser can show, or null when the photo can't be previewed. */
export async function makePreviewUrl(file: File): Promise<string | null> {
  const format = detectFormat(file.name, file.type);
  try {
    if (format === "arw") {
      const jpeg = extractEmbeddedJpeg(await file.arrayBuffer());
      return jpeg ? URL.createObjectURL(new Blob([jpeg.slice()], { type: "image/jpeg" })) : null;
    }
    if (format === "heic" && !(await canDecode(file))) {
      // Only Safari decodes HEIC natively; elsewhere convert in the browser. Loaded on demand (~1 MB).
      const { default: heic2any } = await import("heic2any");
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      return URL.createObjectURL(Array.isArray(out) ? out[0] : out);
    }
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

async function canDecode(file: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== "function") return false;
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}
