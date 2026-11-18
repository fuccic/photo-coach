import type { FaceDetector } from "@mediapipe/tasks-vision";

/**
 * Finds faces with Google's MediaPipe face finder, which runs in the browser on the phone or
 * computer itself: photos never leave the device. The finder (a 1 MB model plus a 14 MB engine,
 * served from /mediapipe, see scripts/copy-mediapipe.mjs) loads the first time it is needed and the
 * browser keeps it after that.
 */

/** Where the engine and model are served from. */
export const MEDIAPIPE_BASE = "/mediapipe";
/** Faces the finder is less sure of than this are left out. */
const MIN_SCORE = 0.6;

let detector: Promise<FaceDetector | null> | undefined;

function load(): Promise<FaceDetector | null> {
  detector ??= (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(MEDIAPIPE_BASE);
      return await FaceDetector.createFromOptions(files, {
        // The full-range model also finds faces a few metres away, not just selfies.
        baseOptions: { modelAssetPath: `${MEDIAPIPE_BASE}/blaze_face_full_range.tflite`, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: MIN_SCORE,
      });
    } catch (e) {
      console.warn("Face finder unavailable:", e);
      // Offline on first use, or a browser without WebAssembly: the other checks still run.
      return null;
    }
  })();
  return detector;
}

export type FoundFace = { x: number; y: number; w: number; h: number; score: number };

/** Faces in the canvas, in its pixels. Empty when there are none or the finder couldn't load. */
export async function detectFaces(canvas: HTMLCanvasElement): Promise<FoundFace[]> {
  const d = await load();
  if (!d) return [];
  try {
    return d.detect(canvas).detections.flatMap((f) =>
      f.boundingBox
        ? [{ x: f.boundingBox.originX, y: f.boundingBox.originY, w: f.boundingBox.width, h: f.boundingBox.height, score: f.categories[0]?.score ?? 0 }]
        : [],
    );
  } catch {
    return [];
  }
}
