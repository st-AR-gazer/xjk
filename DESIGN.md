---
version: alpha
name: xjk Subway
description: Dark transit-map design language shared by the public xjk.yt Trackmania network.
colors:
  background: "#020406"
  surface: "#05080b"
  surface-veil: "rgba(5, 8, 11, 0.76)"
  control: "rgba(0, 0, 0, 0.58)"
  border-subtle: "rgba(255, 255, 255, 0.11)"
  border-medium: "rgba(255, 255, 255, 0.2)"
  text: "#f2f2f2"
  text-muted: "#a8a8a8"
  text-dim: "#72777c"
  primary: "#e5e7eb"
  accent: "#e5e7eb"
  accent-soft: "rgba(229, 231, 235, 0.12)"
  danger: "#ff5f57"
  success: "#70d85f"
  line-core: "#e5e7eb"
  line-data: "#ef4444"
  line-creation: "#f97316"
  line-learning: "#38bdf8"
  line-community: "#60a5fa"
  line-console: "#9aec35"
  line-utilities: "#a855f7"
typography:
  display:
    fontFamily: Inter
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0.1em
  title:
    fontFamily: IBM Plex Sans Condensed
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: IBM Plex Sans Condensed
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: IBM Plex Sans Condensed
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
  mono:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1
  mono-micro:
    fontFamily: Space Mono
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.06em
rounded:
  sm: 3px
  DEFAULT: 4px
  md: 5px
  lg: 9px
  full: 9999px
spacing:
  gap-xs: 8px
  gap-sm: 12px
  card-gap: 14px
  panel-pad: 18px
  page-pad: 22px
components:
  panel:
    backgroundColor: "{colors.surface-veil}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "{spacing.panel-pad}"
  control:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.DEFAULT}"
    height: 32px
  control-hover:
    backgroundColor: "rgba(255, 255, 255, 0.055)"
  button-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.DEFAULT}"
    height: 32px
    padding: 0 12px
  kbd:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.text-muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: 2px 5px
  micro-label:
    textColor: "{colors.text-dim}"
    typography: "{typography.mono-micro}"
  sidenav:
    backgroundColor: "linear-gradient(180deg, rgba(10, 12, 14, 0.97), rgba(4, 5, 7, 0.97))"
    textColor: "#e8eaed"
    width: 232px
  station-dot:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 8px
  status-led-ok:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.full}"
    size: 8px
  status-led-danger:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.full}"
    size: 8px
---

# xjk Subway

## Overview

xjk.yt is a network of small Trackmania tools and services presented as one
transit system. Every public site is a "station" on one of seven colored
"lines" (Core, Data, Creation, Learning, Community, Console, Utilities), and
the shared side navigation draws the line running through the current page.
The mood is a night-time metro control room: near-black, quiet, precise, a
little industrial. Color is scarce and always means something — it identifies
a line or reports a status. The audience is Trackmania players and mappers who
use these tools repeatedly, so density and keyboard affordance beat visual
flourish.

The canonical machine sources for this identity are
`sites/shared/xjk-core/site-registry.js` (line families, per-site accents,
subway-map metadata) and the CSS custom properties in each redesigned site's
stylesheet (`--bg-main`, `--bg-panel`, `--text-main`, `--accent`, ...). A
line color is the shared transit-family reference and legend color. A site's
`accent` is the station, spoke, and shared-chrome color actually rendered for
that destination; it may intentionally differ from its line color to preserve
the site's identity. The tokens above mirror those values; if they ever
disagree, the registry and the shipped CSS win.

## Colors

The base world is monochrome. `background` (#020406) is effectively black
with a faint blue undertone; panels sit on it as translucent veils
(`surface-veil`) over subtle radial-gradient vignettes rather than as solid
cards. Structure comes from 1px white-alpha borders (`border-subtle` for
resting state, `border-medium` for hover/focus), never from fills.

Text has three fixed steps: `text` for content, `text-muted` for secondary
copy, `text-dim` for chrome and micro-labels.

Chromatic color enters only two ways:

1. **Transit and site accents.** `SITE_LINES[line].color` identifies a
   station's transit family. `site.accent` identifies the individual station
   and is the value exposed to shared chrome as `--xjk-accent`; many sites use
   their line color, while intentionally distinct products may use their own.
   Accents are
   used at low intensity — 3px rails, 1px borders at ~45% mix, tinted fills
   at ~7–12% (`accent-soft`) — never as large filled areas. The default
   `accent` (#e5e7eb) is the Core line's off-white; `primary` is the same
   value when a page does not define a distinct content-level token.
2. **Status.** `success` (#70d85f) and `danger` (#ff5f57) only, for
   ok/error states.

## Typography

Two voices:

- **Condensed sans for content.** "IBM Plex Sans Condensed", falling back to
  "Roboto Condensed", Inter, then system-ui. Body is 16px / 1.45. Headings
  stay in the same family at weight 500; only hero displays switch to Inter
  700 with wide 0.1em tracking (see `display`).
- **Monospace for chrome.** "Space Mono" (fallback ui-monospace) at 10–13px
  for wayfinding: keyboard hints, station codes, timestamps, badges, and
  uppercase micro-labels with 0.06em letter-spacing.

There is no fluid type scale beyond the hero clamp; UI text uses the fixed
steps in the tokens.

## Layout

Pages are app-like shells, not documents: a fixed shared sidenav on the left
(232px expanded, 68px collapsed, body offset via `--xjk-sidenav-w`), a sparse
fixed topbar, and a content area that manages its own scrolling. Spacing is
compact — 8/12px gaps inside clusters, 14px between cards, 18px panel
padding, 22px page gutters. There is no strict 8px grid; favor these known
steps over inventing new ones. Density is a feature: these are tools, and
information per screen matters more than whitespace.

## Elevation & Depth

Depth comes from translucency and light, not shadows. The stack is:
background vignettes (fixed radial gradients at 2–4% white) → translucent
panels with `backdrop-filter: blur(...)` → 1px borders that brighten on
interaction. Box-shadows are rare and soft when they exist at all. Never use
drop shadows to separate content; brighten the border or the fill by a few
percent instead.

## Shapes

Corners are tight and technical: 3px for keycaps, 4px for controls, 5px for
panels and cards, 9px for brand marks. `full` rounding is reserved for
transit metaphors — station dots, avatars, status LEDs. No pill buttons, no
large soft radii. Hairline elements (rails, connector lines, underlines) are
1–3px rectangles.

## Components

- **Panel** — translucent veil over the background, 1px `border-subtle`,
  18px padding. Solid `surface` only where blur is unavailable or content
  must be opaque.
- **Control / input / button** — 32px tall, dark translucent fill, 1px
  border, 4px radius. Hover/focus brightens border to `border-medium` and
  adds a faint white fill; focus-visible gets a 1px `accent` outline offset
  3px. Primary actions may tint with `accent-soft`; there is no heavy filled
  primary button in this system.
- **Sidenav** — the transit spine: vertical gradient surface, a 3px accent
  rail on the left edge fading downward, a 2px white-alpha line connecting
  station entries, and no duplicate brand mark. The topbar is the sole owner
  of the xjk identity.
- **Search trigger / kbd** — Space Mono 11px, bordered chips; the global
  Ctrl/Cmd+K palette follows the same panel + border language
  (`--xjk-search-*` variables in `sites/shared/xjk-core/global-search.css`).
- **Micro-labels** — uppercase Space Mono 10px in `text-dim` for section
  eyebrows, badges, and metadata.

## Do's and Don'ts

- **Do** take the accent from the site registry / `--xjk-accent`. **Don't**
  hard-code another line's hex into a page.
- **Do** keep pages working in localhost path mode (`localhost:8080/<site>`):
  relative asset and API paths only; `/shared/xjk-core/...` is the single
  allowed absolute path.
- **Don't** apply this system to altered.xjk.yt — Altered is explicitly
  excluded from the redesign (`redesign.scope: excluded`) and keeps its own
  visual identity.
- **Don't** introduce a light theme, colored page backgrounds, or gradients
  in brand colors. Color stays confined to accents and status.
- **Don't** reach for box-shadows, large radii, or pill shapes; separate
  surfaces with borders and translucency.
- **Do** use Space Mono for chrome only. **Don't** set body copy or
  paragraphs in monospace.
- **Do** keep controls at 32px height and radii at the 3/4/5/9px steps;
  don't invent intermediate values.
