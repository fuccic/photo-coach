import type { CameraGuide, PhoneGuide } from "./types";

// Fallbacks for models we have no guide for (PLAN.md 5.1): same advice, general wording, no diagram.
export const genericCamera: CameraGuide = {
  id: "generic-camera",
  kind: "camera",
  generic: true,
  source: "General steps. Your camera may name these differently.",
  modeNames: { program: "P", aperture: "A or Av", shutter: "S or Tv", manual: "M" },
  limits: { isoMin: 100, isoMax: 3200, shutterMin: 1 / 4000, evMax: 3 },
  levers: {
    mode: [{ text: "Mode dial to {value}" }],
    iso: [{ text: "Find ISO (a button or quick menu)" }, { text: "Set it to {value}" }],
    shutter: [{ text: "Turn the main dial to {value}" }],
    aperture: [{ text: "Turn the main dial to {value}" }],
    ev: [{ text: "Find the ± button or dial" }, { text: "Set it to {value}" }],
    focusMode: [{ text: "Focus mode: single (AF-S, One Shot)" }],
    focusArea: [{ text: "Focus area: one small point" }],
    halfPress: [{ text: "Half-press on the subject, wait for the beep" }],
  },
};

export const genericPhone: PhoneGuide = {
  id: "generic-phone",
  kind: "phone",
  generic: true,
  source: "General steps. Your phone may differ.",
  levers: {
    tapSubject: [{ text: "Tap the subject" }],
    brighten: [{ text: "Slide the brightness up" }],
    darken: [{ text: "Slide the brightness down" }],
    lock: [{ text: "Hold on the subject to lock it" }],
    nightMode: [{ text: "Turn on Night mode, then hold still" }],
    nightShorter: [{ text: "Use a shorter Night mode time" }],
    holdSteady: [{ text: "Two hands, elbows in" }, { text: "Press the shutter gently" }],
    mainLens: [{ text: "Switch to 1x" }],
    moreLight: [{ text: "Move closer to a light or window" }],
    stepBack: [{ text: "Too close? Step back a little" }],
  },
};
