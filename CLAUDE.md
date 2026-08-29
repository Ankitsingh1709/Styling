# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A wardrobe app. You photograph (or upload) either a **full-body look** — the app cuts
the top, the bottom and the shoes out of that one photo as separate pieces — or a
**single garment** you tag yourself (upper body / lower body / shoes). Either way the
cutouts are saved to a persistent wardrobe. From there: a **mixer** (left/right through each
category to assemble and name outfits) and a **calendar** (assign a saved outfit to a
day). Web now; a React Native port is planned.

There is also an **AI stylist**: you say "I'm going to a party" and Claude picks a
look out of *your* wardrobe — reusing a saved outfit when one fits, otherwise
assembling a fresh top/bottom/shoes combination — which you can wear today or save.
When touching any of that code, load the `claude-api` skill first.

## Commands

Run from the repo root (npm workspaces):

- `npm install` — install both workspaces.
- `npm run dev` — start server (:3001) and client (:5173) together via `concurrently`.
  Vite proxies `/api` and `/storage` to the server, so use **http://localhost:5173**.
- `npm run dev:server` / `npm run dev:client` — start one side only.
- `npm run build` — type-check + production build of the client.
- Server type-check (tsx does NOT type-check at runtime): `cd server && npx tsc --noEmit`.
- Inspect data: `sqlite3 server/data/app.db "SELECT * FROM garments;"`.

**AI stylist setup:** the stylist runs on *either* a local model or Claude, chosen in
the app (Stylist page) and persisted server-side.

- **Local (no key needed):** start LM Studio or Ollama with a **vision-capable** model
  loaded. Defaults are `LOCAL_BASE_URL=http://localhost:1234/v1` and
  `LOCAL_MODEL=qwen/qwen3.6-35b-a3b`; for Ollama use `http://localhost:11434/v1`.
- **Claude:** copy `server/.env.example` to `server/.env` and set `ANTHROPIC_API_KEY`.

`server/src/config.ts` reads `server/.env` via Node's built-in `process.loadEnvFile()`
(no `dotenv` dependency). With neither configured the server still boots and every
other feature works — `/api/stylist` answers 503 and the Stylist page explains both
options.

There is no test suite yet.

## Environment constraints (important)

- **Node 26** (installed via Homebrew) is required. It is very new.
- **Do not add `better-sqlite3` or other native-compiled deps** — they fail to
  build against Node 26's V8 headers. The server uses the built-in **`node:sqlite`**
  (`DatabaseSync`) instead, so there is no native build step. `node:sqlite` returns
  generic `Record<string, SQLOutputValue>` rows, hence the `as unknown as GarmentRow`
  casts in `server/src/routes/garments.ts`.

## Architecture

Two workspaces: `client/` (React + Vite + TS) and `server/` (Express + TS).

### Extraction is client-side, clothing-aware, and isolated
The extractor does **clothing segmentation**, not generic background removal — it
keeps ONLY the chosen garment and drops the person (skin, face, hair, other
clothes). It runs entirely in the browser via `transformers.js`
(`@huggingface/transformers`) with the `Xenova/segformer_b2_clothes` SegFormer
model (quantized `q8` weights, ~fetched from the HF hub CDN and browser-cached on
first use). All of it lives in `client/src/lib/extract.ts`, which exports two entry points over a
shared `cutout()` helper:
- `extractGarment(blob, category, onProgress)` → one `Blob` for one category.
- `extractAllGarments(blob, onProgress)` → `ExtractedPiece[]` (`{category, blob,
  coverage}`) — the **full-look scan**. It runs a *single* inference and re-masks the
  same segments once per category, so pulling three pieces costs the same as one.
  Two noise guards, both tuned against a real full-body photo: `MIN_COVERAGE`
  (0.05% of the frame) and, for the full-look scan only, `MIN_RELATIVE` (a piece
  must be ≥2% of the largest piece found). Keep them low — measured on a real
  street photo the top was 2.8% of the frame but the *shoes were only 0.31%*, so a
  stricter floor silently loses them. It throws only when nothing is found.

**This is the one web-only piece**: the mobile port swaps these functions' bodies for
a native/server equivalent and nothing else changes. The server never does
extraction — it receives the finished transparent PNG.

Extraction is **category-aware**: each category maps to a set of model class
labels in `extract.ts` (`CATEGORY_CLASSES`). The model emits the **ATR-18 label set
and nothing else** — dumped from a real photo it returns exactly: `Background, Hat,
Hair, Sunglasses, Upper-clothes, Skirt, Pants, Dress, Belt, Left-shoe, Right-shoe,
Face, Left-leg, Right-leg, Left-arm, Right-arm, Bag, Scarf`. There is no `T-shirt`
or `Shorts` class: a tee is `Upper-clothes` (a long one, `Dress`) and shorts are
`Pants`. Don't add labels outside that list — they silently never match. The
function unions the mapped classes' masks, stamps them as the alpha channel
on the original pixels, and tight-crops to the garment's bounding box (product-cutout
look). The most recent segmentation is cached by input blob so switching category
re-masks instantly without re-running inference; `releaseSegmentationCache()` drops
it (CapturePage calls it on unmount — the masks are full photo resolution, one per
detected class, so a phone photo can pin ~100 MB).

Cutout quality tracks how much of the frame the garment fills: a close, well-lit
shot gives clean product cutouts, while a subject standing small in a landscape
photo yields small, ragged pieces. Masks come back at full photo resolution, so
nothing is lost to downsampling — it's purely how many pixels the garment had.

Note: this isolates the garment but does NOT redraw it flat/ghost-mannequin — that
would be a generative step and is not implemented.

### The AI stylist (swappable provider)
Two AI calls, both **server-side only** — `client/` must never see the API key, since
Vite would inline anything it can reach.

Everything goes through the `AiProvider` interface in `server/src/ai/types.ts`
(`describeGarment`, `suggestOutfit`), with two implementations behind it:

- `ai/anthropic.ts` — Claude via the Anthropic API. Real structured outputs:
  `messages.parse()` + `zodOutputFormat`, `claude-opus-5`, adaptive thinking, effort
  `low` for tagging and `medium` for styling. No `budget_tokens` (400 on Opus 5), no
  assistant prefill.
- `ai/local.ts` — a model on this Mac over the OpenAI-compatible endpoint that LM
  Studio (:1234) and Ollama (:11434) expose. See the hard-won constraints below.

`ai/schemas.ts` holds the zod schemas both share, so the two backends can't drift.
`ai/index.ts` is the registry: the active provider is persisted in the `settings`
table (survives restarts, and keeps background tagging and the chat in agreement),
switchable at runtime via `GET/PUT /api/ai/provider(s)` and the picker on the Stylist
page. `DEFAULT_AI_PROVIDER` honours `AI_PROVIDER`, else prefers Claude when a key
exists, else local.

**Local models: three things that were measured, not guessed** (LM Studio +
`qwen/qwen3.6-35b-a3b` on an M4 Pro):
1. **Don't use `response_format`.** Strict `json_schema` grammar makes reasoning
   models return *empty* content, and made `gemma-4-31b` degenerate into repeated
   tokens ("own own own"). `json_object` is rejected outright ("must be 'json_schema'
   or 'text'"). So the local provider stays in text mode, asks for JSON in the prompt
   (shape generated from the zod schema via `z.toJSONSchema`), and parses leniently —
   stripping ``` fences and taking the outermost braces.
2. **Budget for the thinking.** These models spend 4-5k characters reasoning before
   answering, out of the same `max_tokens`. Too small a cap and the budget is gone
   before the answer starts: empty content, `finish_reason: "length"`. Hence 8000
   tokens, and a retry at 12000 that tells it to stop deliberating. Thinking cannot be
   turned off here — `enable_thinking: false` and `/no_think` both had no effect.
3. **Be patient.** Loading a model takes up to a minute, so the request timeout is 10
   minutes and the availability check is a separate 3s ping to `/models`.

Measured on the M4 Pro (model already loaded): tagging ~12-15s per garment, styling
~20s. Only `analysis`-less garments are ever tagged, so switching provider does not
re-describe the wardrobe.

The two jobs:

1. **Tagging — `server/src/garmentAnalysis.ts`.** A garment row is only a category and
   a PNG path, which is nothing to style with. So one vision call per garment records
   what it looks like (`description`, `colors`, `pattern`, `formality`, `warmth`,
   `seasons`, `occasions`) into `garments.analysis` as JSON. It runs *once*: fired
   and not awaited on save (`analyzeGarmentInBackground`, so uploads stay fast), with
   `backfillMissing()` covering anything unanalysed — on server boot, after a provider
   switch, and before any suggestion. Both providers read the stored transparent PNG
   directly; the alpha channel is *not* a problem (verified on real cutouts — local
   models returned "medium-wash blue denim jeans, five-pocket" from one).
2. **Suggesting — `server/src/routes/stylist.ts`.** `POST /api/stylist` with
   `{ messages, bodyType? }`. It builds a compact text catalog (every garment with its
   tags, every saved outfit, the last 14 wears so it can avoid repeats), sends the chat
   history, and gets back `{ reply, pick, provider }`.

**Never trust the returned ids.** `resolvePick()` re-checks every id against SQLite and
requires the category to match its slot, via `garmentIdForCategory()` in
`garmentDto.ts`; a hallucinated or mis-slotted id degrades to `pick: null`, never to a
broken image or a bad row. `POST /api/outfits` uses the same helper.

### Data flow (the core loop)
`CapturePage` (camera via `getUserMedia`, file picker, or drag-and-drop) runs in one
of two modes:
- **Full look** (default) — `extractAllGarments(blob)` → the detected pieces render as
  toggleable cards; saving POSTs each kept piece.
- **Single item** — pick category → `extractGarment(blob, category)` → one POST.

Each save is `POST /api/garments` (multipart: `image` PNG + `category`). The
server writes the PNG to `server/storage/<uuid>.png` and a metadata row to SQLite,
then serves images back at `/storage/<file>`. `WardrobePage` reads `GET /api/garments`
and renders by category.

### Fixing a garment the extractor got wrong
Extraction mis-files things often enough to matter (a jacket tied round the
waist comes back as a `bottom`), and the stylist reasons from the stored
*description*, not the image — so a bad tag skews every later suggestion. The
wardrobe tile opens `components/GarmentSheet.tsx`, which offers:

- `PATCH /api/garments/:id` `{category}` — re-file it. **This also nulls the
  outfit slot that referenced the garment under its old category**, otherwise an
  outfit would keep rendering shoes on the torso. Same reasoning as the
  `garmentIdForCategory` guard.
- `POST /api/garments/:id/describe` — re-run the vision pass on demand.

### Client bundle: keep the extractor out of the entry chunk
Routes are `React.lazy`-split in `App.tsx`. transformers.js + the ONNX runtime
are ~888 kB and are used **only** by `CapturePage`; a static import put them in
the entry chunk, so opening the Calendar downloaded the whole model runtime
(entry was 1,089 kB, now 177 kB).

The trap: importing anything from a page module pulls that page's chunk in with
it. `CATEGORY_ICONS` used to live in `CapturePage` and was imported by the
wardrobe — which dragged the extractor back into that route. Shared constants
belong in `api.ts`. After changing imports, check `npm run build`'s chunk list.

### Categories are a single source of truth
The three categories (`top`, `bottom`, `shoes`) are defined in **two** places that
must stay in sync: `server/src/config.ts` (`CATEGORIES` + the DB `CHECK` constraint
in `server/src/db.ts`) and `client/src/api.ts` (`CATEGORIES` + `CATEGORY_LABELS`).
Adding a category means updating both sides and the `CHECK` constraint.

### Storage & DB
Images live on disk under `server/storage/`; metadata in SQLite at
`server/data/app.db`. Both directories are git-ignored (runtime data, not source).
The schema is created on boot in `server/src/db.ts`: `garments`, `outfits`, and
`wears` (calendar: date → outfit, one per day) are all in active use.

### Server layout
`server/src/index.ts` wires middleware, static `/storage`, and the routers
(`garments`, `outfits`, `wears`, `stylist`), and kicks off the garment-tagging
backfill on boot. The DTO helpers are the shared seam:
`garmentDto.ts` (`toGarmentDto`, `garmentDtoById`) and `outfitDto.ts` (`toOutfitDto`,
`outfitDtoById`) — routes import these rather than re-querying, so an outfit always
embeds its garment images and a wear always embeds its full outfit. Referential
cleanup is done in SQL: outfits reference garments `ON DELETE SET NULL` (deleting a
garment empties that slot but keeps the outfit); `wears` reference outfits
`ON DELETE CASCADE` (deleting an outfit removes its calendar entries).

### Client layout
`main.tsx` mounts the router; `App.tsx` provides `BodyTypeContext`, shows the
first-run onboarding modal, and defines routes + the persistent `SideNav` (top-left
burger → slide-in left drawer; no bottom nav — the top-bar title reflects the active
route via `useLocation`). Pages: `CapturePage` (mode switch → capture/drop → scan → save one or many),
`WardrobePage` (per-category counts, filter chips, grid by category), `MixerPage` (three horizontal snap
carousels — `components/MixStrip.tsx` — stacked into a live outfit on white; the
centred garment is full size with its neighbours peeking, dimmed, at the sides; a
`BodySilhouette` shows faintly behind them; optional name on save; saved outfits
rename inline and delete), and `CalendarPage` (month
grid; a dot + mini thumbnail mark days with a stored outfit; tap a day to assign one
— `wears` is keyed by date, one outfit per day, upserted), and `StylistPage` (chat
with the AI stylist; a suggestion renders as a real image stack with **Wear it today**
and **Save as an outfit**, both of which reuse `saveOutfit`/`setWear` rather than any
new endpoint — the calendar stores outfit ids, so a fresh combination is saved as an
outfit first). `api.ts` centralizes fetch
calls, shared types, and the `ymd()` local-date helper (used instead of
`toISOString` to avoid a UTC day-shift).

**Body type** (male/female) is a per-browser preference in `localStorage`, managed by
`lib/bodyType.ts` (`BodyTypeContext` + `load/persistBodyType`). It's asked once on
first launch (the modal in `App.tsx`), changeable anytime in the drawer footer, and
drives which `components/BodySilhouette.tsx` SVG renders behind the mixer stack. It's
purely a client-side display preference — not sent to or stored on the server.

Outfit rename is `PATCH /api/outfits/:id` (`renameOutfit` in `api.ts`); an empty/
whitespace name clears it back to null.

### Styling (redesigned — see DESIGN.md)
`client/src/index.css` holds the whole visual system, rebuilt on the
`redesign/apple-adaptive` branch as a phone-native surface following iOS
conventions, so the planned React Native port is a translation rather than
another redesign. **`DESIGN.md` is the authority** — tokens, type scale, motion
rules and the reasoning behind them.

The shell: `components/Screen.tsx` (large title collapsing to an inline bar
title on scroll), `components/TabBar.tsx` (5 top-level sections — the burger
drawer is gone, and `SideNav.tsx` with it), `components/Sheet.tsx` (focused
sub-tasks), `components/SettingsSheet.tsx` (appearance + body shape).

Two rules that are easy to break:
- **Icons are drawn, never emoji.** `components/Icon.tsx` is the single source:
  authored SVG on a 24px grid, one stroke weight, `currentColor`.
- **Light and dark are both first-class.** `lib/appearance.ts` manages
  system/light/dark and stamps `data-appearance` on `<html>`; every colour is a
  token defined in both. Never hard-code a hex in a component.

### Display vs. storage: transparent PNG, white background
Stored garment PNGs are **transparent** (so the mixer can stack top+bottom+shoes into
one look). The **white product-shot background is display-only**, applied via CSS in
`index.css` (`.preview`, `.garment img`, `.outfit`). Never bake a background into the
stored image — it would occlude other layers in the mixer.

## Product record

`PRODUCT.md` at the repo root is the durable product truth, written via
`/impeccable init` on 2026-08-29 from a real interview. Read it before design work;
update it rather than restating it here. Three decisions in it change how UI work is
done:

- **Platform is `adaptive`** — one product that genuinely adapts per OS, because the
  React Native port is coming. Design language should respect iOS and Android
  conventions now, not web habits. The impeccable flow requires loading
  `.claude/skills/impeccable/reference/ios.md` and `android.md` before any design work
  on an `adaptive` platform.
- **It is aimed at real users**, not just its author — so first-run, empty states and
  error handling are real product work.
- **Local-first is not a promise.** Preserve it where cheap; don't market it as a
  guarantee or let it block a feature.

## Frontend work: use the design skills

Any UI change here goes through the design skills installed in `.claude/skills/` —
don't design from default instincts. Read the relevant `SKILL.md` **before** writing
UI code (skills installed mid-session aren't in the `/`-invocable list until a
restart, but the files are always readable).

- `redesign-existing-projects` — audit an existing screen, remove generic patterns.
- `high-end-visual-design` — concrete type/spacing/shadow/animation rules.
- `design-taste-frontend` — take a brief and ship a direction (`-v1` is the older one).
- `impeccable` — design context and audit passes. Note it also registers
  `PostToolUse(Edit|Write)` and `Stop` hooks in `.claude/settings.local.json` that run
  `.claude/skills/impeccable/scripts/hook.mjs`, so UI edits get checked automatically.
- `minimalist-ui` / `industrial-brutalist-ui` — specific aesthetics. Both are a
  departure from the current identity, so only adopt one deliberately.

Motion — this app leans on animation (aurora blobs, `pop-in`, `page-in`, `shimmer`,
the capture scanline), so these earn their keep:

- `review-animations` / `improve-animations` — audit existing motion; produce fixes.
- `find-animation-opportunities` — read-only; finds what should animate but doesn't.
- `animate` — build one animation, decisions in the order that makes it feel right.
- `animation-vocabulary` — put a name to an effect you can only describe.
- `apple-design`, `emil-design-eng` — fluid physical motion, and UI polish detail.
- `prototype` — several genuinely different versions behind a visual picker.
- `pick-ui-library` / `ask-sonner` — widget choices; Sonner is worth considering if
  the hand-rolled `.toast` classes ever need to grow up.

For the planned React Native port: `animate-expo` (RN/Expo motion) and `write-swift`.

Whatever the skill says, keep the `prefers-reduced-motion` block in `index.css`
honoured — every animation in the app is already disabled under it.

The app's current look is documented under Styling above: dark ground, two animated
aurora blobs, translucent blurred surfaces, one violet→pink `--grad` accent for every
primary control. Keep new UI inside that system unless a redesign is explicitly asked
for.

## Conventions

- TypeScript throughout, ESM (`"type": "module"`) in both workspaces. Server relative
  imports use explicit `.js` extensions (ESM + `moduleResolution: Bundler`).
- The API returns garments as `{ id, category, imageUrl, createdAt }` — `imageUrl` is
  a ready-to-render `/storage/...` path, not a raw filename.
