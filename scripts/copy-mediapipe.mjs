// Copies MediaPipe's face-finder engine (WebAssembly) from node_modules into public/, so the app
// serves it itself and works without reaching Google's servers. Runs before `dev` and `build`.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm/";
const to = "public/mediapipe/";
mkdirSync(to, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) copyFileSync(from + f, to + f);
