import exifr from "exifr";
import { identifyDevice, type Device } from "./devices";
import { findHeifExif } from "./heifExif";

export type ShootingMode = "manual" | "program" | "aperture" | "shutter" | "other";

export type PhotoMeta = {
  make?: string;
  model?: string;
  device: Device | null;
  lens?: string;
  /** Seconds, e.g. 0.0333 for 1/30s. */
  exposureTime?: number;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  focalLength35?: number;
  exposureComp?: number;
  mode?: ShootingMode;
  flashFired?: boolean;
  takenAt?: Date;
  width?: number;
  height?: number;
  /** True when shutter, aperture and ISO were all found. */
  hasSettings: boolean;
};

type RawExif = Partial<{
  Make: string;
  Model: string;
  LensModel: string;
  ExposureTime: number;
  FNumber: number;
  ISO: number | number[];
  FocalLength: number;
  FocalLengthIn35mmFormat: number;
  ExposureCompensation: number;
  ExposureProgram: number;
  Flash: number;
  DateTimeOriginal: Date;
  ExifImageWidth: number;
  ExifImageHeight: number;
  ImageWidth: number;
  ImageHeight: number;
}>;

// EXIF ExposureProgram values (EXIF 2.32, tag 0x8822).
const MODES: Record<number, ShootingMode> = { 1: "manual", 2: "program", 3: "aperture", 4: "shutter" };

const PARSE_OPTIONS = {
  tiff: true,
  exif: true,
  ifd1: false,
  // Location is never read: photos stay private and GPS is not needed for advice.
  gps: false,
  interop: false,
  makerNote: false,
  xmp: false,
  icc: false,
  iptc: false,
  translateValues: false,
  reviveValues: true,
  mergeOutput: true,
};

export async function readPhotoMeta(input: Blob | ArrayBuffer | Uint8Array): Promise<PhotoMeta> {
  const bytes = await toBytes(input);
  let raw = await tryParse(bytes);
  if (!raw?.Make && !raw?.ExposureTime) {
    const heifTiff = findHeifExif(bytes);
    if (heifTiff) raw = await tryParse(heifTiff);
  }
  return toPhotoMeta(raw ?? {});
}

async function tryParse(bytes: Uint8Array): Promise<RawExif | undefined> {
  try {
    return (await exifr.parse(bytes, PARSE_OPTIONS)) as RawExif | undefined;
  } catch {
    // Unsupported or corrupt file: treat as "no metadata" rather than failing the upload.
    return undefined;
  }
}

async function toBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

export function toPhotoMeta(raw: RawExif): PhotoMeta {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  const exposureTime = num(raw.ExposureTime);
  const fNumber = num(raw.FNumber);
  const iso = num(Array.isArray(raw.ISO) ? raw.ISO[0] : raw.ISO);
  const flash = num(raw.Flash);
  const program = num(raw.ExposureProgram);

  return {
    make: str(raw.Make),
    model: str(raw.Model),
    device: identifyDevice(str(raw.Make), str(raw.Model)),
    lens: str(raw.LensModel),
    exposureTime,
    fNumber,
    iso,
    focalLength: num(raw.FocalLength),
    focalLength35: num(raw.FocalLengthIn35mmFormat),
    exposureComp: num(raw.ExposureCompensation),
    mode: program === undefined ? undefined : (MODES[program] ?? (program === 0 ? undefined : "other")),
    flashFired: flash === undefined ? undefined : (flash & 1) === 1,
    takenAt: raw.DateTimeOriginal instanceof Date && !Number.isNaN(raw.DateTimeOriginal.getTime()) ? raw.DateTimeOriginal : undefined,
    width: num(raw.ExifImageWidth) ?? num(raw.ImageWidth),
    height: num(raw.ExifImageHeight) ?? num(raw.ImageHeight),
    hasSettings: exposureTime !== undefined && fNumber !== undefined && iso !== undefined,
  };
}
