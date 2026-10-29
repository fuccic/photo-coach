import type { ManualLink, Model } from "./types";

/*
 * Sony α7 II (ILCE-7M2) with factory button settings. Checked against Sony's Help Guide
 * (helpguide.sony.net/ilc/1450): in M the front dial sets aperture and the rear dial the shutter
 * ([Dial Setup] default), in S either dial sets the shutter, ISO is on the right of the control
 * wheel (DISP top, drive mode left), exposure compensation has its own dial, and Focus Mode /
 * Focus Area are in the Fn menu. C1 to C4 are user-assignable, so steps never use them.
 */
const HELP_GUIDE = "https://helpguide.sony.net/ilc/1450/v1/en";
const topic = (id: string, label: string): ManualLink => ({ url: `${HELP_GUIDE}/contents/${id}.html`, label });

export const sonyA7ii: Model = {
  name: "Sony α7 II",
  match: (make, model) => make.startsWith("SONY") && model === "ILCE-7M2",
  stabilized: true,
  guide: {
    id: "sony-ilce-7m2",
    kind: "camera",
    source: "Sony α7 II Help Guide, factory button settings",
    manual: { url: `${HELP_GUIDE}/index.html`, title: "Sony α7 II Help Guide" },
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
      mode: [{ text: "Mode dial to {value}", control: "modeDial", manual: topic("TP0000301839", "Mode dial") }],
      iso: [
        { text: "Press ISO on the wheel", control: "wheelRight", manual: topic("TP0000386492", "ISO") },
        { text: "Turn the wheel to {value}", control: "wheel" },
        { text: "Press the center", control: "wheelCenter" },
      ],
      shutter: [{ text: "Turn the rear dial to {value}", control: "rearDial", manual: topic("TP0000226526", "Shutter Priority") }],
      aperture: [{ text: "Turn the front dial to {value}", control: "frontDial", manual: topic("TP0000301843", "Aperture Priority") }],
      ev: [{ text: "Exposure dial to {value}", control: "evDial", manual: topic("TP0000226569", "Exposure dial") }],
      focusMode: [
        { text: "Press Fn", control: "fn", manual: topic("TP0000386486", "Focus Mode") },
        { text: "Focus Mode: AF-S", control: "wheel" },
      ],
      focusArea: [{ text: "Focus Area: Flexible Spot", control: "wheel", manual: topic("TP0000390692", "Focus Area") }],
      halfPress: [{ text: "Half-press until the box goes green", control: "shutter", manual: topic("TP0000314378", "Shooting") }],
    },
  },
};
