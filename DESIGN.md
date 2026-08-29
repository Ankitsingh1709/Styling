# Design

<!-- Recorded from the built world after the redesign, not from intention. -->

## World

A phone-native surface built to iOS conventions so the planned React Native port
is a translation, not another redesign. System neutrals carry the app; the
garments supply every other colour on screen.

Craft bar: Apple's own apps (Photos, Fitness, Weather). This is the platform
canon executed straight — no irony, no smuggled quirk.

## Appearance

Light and dark are equal, both designed and tested. `system` follows the OS and
is the default; `light`/`dark` stamp `data-appearance` on `<html>`. Chosen from
the use scene rather than category habit: this app is opened at a wardrobe in
morning light and in bed at night.

## Colour — Restrained

Neutrals plus one tint. The tint drives interaction only; decoration is not its
job.

| Token | Light | Dark |
|---|---|---|
| `--tint` | `#1f6f52` | `#4cb894` |
| `--bg` | `#f2f2f7` | `#000000` |
| `--bg-elevated` | `#ffffff` | `#1c1c1e` |
| `--label` | `#000000` | `#ffffff` |
| `--label-2` | `rgba(60,60,67,.6)` | `rgba(235,235,245,.6)` |
| `--separator` | `rgba(60,60,67,.18)` | `rgba(84,84,88,.65)` |
| `--segment-active` | `#ffffff` | `#48484a` |

`--studio` (`#ffffff`) stays light in both appearances: a garment photographed
on white reads wrong on black. It is display-only — **never** bake it into a
stored PNG or the mixer cannot stack layers.

Dark-mode tint is deliberately jade rather than mint. The first pass shipped
`#3ddc9a`, which glowed against the garments and landed in the near-black +
neon-accent cluster; it was pulled back.

## Type

System stack (`-apple-system` → SF Pro on Apple hardware), 17px body. The craft
floor prefers a self-hosted display face, but the pinned world overrides it: a
web display font in an iOS-canon app is exactly the off-spec tell the platform
reference calls slop. Scale: `.t-large-title` 2.05rem/700 → `.t-caption`
0.75rem. Tabular numerals on dates and counts.

## Icons

`components/Icon.tsx` — authored SVG on a 24px grid, stroke 1.7 (2.0 when a tab
is selected), round caps and joins, `currentColor`. No emoji anywhere: emoji are
not an icon system.

## Structure

- **Tab bar**, 5 top-level sections (Capture, Wardrobe, Mixer, Calendar,
  Stylist) — sections, never actions. Replaced the burger drawer, which was the
  app's biggest "ported from a website" tell.
- **Large titles** collapsing to an inline bar title on scroll, driven by an
  `IntersectionObserver` in `components/Screen.tsx`.
- **Sheets** (`components/Sheet.tsx`) for focused sub-tasks: settings, first-run
  body shape, picking an outfit for a day. Scrim tap and Escape both dismiss.
- **Inset grouped lists** for settings-shaped content.
- Bars span the window (`width: 100vw`); content stays in a 560px column.
- Safe-area insets on both bars; 44–48px minimum touch targets.

## Motion

Two authored moments, and no scattered third:

1. **The scan sweep** over the photo while the model reads it — the only motion
   that runs on its own.
2. **Softening at the scroll edges** (`.soften-at-edges`, on the wardrobe and
   saved-outfit grids). Both bars are translucent, so content slides *under*
   them and would otherwise hard-clip at the blur line; easing it out on arrival
   makes the bars read as glass over depth. Deliberately slight — this is list
   navigation, seen dozens of times a day, where motion earns its place only by
   being near-imperceptible.

   Built as a CSS scroll-driven animation (`animation-timeline: view()`), so it
   tracks the finger exactly and runs off the main thread. It animates the
   `scale` property rather than `transform`, leaving `transform` free for the
   tiles' own press feedback. Where the browser has no scroll timelines nothing
   animates and everything stays fully visible. Not applied to the calendar:
   blurring dates would obscure the task.

Everything else moves only in response to touch. Exponential ease-out
(`--ease-out`) from an already-visible default. `prefers-reduced-motion` cuts
every animation, turns the sheet rise into a fade, and disables the edge
softening entirely.

## Browser surfaces

Themed rather than left to the browser: `::selection`, `caret-color`,
`accent-color`, scrollbars, `:focus-visible` rings, underline offset.

## Known open items

- Cutout quality is upstream of design: garments extracted from a wide shot come
  through ragged. That is the extractor, not the surface.
- The mixer's body silhouette sits at 0.07 opacity on white; it reads as a faint
  impression and is close to the floor of visibility.
