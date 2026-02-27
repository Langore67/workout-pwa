# Workout MVP (PWA) — Simple & Fast

Offline-first workout tracker you can run on iPhone/iPad **without a Mac**.

## Features (v1)
- Exercise catalog
- Separate Tracks per exercise: Strength (default 3–6) vs Hypertrophy (8–12) vs Corrective
- Templates (workout builder)
- Gym Mode: one-tap add sets + inline editing
- Progressions: reps-first, based on **best completed session in last 5 days** per track:
  - score = median working weight * 1000 + total reps
  - only uses working sets (warm-ups never affect progression)
- Walk logging (manual)
- Export CSV as a ZIP

## Run on Windows
1) Install Node.js LTS
2) In this folder:
   ```bash
   npm install
   npm run dev
   ```
3) Open the URL shown (usually http://localhost:5173)

## Use on iPhone/iPad
You need to deploy it (HTTPS is required for “Add to Home Screen” PWA install).

Easy deploy options:
- Cloudflare Pages
- Vercel
- Netlify

Build command: `npm run build`
Output folder: `dist`

### Add to Home Screen
- Open the deployed site in Safari
- Share → Add to Home Screen

## Notes
- Local-only storage is IndexedDB (Dexie).
- Cloud sync can be added later without changing the data model.


## PRs + Session Complete (v2)
- PRs computed only when you **Finish session** (quiet, Strong-style).
- Track-specific (Strength vs Hypertrophy never mix).
- Priority: Best single-set Volume, then Weight, then e1RM (Epley, reps <= 12).
- After finishing you land on **Session Complete**, and PRs only show if you hit at least one.
