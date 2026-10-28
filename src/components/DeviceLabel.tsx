import type { Device } from "@/lib/devices";
import { CameraIcon, PhoneIcon } from "./icons";

export function DeviceIcon({ device, size }: { device: Device | null | undefined; size?: number }) {
  return device?.kind === "phone" ? <PhoneIcon size={size} /> : <CameraIcon size={size} />;
}

export function DeviceLabel({ device, className = "" }: { device: Device | null | undefined; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <DeviceIcon device={device} size={15} />
      {device?.name ?? "Unknown camera"}
    </span>
  );
}
