# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A mostly-frontend React app that slices a long cover image into a grid of sub-images for WeChat Channels (微信视频号) creators. It supports 1×3 / 2×3 / 3×3 / custom grids, draggable cut-line micro-tuning, WeChat-publishing-order-aware filename numbering, ZIP export, and a phone-frame mockup that previews how the slices tile on a Channels profile page.

The image pipeline runs client-side on `<canvas>` — no upload, no server image processing. A small zero-dependency Node server ([server.js](server.js)) exists solely for **4A SSO authentication and daily slicing quotas** (anonymous: 1/day per IP; logged-in: 10/day per user). The metadata.json `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` capability and the `.env.example` `GEMINI_API_KEY` are AI-Studio scaffold artifacts; **no AI/GenAI features are wired into the app**. Do not assume `@google/genai` is used — grep first.

## Commands

Package manager is **bun** (lockfile is `bun.lock`); npm/yarn also work.

- `bun run dev` — Vite dev server on `http://0.0.0.0:3000` (proxies `/api/*` to `127.0.0.1:3990`)
- `bun run build` — production build to `dist/`
- `bun run preview` — preview the production build
- `bun run lint` — typecheck only (`tsc --noEmit`). There is no ESLint config; "lint" === typecheck.
- `bun run clean` — remove `dist/`
- Local quota server for dev: `QUOTA_DB=./data/usage.json node server.js` (starts on port 3990)

There is **no test runner** configured. Do not invent test commands.

### AI Studio / agent-edit HMR caveat
[vite.config.ts](vite.config.ts) reads `DISABLE_HMR`. When `DISABLE_HMR=true`, both HMR and file watching are disabled to prevent flicker while an agent edits files in AI Studio. Do not remove this conditional — leave the `process.env.DISABLE_HMR` logic intact when modifying the Vite config.

## Architecture

Single-page React 19 + TypeScript + Vite + Tailwind v4 app. Path alias `@/*` → repo root (configured in both [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts)). Tailwind is loaded via the Vite plugin, not PostCSS; the only stylesheet is `@import "tailwindcss";` in [src/index.css](src/index.css). Entry: [src/main.tsx](src/main.tsx) → [src/App.tsx](src/App.tsx).

### State flow (all state lives in App.tsx)

`App` owns three pieces of state and threads them down to presentational components:

1. **`imageMeta: ImageMeta | null`** — the loaded source image (File + objectUrl + decoded `HTMLImageElement`). Created on upload/drop/paste/demo-load in [ImageUploader](src/components/ImageUploader.tsx); `objectUrl` is revoked on full reset.
2. **`grid: GridConfig`** — `{ rows, cols, verticalLines[], horizontalLines[] }`. The `*Lines` arrays are **normalized ratios in [0,1]**, not pixels — a cut line at `0.3333` means "one third across." For `cols` columns there are `cols-1` vertical lines; for `rows` rows, `rows-1` horizontal lines. Components mutate these arrays directly and re-sort them after each edit (see `InteractiveCanvas` drag handlers and `nudgeLine`).
3. **`exportSettings: ExportSettings`** — format/quality/prefix/publishOrderMode/outputSizeMode/includeReadme.
4. **`quota: QuotaSnapshot | null`** — auth identity + today's remaining slicing quota, fetched from `/api/quota` on mount and refreshed after every slice attempt.

### 4A SSO & slicing quota ([src/utils/auth.ts](src/utils/auth.ts), [src/utils/quota.ts](src/utils/quota.ts), [server.js](server.js))

The app is a soft gate: anonymous browsing/upload is unrestricted; only the "start slice" action consumes quota.

- **Client token flow** (`auth.ts`): `initSSO()` on mount recovers the token from `?sso_token=` URL param → `localStorage['access_token']` → cross-subdomain `sso_token` cookie (in that priority; URL token is cleaned from the address bar). `requireLogin()` redirects to `https://auth.smartbid.site/login?redirect=<current url>`; 4A redirects back with `?sso_token=`. Logout (`clearToken()`) does three things: removes the local token, deletes the shared `sso_token` cookie (all domain variants — otherwise `initSSO`'s cookie fallback silently re-logins), and sets a sessionStorage suppress flag that skips the cookie fallback in the same tab until an explicit login returns a fresh URL token. It also best-effort POSTs 4A `/api/auth/logout` with the token to invalidate it server-side.
- **Server** (`server.js`, systemd unit `grid-quota.service` on the VPS, listens `127.0.0.1:3990`, proxied by Caddy at `/api/*`): `GET /api/quota` (status) and `POST /api/quota/consume` (atomically burns 1 unit; 429 `{error:'quota_exceeded'}` when exhausted). Limits: anonymous **1/day keyed by `Cf-Connecting-Ip`**, authenticated **10/day keyed by 4A numeric user id**; day boundary is Asia/Shanghai midnight; state persisted to `/var/lib/grid-quota/usage.json` (7-day retention).
- **Token verification** happens server-side against 4A `/api/auth/verify` with a 10-min positive cache / 60s negative cache. Follows the guide's cache rules: expired cache entry → delete and re-verify (never "expired cache = logged out"); verify network failure → fail open as anonymous, never 500. If the API reports `reason: 'token_invalid'`, the client clears its stored token.
- **Consume gating** in `App.handleStartSlice`: consume succeeds → slice; `quota_exceeded` → QuotaModal (login CTA for anonymous); service unreachable → **fail closed in prod** (anti-bypass) but fail open in dev (`import.meta.env.DEV`) so local work without the quota server still functions.

### The slicing pipeline ([src/utils/imageProcessor.ts](src/utils/imageProcessor.ts))

This module is the core of the app; everything else is UI. Key invariants:

- **`calculateSliceBoxes(...)`** is pure geometry. It prepends `0` and appends `1` to the cut-line arrays, then walks the resulting row/col bands to produce source-pixel `x/y/w/h` boxes. It runs in two places: (a) live in `App` via `useMemo` to render overlay boxes on the canvas *before* slicing, and (b) inside `executeSliceImage` to do the actual pixel cut. Both must stay consistent — if you change box math, change it in one place and both callers inherit it.
- **`publishOrderMode`** determines filename numbering. `sequential` → `01,02,03…` left-to-right top-to-bottom. `reverse_profile` → last index published first (so on the Channels profile, where newest = top-left, the slices tile into a complete poster). The `displayOrder` (visual grid position) and `publishOrder` (recommended upload sequence) are **separate fields** on every `SliceItem`; preserve the distinction when touching naming/labels.
- **`outputSizeMode`**: `original` = 1:1 pixel crop; `standard_3_4` = 1080×1440; `standard_6_7` = 1080×1260. The non-original modes stretch-fill the crop into the target canvas (no letterboxing) — be aware when changing draw logic.
- **`executeSliceImage`** uses `document.createElement('canvas')` + `toBlob`/`toDataURL` and yields with `setTimeout(8ms)` per slice to keep the UI responsive. The `onProgress` callback signature is `(percent, current, total)` — note App.tsx calls it as `(pct) => setProgress(pct)`, passing only the first arg.
- **`copySliceToClipboard`** re-encodes to PNG because the Clipboard API only accepts `image/png`, regardless of the chosen export format.
- **`createDemoPoster(preset)`** generates a sample poster File entirely on canvas so users can try the tool without a real image. Presets match the grid layouts (1×3 / 2×3 / 3×3) and the canvas dimensions drive the auto-detected row count in `App.handleImageSelected`.

### Component responsibilities

- [InteractiveCanvas.tsx](src/components/InteractiveCanvas.tsx) — the editor stage. Renders the source image with a CSS `transform: scale(translate)` for zoom/pan, overlays slice boxes, and renders draggable vertical (blue) / horizontal (amber) split lines. Dragging a line recomputes its normalized ratio from mouse position against the rendered `<img>` bounding rect, clamps to [0.05, 0.95], and re-sorts the array. The "安全区" (safe-zone) overlay marks the bottom 15% of each box (WeChat covers up the bottom with title/buttons).
- [GridControls.tsx](src/components/GridControls.tsx) — left-panel controls: row/col presets, custom sliders, format/order/prefix settings, and the "start slice" button. `handleSetRows`/`handleSetCols` regenerate the cut-line arrays to equal divisions when the count changes (so changing rows wipes manual horizontal-line tweaks — intentional).
- [SliceResultGallery.tsx](src/components/SliceResultGallery.tsx) — post-slice grid of thumbnails with per-slice download, copy-to-clipboard, full-ZIP download (JSZip + confetti), and a lightbox preview.
- [WeChatProfileMockup.tsx](src/components/WeChatProfileMockup.tsx) — phone-frame simulation of a Channels profile page, tiling the slices into a 3-column grid with a play-by-play publishing simulation (`simulationStep` interval).
- [PublishGuideModal.tsx](src/components/PublishGuideModal.tsx) — static explanatory modal on WeChat publishing order, aspect ratios, and safe zones.
- [QuotaModal.tsx](src/components/QuotaModal.tsx) — quota/login modal shown on `quota_exceeded` or service outage; anonymous users get a login CTA (每日 10 次), logged-in users see usage/reset time.
- [Header.tsx](src/components/Header.tsx) — also renders the auth area (`btn-login` / `auth-user-chip` + `btn-logout`) and the clickable quota badge (`btn-quota-status`) that opens QuotaModal.

## Deployment

Push to `main` → GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) rsyncs `dist/` + `server.js` to `/var/www/grid/` on the VPS, restarts `grid-quota.service`, then health-checks `robots.txt` and `/api/quota` on `https://grid.smartbid.site`. Caddy reverse-proxies `/api/*` → `127.0.0.1:3990` (see the `grid.smartbid.site` block in the VPS `/etc/caddy/Caddyfile`); everything else is static from `/var/www/grid`. Quota state lives in `/var/lib/grid-quota/usage.json` (survives deploys — don't delete it).

## Conventions

- The UI is **Chinese-language** (`lang="zh-CN"`). User-facing strings, button labels, file-name prefixes, README text inside the ZIP, and placeholder copy are all Chinese — match this when adding UI text. Default filename prefix is `视频号封面`.
- `id` attributes on interactive elements (e.g. `btn-start-slice`, `handle-vline-0`, `input-filename-prefix`) exist for external/automated targeting; preserve them when refactoring markup.
- Lucide-react icons are imported per-component; `motion` and `canvas-confetti` are available but used sparingly (confetti only on ZIP download).
