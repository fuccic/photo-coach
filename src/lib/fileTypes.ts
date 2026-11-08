export type PhotoFormat = "jpeg" | "heic" | "arw" | "cr2" | "dng" | "other";

export const RAW_FORMATS: readonly PhotoFormat[] = ["arw", "cr2", "dng"];

export const ACCEPTED_FILES =
  "image/jpeg,image/heic,image/heif,image/x-canon-cr2,image/x-adobe-dng,image/dng,.jpg,.jpeg,.heic,.heif,.arw,.cr2,.dng";

export function detectFormat(name: string, mime: string): PhotoFormat {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "image/jpeg" || ext === "jpg" || ext === "jpeg") return "jpeg";
  if (mime === "image/heic" || mime === "image/heif" || ext === "heic" || ext === "heif") return "heic";
  if (ext === "arw") return "arw";
  if (mime === "image/x-canon-cr2" || ext === "cr2") return "cr2";
  if (mime === "image/x-adobe-dng" || mime === "image/dng" || ext === "dng") return "dng";
  return "other";
}

export function isRaw(format: PhotoFormat): boolean {
  return RAW_FORMATS.includes(format);
}
