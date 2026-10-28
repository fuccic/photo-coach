export type PhotoFormat = "jpeg" | "heic" | "arw" | "other";

export const ACCEPTED_FILES = "image/jpeg,image/heic,image/heif,.jpg,.jpeg,.heic,.heif,.arw";

export function detectFormat(name: string, mime: string): PhotoFormat {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "image/jpeg" || ext === "jpg" || ext === "jpeg") return "jpeg";
  if (mime === "image/heic" || mime === "image/heif" || ext === "heic" || ext === "heif") return "heic";
  if (ext === "arw") return "arw";
  return "other";
}
