# Subdomain Workspace

Top-level site folders are organized by subdomain.

## Current Sites

- `sites/xjk.yt` - main site
- `sites/account.xjk.yt` - shared account center
- `sites/aggregator.xjk.yt` - public aggregator UI and API docs
- `sites/learn.xjk.yt` - learning/content site
- `sites/console.xjk.yt` - grouped console hub with Bingo under `/bingo/`
- `sites/altered.xjk.yt` - Altered community site
- `sites/validifier.xjk.yt` - public Validifier product site
- `sites/cotd.xjk.yt` - public COTD/TOTD style snapshot and archive site
- `sites/dash.xjk.yt` - private operational dashboard frontend
- `sites/plugins.xjk.yt` - plugins hub
- `sites/tools.xjk.yt` - tools hub and tool apps
- `sites/trackers.xjk.yt` - grouped tracker hub and runtime shells
- `sites/shared` - shared frontend assets, metadata, and runtime helpers

## Adding a New Site

1. Create `sites/<subdomain>/`.
2. Put app code in that folder.
3. Register the canonical site identity, host, frontend root, and visibility in `config/platform-manifest.json`.
4. Add presentation, search, redesign, and subway-map metadata to `sites/shared/xjk-core/site-registry.js` using the
   same site id.
5. Use `/shared/xjk-core/site-runtime.js` for cross-site links instead of adding a local route table.
6. If the site needs a backend, register that runtime in `config/platform-manifest.json` and add only its
   service-specific environment or executable policy to the keyed deployment overlays.
7. Add new static or proxy route ownership to `deploy/Caddyfile.routes`; both public Caddy entrypoints import that
   shared route file.
8. Run `npm run catalog:write`, then `npm run check`. The platform checks reject drift between the manifest, browser
   registry, local gateway, production process catalog, Caddy routes, Tools Hub catalog, and generated documentation.

Do not add service identity, launch path, or port data directly to `deploy/server/ecosystem.config.cjs`. The production
process skeleton is derived from the platform manifest and consumes keyed overlays only for policy that cannot be
expressed in the shared operational catalog.
