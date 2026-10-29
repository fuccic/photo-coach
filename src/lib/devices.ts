import { MODELS, type Model } from "./instructions";

export type DeviceKind = "camera" | "phone";

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  /** True when Photo Coach has instructions for this exact model. */
  supported: boolean;
};

type KnownDevice = Omit<Device, "supported"> & Pick<Model, "match" | "stabilized"> & { manual?: Model["guide"]["manual"] };

// One per model file in lib/instructions, so a supported device always has a guide.
export const KNOWN_DEVICES: KnownDevice[] = MODELS.map(({ name, match, stabilized, guide }) => ({
  id: guide.id,
  name,
  kind: guide.kind,
  match,
  stabilized,
  manual: guide.manual,
}));

/** True for supported cameras with in-body stabilisation. Looked up by id, so photos saved earlier get it too. */
export function isStabilized(device: Device | null | undefined): boolean {
  return !!device && KNOWN_DEVICES.some((d) => d.id === device.id && d.stabilized);
}

const PHONE_MAKES = ["APPLE", "GOOGLE", "SAMSUNG", "ONEPLUS", "XIAOMI", "HUAWEI", "MOTOROLA"];

/** Turns raw EXIF Make/Model into a device. Returns null when both are missing. */
export function identifyDevice(make?: string, model?: string): Device | null {
  const mk = (make ?? "").trim();
  const md = (model ?? "").trim();
  if (!mk && !md) return null;

  const known = KNOWN_DEVICES.find((d) => d.match(mk.toUpperCase(), md.toUpperCase()));
  if (known) {
    return { id: known.id, name: known.name, kind: known.kind, supported: true };
  }

  const kind: DeviceKind = PHONE_MAKES.some((p) => mk.toUpperCase().startsWith(p)) ? "phone" : "camera";
  // Many cameras repeat the brand in Model ("Canon EOS R50"), so avoid "Canon Canon EOS R50" or "NIKON CORPORATION NIKON Z 50".
  const brand = mk.split(/\s+/)[0] ?? "";
  // Apple's Model is already a full name ("iPhone 16 Pro").
  const modelIsName = mk.toUpperCase() === "APPLE" || (brand && md.toLowerCase().startsWith(brand.toLowerCase()));
  const name = md && modelIsName ? md : [titleCase(mk), md].filter(Boolean).join(" ");
  return { id: slug(`${mk} ${md}`), name, kind, supported: false };
}

function titleCase(s: string): string {
  return s.length > 0 && s === s.toUpperCase() ? s[0] + s.slice(1).toLowerCase() : s;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
