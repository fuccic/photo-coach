import { detectFormat, isRaw } from "./fileTypes";
import { extractRawPreview } from "./rawPreview";

/**
 * The RAW previews we use sit near the start of the file (within the first ~1 MB on Rebel XT CR2s
 * and Lightroom DNGs), so read only this much first and fall back to the whole file (8-25 MB).
 */
const RAW_HEAD_BYTES = 4 * 1024 * 1024;

/**
 * Makes something the browser can show: "original" when it can show the file itself, a JPEG for
 * RAW and (outside Safari) HEIC, or null when the photo can't be previewed.
 */
export async function makePreview(file: Blob, fileName: string): Promise<Blob | "original" | null> {
  const format = detectFormat(fileName, file.type);
  try {
    if (isRaw(format)) {
      let preview = file.size > RAW_HEAD_BYTES ? extractRawPreview(await file.slice(0, RAW_HEAD_BYTES).arrayBuffer(), true) : null;
      preview ??= extractRawPreview(await file.arrayBuffer());
      return preview ? new Blob([preview.jpeg.slice()], { type: "image/jpeg" }) : null;
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

/** A JPEG no bigger than `maxEdge` on its long side, for keeping when there's no room for the original. */
export async function makeSmallCopy(file: Blob, fileName: string, maxEdge = 2048): Promise<Blob | null> {
  const preview = await makePreview(file, fileName);
  const shown = preview === "original" ? file : preview;
  if (!shown) return null;
  try {
    const bitmap = await createImageBitmap(shown);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}
