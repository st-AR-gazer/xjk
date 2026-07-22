# xjk-core

Small, design-neutral frontend primitives shared by the xjk sites.

## Purpose

- Keep canonical site metadata in one place.
- Resolve production, `*.localhost`, and `localhost/path` links consistently.
- Give the home subway-map UI a single data source for stations, lines, colors, labels, search keywords, and generated ring order.
- Keep redesign scope explicit without forcing a shared visual shell.

## Files

- `site-registry.js` - canonical list of xjk sites and their redesign-ready metadata.
- `site-runtime.js` - URL resolution, host lookup, link application, and account-widget loading helpers.
- `site-base.js` - synchronous base-path setup for SPAs that support both direct deep links and localhost path mode.
- `dom-utils.js` - shared escaping, navigation sanitization, text updates, paint scheduling, site de-duplication,
  shortcut-label, and safe-color helpers.
- `formatters.js` - design-neutral number, byte-size, and percentage formatting shared by operational dashboards.
- `safe-html.js` - the only reviewed parsed-HTML boundary; it strips executable elements, event attributes, unsafe
  URL/style values, and protects links opened in a new tab.
- `surface-foundation.css` - opt-in reset, surface variables, and common hub chrome primitives; link it before local
  visual styles so each site keeps ownership of its accent and layout.
- `chrome-config.js` - shared page context, accent, topbar copy, and sidenav section configuration.
- `search-engine.js` - dependency-free normalization, fuzzy scoring, and result ranking.
- `global-search.js` / `global-search.css` - the stable Ctrl/Cmd+K palette entry and styling.
- `global-search/` - focused search model, page/index sources, palette view, and controller modules.
- `topbar.js` / `topbar.css` - the canonical topbar renderer with one context search owner and one account slot.
- `topbar-loader.js` - the top-frame-only topbar, search, and account bootstrap.
- `sidenav.js` / `sidenav.css` - the canonical desktop and mobile sidenav renderer.
- `sidenav-boot.js` - the top-frame-only sidenav bootstrap.
- `search-index.json` - generated public index of services, destinations, tools, plugins, Learn content, and archive games.

## Redesign Scope

`redesign.scope` is the source of truth for visual rewrite eligibility.

- `included` - part of the shared subway-map/front-end design system.
- `excluded` - keep the current visual system; shared routing/auth hygiene can still apply.
- `internal` - private/admin surfaces, hidden from public redesign queues by default.

Altered remains excluded from page-content redesigns. The platform topbar and sidenav are navigation chrome, so they intentionally wrap Altered without changing its content identity.

## Subway Map Metadata

Each site has `map.line` and `map.order`. The line groups the station in the transit system; the order gives the generated layout a stable ring sequence. Every eligible destination is connected directly to xjk, so the registry intentionally does not encode arbitrary station-to-station edges or manual grid coordinates.
Use `getMapSites()` when a UI needs the public station set; pass `{ includeInternal: true }` only for private/admin views. The home renderer owns automatic coordinates, collision avoidance, and the direct-xjk spoke geometry.

## Migration Rule

New or cleaned pages should import routing helpers from `/shared/xjk-core/site-runtime.js` instead of hard-coding xjk hostnames or local routing tables. The shared topbar loader owns search and account-widget startup.

Example:

```js
import { applySiteLinks } from "/shared/xjk-core/site-runtime.js";

applySiteLinks();
```

```html
<a data-xjk-site-link="learn" href="https://learn.xjk.yt/">Learn</a>
```

Legacy pages that already use `data-link="main"` or `data-link="trackers"` can call `applySiteDataLinks()` while they wait for a markup cleanup pass.

## Safe Rendering

Prefer DOM construction and `textContent` for data-only output. When a component intentionally renders a markup
template, load `safe-html.js` and call `globalThis.XjkSafeHtml.set(container, markup)`. Direct `innerHTML`,
`outerHTML`, `insertAdjacentHTML`, and `document.write` calls are rejected by ESLint and the frontend hygiene check;
`safe-html.js` contains the sole parser sink.

## Global Search

The topbar loader mounts the global search palette explicitly after it renders the canonical search trigger. `loadAccountWidgetScript()` now loads only the account widget, and `loadGlobalSearch()` loads only search.

`global-search.js` is the public browser facade and preserves `mountGlobalSearch()`, `window.XjkSearch`, the queued
registration contract, and the `xjk-search-ready` event. Search ranking and grouping belong in `global-search/model.js`;
page and index candidates in `sources.js`; DOM construction in `view.js`; lifecycle, providers, and public API wiring in
`controller.js`.

## Global Topbar

Every top-level frontend page loads `/shared/xjk-core/topbar-loader.js` and `/shared/xjk-core/sidenav-boot.js` exactly once. The renderers share page context and accent values from `chrome-config.js`, but remain independent imports. Tracker runtime iframe documents load neither and delegate platform chrome to their parent shell.

The topbar always renders exactly one shared context-search trigger and one shared account slot. Page-specific filters or admin actions are preserved in a secondary page toolbar instead of becoming a second platform topbar. Pages add searchable destinations through the global search registration API rather than creating another palette or Ctrl/Cmd+K owner.

The topbar is also the sole owner of the xjk home identity. The sidenav starts directly with page sections or the configured xjk network group so it never duplicates the topbar mark or reserves an empty header row.

Pages that need an immersive entrance can opt into `chrome.revealOnScroll` in `chrome-config.js`. The shared visibility controller then reveals both independent chrome components together after the configured scroll offset; other pages retain the normal always-visible behavior.

Do not add page-owned `data-xjk-search-trigger` controls. `data-xjk-topbar-local-search` is a migration marker that tells the renderer to discard an obsolete legacy search; it is not an opt-in for a second search. Embedded runtime documents delegate the topbar to their parent shell and must not load either chrome renderer.

Dynamic pages can register safe local destinations or actions after the palette loads:

```js
window.addEventListener("xjk-search-ready", ({ detail: search }) => {
  search.register(
    [
      {
        id: "validifier:recent-filter",
        kind: "destination",
        title: "Recent items",
        description: "Open the recent-items view.",
        siteId: "validifier",
        path: "/recent",
        keywords: ["recent", "history"],
      },
    ],
    { source: "validifier-live" }
  );
});
```

Use `registerProvider(id, async ({ query, signal }) => results)` for live query providers. Public indexed content belongs in its canonical source file; rebuild the checked-in index instead of duplicating it by hand:

```sh
node scripts/build-global-search-index.mjs
node scripts/check-global-search.mjs
```

The public index must never contain admin or private routes. Runtime destinations store `siteId` plus `path`, `query`, and `hash`, so `resolveSiteHref()` keeps production, localhost subdomains, and localhost path mode aligned.

## Validation

Run these after frontend cleanup work:

```sh
node scripts/check-site-core.mjs
node scripts/check-frontend-hygiene.mjs
node scripts/check-global-search.mjs
```

`check-global-search` verifies that the generated index matches its canonical sources, contains only unique public destinations, and passes ranking smoke tests. `check-site-core` checks registry uniqueness, host aliases, local aliases, public hrefs, shared asset modes, redesign scope, generated subway-map metadata, Caddy coverage, and local-gateway coverage. `check-map-layout` enforces one direct xjk spoke per eligible station. `check-frontend-hygiene` catches the old duplicated route-table and direct account-widget patterns.
