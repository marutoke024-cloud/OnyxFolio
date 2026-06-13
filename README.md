# Onyx Folio

A dark, editorial gallery for collecting the images you love and binding them into
your own **portfolio / lookbook**. Built as a zero‑build static site — plain
HTML / CSS / ES modules, no framework, no toolchain.

> Designed for touch first (iPad · Galaxy S25). All interface text is English in a
> modern typeface; anything **you** type — folder names, captions, portfolio copy —
> is set in the bundled Japanese serif *京華老宋体 (Jinghua Laosong)*.

## The four rooms

1. **Enter** — a dim flower painting, stippled into softly twinkling pointillist
   dots, glows behind a quiet title. Press **Enter** (the pill or <kbd>↵</kbd>) to step inside.
2. **Folders** — a slowly drifting, looping field of onyx folders. Each shows a few
   of its photos peeking from the pocket. Scroll / drag to roam, click to open,
   right‑click (or long‑press) to rename or delete, ＋ to add a new one.
3. **Album** — a 3‑D gallery wall. Tag your images, then tap a tag on the right and
   the matching shots float forward while the rest recede. Drop images in or tap
   **Add**; open any image to rename, tag, or delete it.
4. **Portfolio** — an editable lookbook that **turns like a real book**
   (two‑page spread on tablet/desktop, single page on phones). Pick a layout per
   page, drop in images, and type directly onto the page. Pages, layouts and tone
   are all editable from the floating bar.

## Storage & sync

Everything lives locally in **IndexedDB**, so the app is fully usable offline.
Sync is **manual** via your own Firebase Storage:

1. Open **Sync & Settings** (the gear, top‑right of any inner view).
2. Paste your Firebase **web config** (Project Settings → Your apps → Web →
   *SDK setup & configuration*). It is stored only in this browser — no keys live
   in the repository.
3. **Upload · overwrite cloud** pushes your whole library up; **Download ·
   overwrite local** pulls it back down onto this device.

> Make sure your Storage security rules permit your access (authenticated, or open
> for a private project). The Firebase SDK is loaded on demand from the CDN, so an
> unconfigured app never touches the network.

## Run locally

No Node required. From the repository root use any static server, e.g. the bundled
PowerShell one used during development:

```powershell
powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 5550 -Root OnyxFolio
```

…then open <http://localhost:5550>. (Hosted via GitHub Pages otherwise.)

## Project layout

```
index.html            shell · fonts · view stylesheets
manifest.webmanifest  installable PWA metadata
css/                  base design system + one stylesheet per view
js/
  main.js             hash router with cross‑fading views
  views/              landing · folders · album · portfolio
  lib/                pointillism · image ingest · icons · chrome · settings · dom helpers
  storage/            db.js (IndexedDB) · sync.js (Firebase Storage)
assets/               fonts · icons · favicon
```

## Notes

- The bundled Japanese font is large (~35 MB, a full CJK face). It is scoped with
  `unicode-range` + `font-display: swap`, so it only downloads when Japanese text
  is actually rendered — an all‑English session never fetches it.
- No analytics, no tracking, no accounts. Your images stay on your device until you
  choose to upload them.
