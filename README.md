# Photo Coach

A photo app for beginners: add a photo and Photo Coach reads the camera settings it was taken with, then (soon) tells you what to change and which buttons to press on your camera. See [PLAN.md](PLAN.md).

## What works today

- Add photos (JPEG, iPhone HEIC, Sony ARW). Everything stays in your browser: nothing is uploaded, and GPS is never read.
- Reads the camera, lens, shutter speed, aperture, ISO, focal length, mode, exposure compensation and flash from the photo's EXIF.
- Recognises the first two supported devices: Sony α7 II (ILCE-7M2) and iPhone 18 Pro.
- Screens: Home, Upload, Photo review and Library, in the "Golden hour" palette from the approved mocks.

Photos are kept only until the tab is closed (no accounts or storage yet).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (EXIF reading, device detection, formatting)
npm run lint && npm run typecheck && npm run build
```

Test photos in `test/fixtures/` are small synthetic files with hand-written EXIF, not real camera output.

## Layout

- `src/lib/exif.ts`: reads EXIF with [exifr](https://github.com/MikeKovarik/exifr) into a `PhotoMeta`.
- `src/lib/heifExif.ts`: fallback EXIF locator for HEIC files exifr can't read (files written by libheif-based tools).
- `src/lib/rawPreview.ts`: pulls the embedded JPEG preview out of Sony ARW files.
- `src/lib/devices.ts`: maps EXIF Make/Model to supported devices.
- `src/lib/preview.ts`: makes a viewable preview (HEIC is converted in the browser, except on Safari which shows it natively).
- `src/app/`: the screens.
