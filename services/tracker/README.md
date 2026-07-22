# Tracker Service

Generic map tracker runtime used for both WR and leaderboard modes.

## Purpose

Tracker is map-focused and intentionally does not own project-specific club crawling.

- owns map metadata + map leaderboard/WR tracking state
- runs provider checks on tracked maps
- exposes map/tracker APIs
- optionally reports runs/checks to the aggregator

Project-specific club monitoring lives in project services (for example `services/altered`).

## Runtime Modes

Set `TRACKER_MODE`:

- `wr` (default): WR/top-1 focused polling and WR history/webhook behavior.
- `leaderboard`: top-N leaderboard snapshots (`TRACKER_LEADERBOARD_TOP_N`) with map top updates.

Both modes use the same API and can run as separate instances with different ports/DB files.

## Nadeo Provider Setup

Tracker supports real map WR checks via Nadeo Live leaderboards:

- Set `TRACKER_PROVIDER=nadeo-live`
- Configure auth:
  - `TRACKER_NADEO_AUTH_MODE=basic` + `TRACKER_NADEO_DEDI_LOGIN` + `TRACKER_NADEO_DEDI_PASSWORD`, or
  - `TRACKER_NADEO_AUTH_MODE=token` + `TRACKER_NADEO_LIVE_ACCESS_TOKEN` (and optional refresh token)
- Optional tuning:
  - `TRACKER_LIVE_GROUP_UID` (default `Personal_Best`)
  - `TRACKER_LIVE_ONLY_WORLD` (`1` for world-only WR checks)
  - `TRACKER_REQUEST_TIMEOUT_MS`
  - `TRACKER_MIN_REQUEST_GAP_MS`
  - `TRACKER_TOKEN_CACHE_FILE`

If provider auth is missing, tracker status returns `providerReady: false`.

## API

Public:

- `GET /api/v1/meta`
- `GET /api/v1/dashboard`
- `GET /api/v1/maps`
- `GET /api/v1/maps/tracked`
- `GET /api/v1/tracked/maps`
- `GET /api/v1/maps/info/:mapUid`
- `GET /api/v1/wr/latest`
- `GET /api/v1/leaderboard/latest`
- `GET /api/v1/tracker/status`
- `GET /api/v1/tracker/runs`

Admin:

- `GET /api/v1/admin/auth/status`
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/logout`
- `POST /api/v1/admin/maps/bulk-upsert`
- `POST /api/v1/admin/maps/:mapUid/tracking`
- `POST /api/v1/admin/tracker/run-now`

`bulk-upsert` is the primary integration point for project services to register/update maps.

## Admin Auth

Tracker admin auth is local and not tied to Ubisoft.

- API token auth: `TRACKER_ADMIN_TOKEN`
- Username/password login: `TRACKER_ADMIN_USERNAME` + `TRACKER_ADMIN_PASSWORD`
- Session cookie: `TRACKER_ADMIN_SESSION_COOKIE_NAME` (default `tracker_admin_session`)
- Session TTL: `TRACKER_ADMIN_SESSION_TTL_SECONDS` (default `43200`)
- Open mode toggle: `TRACKER_ADMIN_ALLOW_OPEN` (default `0`)

Behavior:

- If login credentials and/or token are configured, admin endpoints require auth.
- If neither is configured and `TRACKER_ADMIN_ALLOW_OPEN=0`, admin endpoints are unavailable until auth is configured.
- Set `TRACKER_ADMIN_ALLOW_OPEN=1` only for explicit local/dev fallback.
- Admin UI routes:
  - `/admin/login` for local sign-in
  - `/admin` protected dashboard (redirects to login when unauthenticated)

## Aggregator Federation

Tracker can push run/check telemetry to `services/aggregator`:

- `TRACKER_AGGREGATOR_ENABLED`
- `TRACKER_AGGREGATOR_BASE_URL` (for example, `http://127.0.0.1:<aggregator-port>/api/v1`)
- `TRACKER_AGGREGATOR_TOKEN` (optional; shared with `AGGREGATOR_INGEST_TOKEN`)
- `TRACKER_AGGREGATOR_PROJECT_KEY`
- `TRACKER_AGGREGATOR_PROJECT_NAME`
- `TRACKER_AGGREGATOR_SOURCE_LABEL`
- `TRACKER_AGGREGATOR_TIMEOUT_MS`
- `TRACKER_INSTANCE_ID`
- `TRACKER_INSTANCE_NAME`

On startup tracker sends:

- `POST /api/v1/ingest/instance/register`
- `POST /api/v1/ingest/instance/heartbeat`

After runs:

- `POST /api/v1/ingest/tracker-run`
- `POST /api/v1/ingest/instance/heartbeat`

## WR Webhook

Tracker can forward newly detected WR events directly to Altered:

- `TRACKER_WR_WEBHOOK_ENABLED`
- `TRACKER_WR_WEBHOOK_URL` (for example, `http://127.0.0.1:<altered-port>/api/v1/webhook/wr`)
- `TRACKER_WR_WEBHOOK_SECRET` (must match `ALTERED_WR_WEBHOOK_SECRET`)
- `TRACKER_WR_WEBHOOK_TIMEOUT_MS`

When enabled, each WR change is POSTed so downstream project UIs can update immediately.

## Local Wiring

`deploy/local/start-local.ps1` runs the tracker and its upstream services on the local ports defined in
`config/platform-manifest.json`. The current process names, modes, and ports are generated in
[`PLATFORM_CATALOG.md`](../../PLATFORM_CATALOG.md).

Default local DB:

- `sites/altered.xjk.yt/data/altered-tracker.sqlite`
