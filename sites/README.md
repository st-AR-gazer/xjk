# Subdomain Workspace

Top-level site folders are organized by subdomain.

## Current Sites

- `sites/xjk.yt` - main site
- `sites/learn.xjk.yt` - learning/content site
- `sites/altered.xjk.yt` - Altered community site
- `sites/plugins.xjk.yt` - plugins hub
- `sites/tools.xjk.yt` - tools hub and tool apps

## Adding a New Site

1. Create `sites/<subdomain>/`.
2. Put app code in that folder.
3. Add reverse-proxy/static routing in `deploy/Caddyfile`.
4. If needed, add a process entry in `deploy/server/ecosystem.config.cjs`.
