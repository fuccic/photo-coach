import { measure, type ImageStats } from "./measure";

/** Long edge the photo is measured at: about what a screen shows when the whole photo fits. */
export const ANALYSIS_SIZE = 1600;

/** Measures a photo the browser can show (an object URL of its preview). Null if it can't be read. */
export async function analyzeImage(url: string): Promise<ImageStats | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, ANALYSIS_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    return measure(ctx.getImageData(0, 0, width, height).data, width, height);
  } catch {
    return null;
  }
}
