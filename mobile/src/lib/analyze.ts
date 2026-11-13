import { File, FileMode } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ANALYSIS_SIZE } from "@core/analysis/analyzeImage";
import type { ImageStats } from "@core/analysis/measure";
import { readPhotoMeta, type PhotoMeta } from "@core/exif";
import { base64ToBytes, measureJpeg } from "./decode";

/** EXIF sits at the start of the file; read this much first, like the website does. */
const HEAD_BYTES = 1024 * 1024;

/** Settings and camera from the original file. Never throws: a photo without EXIF still gets checked. */
export async function readMeta(uri: string): Promise<PhotoMeta | undefined> {
  try {
    return await readMetaFromFile(uri);
  } catch {
    // expo-file-system can't open every kind of URI (the web preview's blob: URLs); fetch can.
    try {
      return await readPhotoMeta(new Uint8Array(await (await fetch(uri)).arrayBuffer()));
    } catch {
      return undefined;
    }
  }
}

async function readMetaFromFile(uri: string): Promise<PhotoMeta> {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  let head: Uint8Array;
  try {
    head = await handle.readBytes(HEAD_BYTES);
  } finally {
    handle.close();
  }
  const meta = await readPhotoMeta(head);
  if (meta.hasSettings || head.length < HEAD_BYTES) return meta;
  return readPhotoMeta(await file.bytes());
}

/**
 * Pixel measurements at the website's analysis size. The phone decodes the photo (JPEG or HEIC),
 * shrinks it to 1600px on the long edge and hands back a full-quality JPEG, which is read in
 * JavaScript so the same measure() runs here and on the website.
 */
export async function measurePhoto(uri: string, width = 0, height = 0): Promise<ImageStats | null> {
  try {
    if (!width || !height) {
      // The system didn't say how big the photo is; open it once to find out.
      const probe = await ImageManipulator.manipulate(uri).renderAsync();
      width = probe.width;
      height = probe.height;
    }
    const context = ImageManipulator.manipulate(uri);
    const scale = ANALYSIS_SIZE / Math.max(width, height);
    if (scale < 1) {
      // Same rounding as the website (analysis/analyzeImage.ts).
      context.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    if (!saved.base64) return null;
    return measureJpeg(base64ToBytes(saved.base64));
  } catch {
    return null;
  }
}
