# Photo Coach: Project Plan

> A photo app for beginners. Upload a photo, and Photo Coach tells you what went wrong (too dark, blurry, noisy, tilted), which camera setting to change, and **exactly which buttons to press on your camera** to change it.

Status: draft for discussion · Last updated 2026-10-28

---

## 1. Vision

Most beginners own a capable camera but shoot in Auto because the manual settings feel like a cockpit. Generic "photography tips" don't help much because they never say *how* to do it on *your* camera. Photo Coach closes that gap:

1. **Diagnose:** look at the actual pixels plus the EXIF metadata (shutter speed, aperture, ISO, focal length, focus mode, flash, camera model).
2. **Explain:** say what's wrong in plain language and why it happened ("Your shutter speed was 1/15s at 85mm, so your hand movement blurred the shot").
3. **Prescribe:** recommend a concrete setting change ("Use 1/125s or faster. Raise ISO to 1600 to keep the brightness").
4. **Guide:** tell them how to do it on their exact model ("On a Canon EOS R50: turn the mode dial to Tv, then turn the main dial right until the screen shows 125").

### Who it's for
- New owners of an interchangeable-lens or advanced compact camera.
- iPhone photographers who want better shots without leaving the Camera app (in the MVP, starting with the iPhone 18 Pro).

### What it is not (for now)
- Not a photo editor. We won't fix the photo, we teach how to take a better one next time.
- Not a social network or portfolio.

---

## 2. Core user flow

1. **Upload** one or more photos (JPEG and HEIC from day one, since iPhones save HEIC by default; RAW and ProRAW later).
2. App reads EXIF and detects the camera body and lens (or, for a phone, which of its lenses was used).
3. **Analysis results** screen: a short score card (Exposure, Focus/Sharpness, Motion blur, Noise, White balance, Composition), each with a traffic-light status.
4. Tap an issue to see the **"What happened / What to change / How to do it on your camera"** card.
5. Optional: **Before you shoot** cheat sheet for the camera ("Shooting kids indoors on your Sony a6400").
6. History: past uploads and the recurring mistakes you're making, so progress is visible.

(Frontend mocks are being produced in a separate thread.)

---

## 3. Phased roadmap

### Phase 0: Foundations (1 week)
- Repo, CI, linting, deploy pipeline.
- Pick the stack (see section 4), set up a skeleton web app.
- Collect a **test photo set**: 100 to 200 real photos with known problems, covering 5 or more camera brands. This is the most important early asset because every later phase is tested against it.

### Phase 1: MVP, "What's wrong and what setting to change" (3 to 4 weeks)
- Upload JPEG, parse EXIF in the browser.
- Rule-based analysis using EXIF + simple image stats:
  - **Exposure:** histogram (clipped highlights/shadows, mean luminance) and exposure compensation.
  - **Sharpness / blur:** Laplacian variance overall and in the focus area; motion blur heuristic using the reciprocal rule (shutter vs. focal length × crop factor).
  - **Noise:** ISO vs. sensor size, plus a noise estimate in flat regions.
  - **Tilt:** horizon line detection.
- Recommendations as generic settings ("raise shutter speed to 1/250s").
- Instructions for **two devices** to prove the format works for both a dedicated camera and a phone: the **Sony α7 II (ILCE-7M2)** and the **iPhone 18 Pro**. See sections 3.1 and 3.2.
- No accounts; everything stays in the browser.

**Exit criteria:** on the test set, at least 80% of the main issues are correctly flagged and a beginner can follow the instruction card without help.

### 3.1 First camera: Sony α7 II

The MVP targets the Sony α7 II, so the instruction format, the settings solver, and the test photo set all start there. Why it's a good first pick:

- **Physical controls map cleanly to advice:** mode dial (P / A / S / M), front and rear dials, a dedicated exposure compensation dial, a control wheel, the Fn menu, and C1 to C4 custom buttons.
- **Rich, well-decoded metadata:** ExifTool reads Sony MakerNotes in depth (focus mode, AF area, SteadyShot state, lens model), which helps tell missed focus from camera shake.
- **In-body stabilization (5-axis SteadyShot)** changes the safe-shutter-speed rule, a good early test of the settings solver.
- **Things to watch:** it uses Sony's older tab-based menu (pre-2020), so menu paths won't carry over to newer Sony bodies like the α7 IV; and C1 to C4 are user-assignable, so instructions should prefer the dials and Fn menu. The α7R II and α7S II share most controls, so they're cheap follow-ups.

Once the α7 II works end to end, the next models are other Sony bodies (α7 III, α6000 series), then other brands.

### 3.2 First phone: iPhone 18 Pro

The second MVP device is the iPhone 18 Pro, which forces the instruction model to handle a phone as well as a camera. The two need different kinds of advice:

| | Sony α7 II | iPhone 18 Pro (stock Camera app) |
|---|---|---|
| Shutter / ISO | Set directly with the mode dial and front/rear dials | **Not directly settable.** The phone picks them; we influence them indirectly |
| What we can tell users to change | Shutter, aperture, ISO, focus mode, AF area, stabilization | Exposure slider, tap to focus, focus/exposure lock (long-press), lens choice (0.5x / 1x / 2x / tele), Night mode and its timer, flash, Portrait mode, Photographic Styles, ProRAW on/off, the Camera Control button |
| Typical fix for blur | "Use 1/250s" | "Hold steady or brace your arms, switch to 1x for more light, keep Night mode's timer short, or use a tripod" |
| Metadata | Rich Sony MakerNotes | Standard EXIF (shutter, ISO, focal length, lens) plus limited Apple MakerNotes; much is computed by Apple's processing and not recorded |

What this means for the build:
- **The instruction schema needs "levers", not just settings.** A recommendation like "faster shutter speed" must turn into dial steps on the Sony and into indirect actions on the iPhone (better light, steadier grip, a different lens, a shorter Night mode).
- **Optional "manual mode" track.** Third-party apps (for example Halide or Lightroom's camera) expose real shutter and ISO control. We can suggest one for users who want it, but default advice stays in the stock Camera app.
- **Computational photography muddies the analysis.** Smart HDR, Deep Fusion and Night mode merge several frames, so the EXIF shutter speed isn't the whole story and noise or sharpness look different from a single exposure. Thresholds need separate calibration for iPhone photos.
- **Exact controls need checking on a real device.** This plan was written without first-hand iPhone 18 Pro specs. Lens lineup, Camera Control behaviour, and menu paths should be verified before writing its instruction entries.

### Phase 2: AI-assisted analysis and explanations (3 to 4 weeks)
- Add a vision-language model (Claude) to look at the photo plus the computed metrics and EXIF, to:
  - Catch things rules miss (focus landed on the background instead of the face, backlit subject, mixed lighting).
  - Write the friendly, plain-language explanation.
- Rules stay as the "source of truth" for numbers; the model explains and adds context. This keeps advice consistent and cheap.
- Subject detection (face/eye, main subject) so focus checks look in the right place.

### Phase 3: Camera instruction database (ongoing, starts in Phase 1)
- Structured data per device: dials, buttons, menu paths, mode names, ISO/shutter ranges, focus modes, and for phones the on-screen controls and gestures. Each recommendation maps to device-specific "levers" (see 3.2).
- Start with the Sony α7 II and iPhone 18 Pro, then other Sony bodies and recent iPhones, then grow to the **top ~30 beginner bodies** across Canon, Sony, Nikon, Fujifilm, Panasonic, and OM System.
- Graceful fallback for unknown models: brand-level generic instructions plus "check your manual, page X" search.
- A contribution flow (internal admin form at first) so we can add models without code changes.

### Phase 4: Accounts, history, and learning (2 to 3 weeks)
- Sign-in, saved uploads, "your most common mistakes" trends.
- Per-camera cheat sheets and short lessons linked from each issue.

### Phase 5: Polish and expansion
- RAW and ProRAW support, batch uploads.
- Mobile app (or PWA) so you can check photos right after shooting.
- More phones: older iPhones, then Pixel and Samsung (their "Pro" modes do expose shutter and ISO).
- Possibly a live "pre-shot" helper that suggests settings for a scene before you shoot.

---

## 4. Proposed tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React) + TypeScript + Tailwind** | Fast to build, good image handling, easy deploy, one language end to end. |
| EXIF parsing | **exifr** (in browser) | Fast, handles JPEG/HEIC/most RAW headers, includes MakerNotes for some brands. Server fallback: **ExifTool**. |
| Image analysis (rules) | **Python + OpenCV / NumPy** service (FastAPI), or OpenCV.js in browser for MVP | OpenCV gives blur, histogram, noise, and horizon detection for free. Python is the standard for image work. |
| AI analysis | **Claude API** (vision) | Explains findings in plain language and catches context the rules miss. |
| Camera database | **Postgres** (JSON columns for per-model controls), seeded from YAML files in the repo | Versioned in git, easy to review, queryable. |
| Storage | S3-compatible bucket (only after accounts exist) | MVP keeps photos local for privacy. |
| Hosting | Vercel (frontend) + Fly.io / Render (Python service) + managed Postgres | Cheap, simple to start. |
| Auth (Phase 4) | Clerk or Auth.js | Off-the-shelf. |

**Alternative:** if we want to avoid a Python service at first, Phase 1 can run entirely in the browser (exifr + OpenCV.js). That's cheaper and more private, but heavier on the user's device and harder to grow. Recommendation: browser-only for the MVP, move analysis server-side in Phase 2 when the AI step needs a backend anyway.

---

## 5. What will be difficult

Ranked from hardest to easiest.

### 5.1 The camera instruction database (hardest, mostly a content problem)
- There are hundreds of models, and each has its own button layout, menu tree, and naming ("Tv" vs. "S", "Av" vs. "A", "AF-C" vs. "Servo AF").
- Menu paths change with **firmware updates** and between regional variants.
- Many cameras let users **customize buttons**, so "press the C1 button" may be wrong.
- No good public, structured source exists. Manufacturer manuals are PDFs (sometimes HTML) with inconsistent structure.
- **Mitigation:** start with a small set of popular models, design a schema that separates *capabilities* (has a mode dial, has exposure comp dial) from *steps*, use AI to draft entries from official manuals with a human review pass, and always show a fallback ("Your camera calls this ‘Shutter Priority’. Look for it on the mode dial or in the shooting menu").

### 5.2 Telling a bad photo from an intentional one
- A dark photo might be a moody night shot. A blurry background is good (bokeh); a blurry subject is bad. Motion blur on a waterfall is a choice.
- Rules alone will give beginners wrong advice here, which damages trust quickly.
- **Mitigation:** subject detection so we judge focus on the subject, scene classification (night, portrait, landscape, sport), AI review for context, and phrase uncertain findings as questions ("Was the soft background intentional? If not…").

### 5.3 Reliable image quality metrics
- Blur scores depend on image size, content, and JPEG compression; a photo of fog has "low sharpness" by nature.
- Distinguishing **motion blur vs. missed focus vs. camera shake** is hard from pixels alone; EXIF helps (shutter speed, focal length, stabilization on/off).
- Noise estimates are confused by texture and in-camera noise reduction.
- **Mitigation:** normalise images to a fixed working size, combine pixel metrics with EXIF, calibrate thresholds on the test photo set, and track accuracy as a metric in CI.

### 5.4 Inconsistent and missing EXIF
- Phone apps and social media **strip EXIF** (screenshots, WhatsApp, Instagram downloads).
- Focus point, focus mode, metering mode, and stabilization are in **proprietary MakerNotes** that differ by brand, and some aren't decoded by any library.
- Lens data is often missing for adapted or manual lenses.
- **Mitigation:** detect missing metadata and tell the user why advice is limited, let them pick their camera manually, and use ExifTool on the server for the deepest MakerNote support.

### 5.5 Turning findings into the *right* setting change
- Settings trade off against each other (the exposure triangle). Fixing blur with faster shutter makes the photo darker, which means raising ISO, which means more noise.
- Recommendations must respect the camera's real limits (max ISO, lens's widest aperture) and the scene.
- **Mitigation:** a small "settings solver" that takes the current exposure, the problem, and camera/lens limits, and proposes one or two balanced options with the trade-off spelled out.

### 5.6 Smaller but real
- **File formats:** HEIC is needed from day one for iPhone photos, and browser support is uneven, so decode it with a library (e.g. libheif via WebAssembly) or server-side. RAW/ProRAW decoding is heavy and belongs server-side.
- **iPhone EXIF gets lost easily:** AirDrop and the Photos app keep it, but sharing through Messages, WhatsApp, or social apps often strips or compresses it. Upload instructions should tell iPhone users how to export with metadata intact.
- **Privacy:** photos include GPS and faces. Default to local processing, strip GPS before upload, and be explicit about storage.
- **AI cost and latency:** vision calls on every photo add up. Use rules first, call the model only for summaries and ambiguous cases, and cache results.
- **Beginner-friendly language:** the hard part is writing, not code. Every message needs a "what it means" line without jargon.

---

## 6. Open questions for discussion

1. **Platform first:** web app, or mobile from day one? (Recommendation: responsive web/PWA first.)
2. ~~**Which cameras for the MVP?**~~ Decided: Sony α7 II first (see 3.1).
3. ~~**Phones in scope?**~~ Decided: yes, iPhone 18 Pro in the MVP (see 3.2).
4. **Accounts and storage:** is a fully local, no-login MVP acceptable?
5. **Monetization:** free, freemium (X analyses per month), or one-time purchase? Affects how much AI usage we can afford.
6. **Test photos:** can you supply a starter set of your own "bad" photos with EXIF intact?

---

## 7. Immediate next steps

1. Review this plan and the frontend mocks; agree on MVP scope.
2. Scaffold the Next.js app and CI (Phase 0).
3. Build the EXIF reader and the first two analyzers (exposure, blur) behind the upload screen.
4. Draft the camera database schema and fill in the Sony α7 II entry.
5. Build the test photo set around α7 II and iPhone 18 Pro shots (yours if possible) with EXIF intact.
6. Check the iPhone 18 Pro's camera controls on a real device before writing its instruction entry.
