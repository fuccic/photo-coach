import type { Device } from "../devices";
import { iphone18Pro } from "./apple-iphone-18-pro";
import { genericCamera, genericPhone } from "./generic";
import { sonyA7ii } from "./sony-ilce-7m2";
import type { Guide } from "./types";

export type * from "./types";

// One entry per supported model, keyed by Device.id (lib/devices.ts).
const GUIDES: Record<string, Guide> = {
  [sonyA7ii.id]: sonyA7ii,
  [iphone18Pro.id]: iphone18Pro,
};

/** The guide for a device, or general steps for its kind. Unknown devices are treated as cameras. */
export function guideFor(device: Device | null | undefined): Guide {
  return (device && GUIDES[device.id]) || (device?.kind === "phone" ? genericPhone : genericCamera);
}
