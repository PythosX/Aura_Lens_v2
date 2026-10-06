# Anime Portal — Hand Tracking (Vite + React + TS)

Real-time two-hand tracking (MediaPipe Hands) that warps an anime image into the
quad between your hands, with a neon glow border, energy particles and a cyberpunk HUD.

## Run
```bash
npm install
npm run dev      # http://localhost:5173  (camera works on localhost / https)
npm run build
```

## How it works
- `src/lib/tracker.ts` – camera + MediaPipe, split into separate steps (runtime → model → camera → detection loop).
- `src/App.tsx` – staged boot: one step at a time, each waits for a paint, so the UI never freezes.
- `src/components/HandPortal.tsx` – 60 FPS render loop (independent from detection): mirrored video, warped image, glow, particles, debug, FPS.
- `src/lib/warp.ts` – projective warp (homography → 10×10 triangle mesh on Canvas 2D).
- Corners = index tip + thumb tip of each hand.

## Customize
- Characters: built-in art is original placeholder SVG (`src/lib/presets.ts`). Use **Upload image** in the Controls drawer for your own.
- Badge link: edit `PORTFOLIO_URL` in `src/components/PythosxBadge.tsx`.
- MediaPipe model files load from the jsDelivr CDN (needs internet on first run).


## Multi-Region Face Tracking

Aura Lens now supports independent face-zone triggers:

- **Eyes** — eye/bridge region
- **Mouth / Lower Face** — nostrils through chin
- **Forehead** — brow/forehead region
- **Full Face** — both hands enclosing the face

The app combines MediaPipe Hands with MediaPipe Face Landmarker. Hand landmarks are converted into screen-space polygons and compared against facial landmark zones. Each active zone is independently smoothed and perspective-warped on the canvas.

### Region Asset Mapping

The Controls drawer lets you assign a different anime asset to each region, so combinations such as **Gojo Eyes + Sukuna Mouth + Naruto Forehead** can run simultaneously.

### Architecture

- `src/lib/tracker.ts` — webcam, Hand Landmarker and Face Landmarker pipeline
- `src/lib/regions.ts` — facial zones, polygon/hull overlap and activation scoring
- `src/hooks/useMultiRegionTracker.ts` — reusable region-tracking hook
- `src/components/FaceCanvasOverlay.tsx` — 60 FPS video, overlays, glow, particles and debug rendering
- `src/lib/warp.ts` — perspective image warping
- `src/lib/types.ts` — region-aware settings and asset configuration

The Face Landmarker runtime is loaded from the MediaPipe Tasks Vision CDN and its model is fetched from Google's MediaPipe model storage, so no large model binary is committed to the repository.
