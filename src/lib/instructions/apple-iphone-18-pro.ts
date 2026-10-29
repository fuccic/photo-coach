import type { Model } from "./types";

/*
 * iPhone 18 Pro, stock Camera app. The app has no ISO or shutter control, so every fix works
 * through gestures. The iPhone 18 Pro is newer than our references: these gestures are the ones
 * the Camera app has had for years (tap to focus, sun slider, AE/AF Lock, Night mode, volume
 * button shutter) and are marked `assumed` until checked on the phone (PLAN.md 3.2).
 */
export const iphone18Pro: Model = {
  name: "iPhone 18 Pro",
  match: (make, model) => make.startsWith("APPLE") && model === "IPHONE 18 PRO",
  guide: {
    id: "apple-iphone-18-pro",
    kind: "phone",
    source: "iPhone Camera app, no extra apps needed.",
    manual: { url: "https://support.apple.com/guide/iphone/welcome/ios", title: "iPhone User Guide" },
    assumedNote: "From older iPhones, not yet checked on the iPhone 18 Pro.",
    diagram: {
      body: "phone",
      controls: {
        volume: { label: "Volume button", shape: "area", x: 108, y: 62, w: 4, h: 30 },
        night: { label: "Night mode", shape: "button", x: 130, y: 24, r: 8 },
        subject: { label: "Subject", shape: "area", x: 154, y: 94, w: 44, h: 40 },
        sun: { label: "Sun", shape: "slider", x: 186, y: 94, w: 4, h: 48 },
        zoom: { label: "1x", shape: "button", x: 160, y: 150, r: 9 },
        shutter: { label: "Shutter", shape: "button", x: 160, y: 177, r: 12 },
      },
    },
    levers: {
      tapSubject: [{ text: "Tap the subject", control: "subject", assumed: true }],
      brighten: [{ text: "Drag the sun up", control: "sun", assumed: true }],
      darken: [{ text: "Drag the sun down", control: "sun", assumed: true }],
      lock: [{ text: "Hold until AE/AF Lock shows", control: "subject", assumed: true }],
      nightMode: [{ text: "Tap the moon, then hold still", control: "night", assumed: true }],
      nightShorter: [{ text: "Tap the moon, pick a shorter time", control: "night", assumed: true }],
      holdSteady: [{ text: "Two hands, elbows in" }, { text: "Shoot with a volume button", control: "volume", assumed: true }],
      mainLens: [{ text: "Tap 1x", control: "zoom", assumed: true }],
      moreLight: [{ text: "Move closer to a light or window" }],
      stepBack: [{ text: "Too close? Step back a little" }],
    },
  },
};
