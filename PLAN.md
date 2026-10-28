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
- Phone photographers who want to understand their "Pro" mode (stretch goal).

### What it is not (for now)
- Not a photo editor. We won't fix the photo, we teach how to take a better one next time.
- Not a social network or portfolio.

---

## 2. Core user flow

1. **Upload** one or more photos (JPEG first, then HEIC and RAW).
2. App reads EXIF and detects the camera body and lens.
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
- Camera instructions for **one brand family** to prove the format (e.g. Canon EOS R series or Sony Alpha).
- No accounts; everything stays in the browser.

**Exit criteria:** on the test set, at least 80% of the main issues are correctly flagged and a beginner can follow the instruction card without help.

### Phase 2: AI-assisted analysis and explanations (3 to 4 weeks)
- Add a vision-language model (Claude) to look at the photo plus the computed metrics and EXIF, to:
  - Catch things rules miss (focus landed on the background instead of the face, backlit subject, mixed lighting).
  - Write the friendly, plain-language explanation.
- Rules stay as the "source of truth" for numbers; the model explains and adds context. This keeps advice consistent and cheap.
- Subject detection (face/eye, main subject) so focus checks look in the right place.

### Phase 3: Camera instruction database (ongoing, starts in Phase 1)
- Structured data per camera model: dials, buttons, menu paths, mode names, ISO/shutter ranges, focus modes.
- Cover the **top ~30 beginner bodies** across Canon, Sony, Nikon, Fujifilm, Panasonic, and OM System.
- Graceful fallback for unknown models: brand-level generic instructions plus "check your manual, page X" search.
- A contribution flow (internal admin form at first) so we can add models without code changes.

### Phase 4: Accounts, history, and learning (2 to 3 weeks)
- Sign-in, saved uploads, "your most common mistakes" trends.
- Per-camera cheat sheets and short lessons linked from each issue.

### Phase 5: Polish and expansion
- RAW and HEIC support, batch uploads.
- Mobile app (or PWA) so you can check photos right after shooting.
- Phone "Pro mode" guidance (iPhone, Pixel, Samsung).
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
- **File formats:** HEIC and RAW decoding in the browser is heavy; plan to do it server-side.
- **Privacy:** photos include GPS and faces. Default to local processing, strip GPS before upload, and be explicit about storage.
- **AI cost and latency:** vision calls on every photo add up. Use rules first, call the model only for summaries and ambiguous cases, and cache results.
- **Beginner-friendly language:** the hard part is writing, not code. Every message needs a "what it means" line without jargon.

---

## 6. Open questions for discussion

1. **Platform first:** web app, or mobile from day one? (Recommendation: responsive web/PWA first.)
2. **Which cameras for the MVP?** Pick one brand family that you or early testers actually own.
3. **Phones in scope?** Phone photos have rich EXIF but few manual controls. Include in MVP or later?
4. **Accounts and storage:** is a fully local, no-login MVP acceptable?
5. **Monetization:** free, freemium (X analyses per month), or one-time purchase? Affects how much AI usage we can afford.
6. **Test photos:** can you supply a starter set of your own "bad" photos with EXIF intact?

---

## 7. Immediate next steps

1. Review this plan and the frontend mocks; agree on MVP scope and first camera brand.
2. Scaffold the Next.js app and CI (Phase 0).
3. Build the EXIF reader and the first two analyzers (exposure, blur) behind the upload screen.
4. Draft the camera database schema and fill in the first model.
