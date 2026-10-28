import type { CameraGuide } from "./types";

/*
 * Sony α7 II (ILCE-7M2) with factory button settings. Checked against Sony's Help Guide
 * (helpguide.sony.net/ilc/1450): in M the front dial sets aperture and the rear dial the shutter
 * ([Dial Setup] default), exposure compensation has its own dial, and Focus Mode / Focus Area are
 * in the Fn menu. C1 to C4 are user-assignable, so steps never use them.
 */
export const sonyA7ii: CameraGuide = {
  id: "sony-ilce-7m2",
  kind: "camera",
  source: "Sony α7 II Help Guide, factory button settings",
  modeNames: { program: "P", aperture: "A", shutter: "S", manual: "M" },
  limits: { isoMin: 100, isoMax: 6400, shutterMin: 1 / 8000, evMax: 3 },
  diagram: {
    body: "camera-back",
    controls: {
      frontDial: { label: "Front dial", shape: "dial", x: 262, y: 21, w: 34, h: 7 },
      modeDial: { label: "Mode dial", shape: "dial", x: 205, y: 31, w: 46, h: 12 },
      shutter: { label: "Shutter button", shape: "dial", x: 262, y: 32, w: 26, h: 9 },
      evDial: { label: "Exposure dial", shape: "dial", x: 296, y: 31, w: 22, h: 12 },
      rearDial: { label: "Rear dial", shape: "dial", x: 268, y: 54, w: 44, h: 9 },
      menu: { label: "MENU", shape: "button", x: 30, y: 56, r: 7 },
      fn: { label: "Fn", shape: "button", x: 232, y: 92, r: 8 },
      wheel: { label: "Control wheel", shape: "wheel", x: 268, y: 136, r: 30 },
      wheelRight: { label: "ISO", shape: "wheel-side", x: 268, y: 136, r: 30, side: "right" },
      wheelCenter: { label: "Center button", shape: "button", x: 268, y: 136, r: 10 },
    },
  },
  levers: {
    mode: [{ text: "Mode dial to {value}", control: "modeDial" }],
    iso: [
      { text: "Press ISO on the wheel", control: "wheelRight" },
      { text: "Turn the wheel to {value}", control: "wheel" },
      { text: "Press the center", control: "wheelCenter" },
    ],
    shutter: [{ text: "Turn the rear dial to {value}", control: "rearDial" }],
    aperture: [{ text: "Turn the front dial to {value}", control: "frontDial" }],
    ev: [{ text: "Exposure dial to {value}", control: "evDial" }],
    focusMode: [
      { text: "Press Fn", control: "fn" },
      { text: "Focus Mode: AF-S", control: "wheel" },
    ],
    focusArea: [{ text: "Focus Area: Flexible Spot", control: "wheel" }],
    halfPress: [{ text: "Half-press until the box goes green", control: "shutter" }],
  },
};
