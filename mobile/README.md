# Photo Coach for iPhone and Android

The phone version of Photo Coach. It's one app for both iPhone and Android, built with
[Expo](https://expo.dev) (React Native). It checks photos with the same code as the website, so
both give the same verdict and the same fix-it steps for the same photo.

## Try it on your phone (free, no Mac)

You need the website's setup (Node.js and this repository) on your computer, and the free
**Expo Go** app on your phone (App Store or Play Store). Your phone and computer must be on the
same Wi-Fi.

```
cd mobile
npm install
npx expo start
```

A QR code appears in the terminal.

- **iPhone:** open the Camera app and point it at the QR code, then tap the banner.
- **Android:** open Expo Go and tap "Scan QR code".

Photo Coach then opens inside Expo Go. Tap **Pick photos** and choose some photos.

## What's in it

| Screen | What it does |
| --- | --- |
| Home | Pick up to 20 photos. Each one gets badges for its problems, or a green tick. |
| Photo | The photo, its settings, each problem with "Why?" and "Fix it", and the problem area highlighted on the photo. |
| Fix it | The setting change (such as "ISO 400 → 1600"), the camera diagram with the control lit up, and steps you tick off. |

Photos stay on the phone. For now they're kept only until the app closes. Saving them comes next.

## How it shares code with the website

The app imports the website's `src/lib` folder directly, using the `@core/...` path:

- `analysis/measure.ts` and `analysis/checks.ts`: the photo checks
- `fixes/`: turning a problem into setting changes and steps
- `instructions/`: one guide per camera model
- `exif.ts`: reading the camera and settings from the photo

The website draws the photo on a canvas to read its pixels. The phone has no canvas, so the
app does this instead:

1. The phone shrinks the photo to 1600px, the size the website checks at. The phone opens HEIC
   itself, so iPhone photos need no converter.
2. The phone saves the shrunk photo as a full-quality JPEG.
3. `jpeg-js` reads the pixels in JavaScript.
4. The shared `measure()` and `findIssues()` run on those pixels.

These are in `src/lib/analyze.ts` and `src/lib/decode.ts`.

**Checked on the 50 labelled test photos (Nov 2026):** every photo got the same verdict as on the
website. That held after the full-quality JPEG round trip, and with a different resizer from the
browser's. Every photo also read the same camera settings. Reading and measuring took about 0.2 s
per photo on a laptop, and will be slower on a phone.

`metro.config.js` lets the app see `../src/lib`. It also swaps in a copy of `exifr` with one line
patched (`scripts/exifr-hermes.js`), because the stock file has a dynamic `import()` that the
phone's JavaScript engine (Hermes) can't compile.

## Checks

```
npm test            # decode and EXIF tests (vitest)
npx tsc --noEmit    # types, including the shared website code
```

## Next steps

### 1. Install it like a real app

Expo can build the real app on its own servers, so no Mac is needed (`npx eas-cli build`).

- **Android:** free. You get a file to install directly.
- **iPhone:** needs the Apple Developer Program ($99/year) to install on a phone without a Mac.
  The same membership covers TestFlight and the App Store.

### 2. On-device AI second opinion

Both platforms now let an app show a photo to the phone's built-in AI, without sending it
anywhere:

- **iPhone:** Apple's Foundation Models framework accepts images from iOS 27 on Apple
  Intelligence phones, which includes the iPhone 18 Pro.
  ([WWDC26](https://developer.apple.com/videos/play/wwdc2026/241/))
- **Android:** Gemini Nano through ML Kit's Prompt API (beta) accepts images, on newer phones
  such as the Pixel 9 and later and the Galaxy S25 and later.
  ([ML Kit GenAI](https://developers.google.com/ml-kit/genai))
- [`expo-ai`](https://docs.expo.dev/versions/unversioned/sdk/ai) (alpha) covers both from
  TypeScript. It needs a development build, not Expo Go. On Android it doesn't yet promise
  image support.

Nobody has published how well these small models spot soft focus, grain or overexposure. The plan:

1. Ask the model for the same labels the Claude vision trial uses: dark, bright, shake, focus or
   grain, each none, small or big.
2. Score it against the 50 photos Conor labelled.
3. Show its answer only for problem types where it beats the pixel checks.

Those are focus (0 of 6 caught today), grain (0 of 3) and bright (4 of 7). Phones without
on-device AI keep the pixel checks, which already work everywhere.

### 3. Manual pages

Photo Coach only knows 5 problems, and each fix uses a short list of controls (ISO, shutter,
aperture and so on), so a full search engine isn't needed. Instead:

1. Add each control's page in the camera's own manual to each camera's guide file, such as the
   Sony Help Guide's ISO page.
2. The Fix it screen links straight to that page.

A search over whole manuals would only pay off once there are many more cameras.

### 4. Other next steps

- Save photos between launches.
- Bring the website's "Unknown camera" and "no settings" messages to the phone.
