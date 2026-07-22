# Services

Backend services for the Trackmania stack.

## Runtime Services

- `altered` (`community-portal`) - project-facing portal/admin workflows
- `xjk-auth` - shared account, session, and platform authentication runtime
- `learn-profile` - Learn profile and authenticated progress APIs
- `console-hub` - Console room and game-mode APIs
- `bannerbuilder` - Altered banner rendering and persistence API
- `tracker` (`tracker-wr` + `tracker-leaderboard`) - map tracking runtime
- `tracker-displayname` - account display-name tracker
- `tracker-club` - club/campaign/upload ingest tracker
- `aggregator` - shared cache API
- `validifier-public` - canonical public Validifier website and API
- `cotd-public` - public COTD/TOTD style snapshot and archive API for plugin and site clients

The generated process/port/health inventory is `PLATFORM_CATALOG.md`. Its canonical source is
`config/platform-manifest.json`; this page describes responsibilities rather than duplicating the operations catalog.

## Supporting Docs

- `services/ARCHITECTURE.md` - service boundaries and ownership
- `services/contracts/README.md` - shared contracts
- `services/split/README.md` - standalone service export helper
- `README.md` and `SETUP.md` - repository quality, local setup, and deployment workflows
