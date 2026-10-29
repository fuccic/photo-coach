import type { ManualLink, Model } from "./types";

/*
 * Canon EOS Digital Rebel XT (EOS 350D, Kiss Digital N), 2005. Checked against Canon's EOS 350D
 * instruction manual: ISO is the ▲ cross key and AF mode the ▶ cross key (p. 13, 18), each
 * opening a menu where ▲ ▼ pick and SET confirms (p. 55, 70); exposure compensation is the Av±
 * button held while turning the main dial, ±2 in third stops, in P, Tv and Av (p. 89); in M the
 * main dial sets the shutter and Av± plus the main dial the aperture (p. 86). In P, Tv, Av and M
 * the camera doesn't beep on focus, so the steps use the viewfinder's focus light (p. 71). No
 * in-body stabilisation and no live view. The PDF's page numbers match the printed ones.
 */
const MANUAL = "https://gdlp01.c-wss.com/gds/8/0900000278/01/EOSDRXT350DIM-EN.pdf";
const page = (n: number): ManualLink => ({ url: `${MANUAL}#page=${n}`, label: `p. ${n}` });

export const canonRebelXt: Model = {
  name: "Canon Rebel XT",
  match: (make, model) =>
    make.startsWith("CANON") && ["CANON EOS DIGITAL REBEL XT", "CANON EOS 350D DIGITAL", "CANON EOS 350D", "CANON EOS KISS DIGITAL N"].includes(model),
  guide: {
    id: "canon-eos-350d",
    kind: "camera",
    source: "Canon EOS 350D / Rebel XT instruction manual",
    manual: { url: MANUAL, title: "Canon EOS 350D / Rebel XT instruction manual" },
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
      mode: [{ text: "Mode dial to {value}", control: "modeDial", manual: page(16) }],
      iso: [
        { text: "Press ISO (▲) on the cross keys", control: "crossUp", manual: page(55) },
        { text: "Press ▲ or ▼ to {value}", control: "cross" },
        { text: "Press SET", control: "set" },
      ],
      shutter: [{ text: "Turn the main dial to {value}", control: "mainDial", manual: page(82) }],
      // The main dial sets the aperture in Av, but the shutter in M, where Av± switches it over.
      aperture: [
        { text: "Turn the main dial to {value}", control: "mainDial", modes: ["aperture"], manual: page(84) },
        { text: "Hold Av±, turn the main dial to {value}", control: "avButton", modes: ["manual"], manual: page(86) },
      ],
      ev: [{ text: "Hold Av±, turn the main dial to {value}", control: "avButton", manual: page(89) }],
      focusMode: [
        { text: "Lens switch to AF", manual: page(70) },
        { text: "Press AF (▶) on the cross keys", control: "crossRight" },
        { text: "Pick ONE SHOT with ▲ ▼, press SET", control: "set" },
      ],
      focusArea: [
        { text: "Press the AF point button", control: "afPoint", manual: page(73) },
        { text: "Press SET until only the center lights", control: "set" },
      ],
      halfPress: [{ text: "Half-press until the focus light shows", control: "shutter", manual: page(71) }],
    },
  },
};
