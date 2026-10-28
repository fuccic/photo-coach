import { detectFormat } from "./fileTypes";
import { extractEmbeddedJpeg } from "./rawPreview";

/**
 * Makes something the browser can show: "original" when it can show the file itself, a JPEG for
 * RAW and (outside Safari) HEIC, or null when the photo can't be previewed.
 */
export async function makePreview(file: Blob, fileName: string): Promise<Blob | "original" | null> {
  const format = detectFormat(fileName, file.type);
  try {
    if (format === "arw") {
      const jpeg = extractEmbeddedJpeg(await file.arrayBuffer());
      return jpeg ? new Blob([jpeg.slice()], { type: "image/jpeg" }) : null;
    }
    if (format === "heic" && !(await canDecode(file))) {
      // Only Safari decodes HEIC natively; elsewhere convert in the browser. Loaded on demand (~1 MB).
      const { default: heic2any } = await import("heic2any");
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      return Array.isArray(out) ? out[0] : out;
    }
    return "original";
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
