import type { Model } from "./types";

/*
 * Canon EOS Digital Rebel XT (EOS 350D, Kiss Digital N), 2005. Checked against the Canon EOS 350D
 * instruction manual: ISO and AF mode are on the cross keys, picked with ◀ ▶ and confirmed with
 * SET (p. 55, 70); exposure compensation is the Av± button held while turning the main dial, ±2
 * in third stops, in P, Tv and Av (p. 89); in M the main dial sets the shutter and Av± plus the
 * main dial the aperture (p. 86). No in-body stabilisation and no live view. Which cross key is
 * which, and the focus beep, are marked `assumed` until checked on the camera.
 */
export const canonRebelXt: Model = {
  name: "Canon Rebel XT",
  match: (make, model) =>
    make.startsWith("CANON") && ["CANON EOS DIGITAL REBEL XT", "CANON EOS 350D DIGITAL", "CANON EOS 350D", "CANON EOS KISS DIGITAL N"].includes(model),
  guide: {
    id: "canon-eos-350d",
    kind: "camera",
    source: "Canon EOS 350D / Rebel XT instruction manual",
    assumedNote: "Not yet checked on a real Rebel XT.",
    modeNames: { program: "P", aperture: "Av", shutter: "Tv", manual: "M" },
    // ISO 1600 is the top of the range on this sensor.
    limits: { isoMin: 100, isoMax: 1600, shutterMin: 1 / 4000, evMax: 2 },
    diagram: {
      body: "camera-back",
      controls: {
        modeDial: { label: "Mode dial", shape: "dial", x: 205, y: 31, w: 46, h: 12 },
        mainDial: { label: "Main dial", shape: "dial", x: 254, y: 32, w: 30, h: 8 },
        shutter: { label: "Shutter button", shape: "dial", x: 288, y: 30, w: 26, h: 9 },
        menu: { label: "MENU", shape: "button", x: 30, y: 56, r: 7 },
        afPoint: { label: "AF point button", shape: "button", x: 292, y: 60, r: 7 },
        avButton: { label: "Av± button", shape: "button", x: 232, y: 72, r: 8 },
        cross: { label: "Cross keys", shape: "wheel", x: 262, y: 136, r: 30 },
        crossUp: { label: "ISO", shape: "wheel-side", x: 262, y: 136, r: 30, side: "top" },
        crossRight: { label: "AF", shape: "wheel-side", x: 262, y: 136, r: 30, side: "right" },
        set: { label: "SET", shape: "button", x: 262, y: 136, r: 10 },
      },
    },
    levers: {
      mode: [{ text: "Mode dial to {value}", control: "modeDial" }],
      iso: [
        { text: "Press ISO on the cross keys", control: "crossUp", assumed: true },
        { text: "Press ◀ or ▶ to {value}", control: "cross" },
        { text: "Press SET", control: "set" },
      ],
      shutter: [{ text: "Turn the main dial to {value}", control: "mainDial" }],
      // The main dial sets the aperture in Av, but the shutter in M, where Av± switches it over.
      aperture: [
        { text: "Turn the main dial to {value}", control: "mainDial", modes: ["aperture"] },
        { text: "Hold Av±, turn the main dial to {value}", control: "avButton", modes: ["manual"] },
      ],
      ev: [{ text: "Hold Av±, turn the main dial to {value}", control: "avButton" }],
      focusMode: [
        { text: "Lens switch to AF" },
        { text: "Press AF on the cross keys", control: "crossRight", assumed: true },
        { text: "Pick ONE SHOT, press SET", control: "set" },
      ],
      focusArea: [
        { text: "Press the AF point button", control: "afPoint" },
        { text: "Press SET until only the center lights", control: "set" },
      ],
      halfPress: [{ text: "Half-press until it beeps", control: "shutter", assumed: true }],
    },
  },
};
