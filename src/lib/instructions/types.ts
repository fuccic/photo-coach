import type { ShootingMode } from "../exif";

/*
 * How-to data for one device. A fix (see lib/fixes) asks for device-neutral "levers", like
 * "set ISO to 800" or "tap the subject"; each guide says how to pull them on its device.
 * Cameras and phones have different levers, because the iPhone's Camera app has no ISO or
 * shutter control (PLAN.md 3.2).
 *
 * To add a model: copy the closest model file, change its match rule, controls, steps and limits,
 * and add it to MODELS in ./index.ts. TypeScript checks that every lever has steps.
 */

/** Things you can set directly on a camera. */
export type CameraLever = "mode" | "iso" | "shutter" | "aperture" | "ev" | "focusMode" | "focusArea" | "halfPress";

/** Things you can do in a phone's own camera app. */
export type PhoneLever =
  | "tapSubject"
  | "brighten"
  | "darken"
  | "lock"
  | "nightMode"
  | "nightShorter"
  | "holdSteady"
  | "mainLens"
  | "moreLight"
  | "stepBack";

export type Step = {
  /** One short line. `{value}` is replaced with the lever's value, formatted for this device. */
  text: string;
  /** The control to highlight on the diagram, a key of the guide's `diagram.controls`. */
  control?: string;
  /** Not yet checked on this model. The guide's `assumedNote` says where it came from. */
  assumed?: true;
  /** Only in these modes, for controls that change job with the mode (Canon's main dial). */
  modes?: ShootingMode[];
  /** The page of the maker's manual that covers this step, linked next to it. */
  manual?: ManualLink;
};

/** A page of the maker's own manual. */
export type ManualLink = {
  url: string;
  /** What the link says: the Help Guide topic ("ISO") or the page ("p. 55"). */
  label: string;
};

export type Control = {
  /** Short name shown next to the highlight, as printed on the device where it has a label. */
  label: string;
  shape: "button" | "dial" | "wheel" | "wheel-side" | "area" | "slider";
  /** Centre, in the diagram's 320 × 200 box. */
  x: number;
  y: number;
  /** Width and height for dials, areas and sliders; radius for buttons and wheels. */
  w?: number;
  h?: number;
  r?: number;
  /** For "wheel-side": which side of the wheel. */
  side?: "top" | "right" | "bottom" | "left";
};

export type Diagram = {
  /** Which outline to draw the controls on. */
  body: "camera-back" | "phone";
  controls: Record<string, Control>;
};

type GuideBase = {
  /** Matches Device.id, or "generic-camera" / "generic-phone". */
  id: string;
  /** Where the steps come from, shown in small print. */
  source: string;
  /** The maker's manual for the whole device, linked from My cameras and the source line. */
  manual?: { url: string; title: string };
  /** True for the fallback guides used when we don't know the model. */
  generic?: true;
  diagram?: Diagram;
  /** Footnote for `assumed` steps, such as "From older iPhones, not yet checked on the iPhone 18 Pro." */
  assumedNote?: string;
};

export type CameraGuide = GuideBase & {
  kind: "camera";
  /** What the mode dial calls each mode ("A" on Sony, "Av" on Canon). */
  modeNames: Record<Exclude<ShootingMode, "other">, string>;
  limits: {
    isoMin: number;
    /** The highest ISO we suggest: higher works but looks grainy on this sensor. */
    isoMax: number;
    /** Fastest shutter, in seconds. */
    shutterMin: number;
    /** Exposure compensation reach (± EV) of the control the steps use. */
    evMax: number;
  };
  levers: Record<CameraLever, Step[]>;
};

export type PhoneGuide = GuideBase & {
  kind: "phone";
  levers: Record<PhoneLever, Step[]>;
};

export type Guide = CameraGuide | PhoneGuide;

/** One supported model: how to recognise its photos, and its guide. */
export type Model = {
  name: string;
  /** Gets EXIF Make and Model upper-cased and trimmed. */
  match: (make: string, model: string) => boolean;
  /** In-body stabilisation, which lets a camera be hand-held at slower shutter speeds. */
  stabilized?: true;
  guide: Guide;
};

