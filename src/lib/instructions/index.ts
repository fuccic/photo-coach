import type { Device } from "../devices";
import { iphone18Pro } from "./apple-iphone-18-pro";
import { canonRebelXt } from "./canon-eos-350d";
import { genericCamera, genericPhone } from "./generic";
import { sonyA7ii } from "./sony-ilce-7m2";
import type { Guide, Model } from "./types";

export type * from "./types";

/** Every supported model, one file each. lib/devices.ts matches photos against these. */
export const MODELS: Model[] = [sonyA7ii, iphone18Pro, canonRebelXt];

/** The guide for a device, or general steps for its kind. Unknown devices are treated as cameras. */
export function guideFor(device: Device | null | undefined): Guide {
  return (device && MODELS.find((m) => m.guide.id === device.id)?.guide) || (device?.kind === "phone" ? genericPhone : genericCamera);
}
