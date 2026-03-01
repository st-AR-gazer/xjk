# Altered Service

Project service for `altered.xjk.yt`.

## Purpose

`services/altered` owns project-specific logic:

- project admin UI and workflows
- club monitoring and sync history for the Altered community
- map operations and naming queue
- tracker orchestration for Altered-managed maps

Tracker runtimes stay generic and reusable by other projects.

## Service Boundaries

- `services/altered` - project portal and project workflows
- `services/tracker` - map WR/top-N tracking runtime
- `services/tracker-displayname` - display-name tracking runtime
- `services/tracker-club` - club/campaign/upload ingest runtime
- `services/aggregator` - shared cache

## API Surface

Public:

- `GET /api/v1/dashboard`
- `GET /api/v1/latest-wr`
- `GET /api/v1/maps/info/:mapUid`
- `GET /api/v1/hook/altered`
- `GET /api/v1/hook/altered/maps`
- `GET /api/v1/hook/altered/runs`
- `GET /api/v1/tracker/status`
- `POST /api/v1/request-update`
- `POST /api/v1/webhook/wr` (shared-secret protected)

Admin:

- `POST /api/v1/admin/maps/:mapUid/campaign`
- `POST /api/v1/admin/maps/:mapUid/tracking`
- `POST /api/v1/admin/tracker/run-now`
- `POST /api/v1/admin/hook/altered/config`
- `POST /api/v1/admin/hook/altered/sync`
- `GET /api/v1/admin/hook/altered/live/status`
- `POST /api/v1/admin/hook/altered/live/monitor/config`
- `POST /api/v1/admin/hook/altered/live/monitor/run`
- `POST /api/v1/admin/hook/altered/live/monitor/run-discovery`
- `GET /api/v1/admin/hook/altered/live/mapper-sync/status`
- `POST /api/v1/admin/hook/altered/live/mapper-sync/config`
- `POST /api/v1/admin/hook/altered/live/mapper-sync/run`
- `POST /api/v1/admin/hook/altered/live/mapper-sync/accounts`
- `GET /api/v1/admin/naming/candidates`
- `POST /api/v1/admin/naming/process`
- `POST /api/v1/admin/naming/candidates/:mapUid/review`
- `GET /api/v1/admin/auth/allowlist`
- `POST /api/v1/admin/auth/allowlist`
- `POST /api/v1/admin/auth/allowlist/:adminUserId/active`

Ops module:

- `GET /api/v1/admin/ops/overview`
- `GET /api/v1/admin/ops/schema/mermaid`
- `POST /api/v1/admin/ops/users`
- `POST /api/v1/admin/ops/users/:userId/schedules`
- `POST /api/v1/admin/ops/users/:userId/maps`
- `POST /api/v1/admin/ops/scheduler/run-now`
- `POST /api/v1/admin/ops/bot/config`
- `GET /api/v1/admin/ops/bot/commands`

## Auth

Admin pages:

- `/admin/`
- `/admin/monitoring/`

Primary mode is Ubisoft OAuth with DB allowlist enforcement (`altered_admin_users`).
OAuth can be attempted by any user, but callback only succeeds for active allowlisted users.

Key OAuth env:

- `UBI_OAUTH_ENABLED`
- `UBI_OAUTH_CLIENT_ID`
- `UBI_OAUTH_CLIENT_SECRET`
- `UBI_OAUTH_AUTHORIZE_URL`
- `UBI_OAUTH_TOKEN_URL`
- `UBI_OAUTH_USERINFO_URL`
- `UBI_OAUTH_SCOPE`
- `UBI_OAUTH_CALLBACK_PATH`
- `ALTERED_SESSION_COOKIE_NAME`
- `ALTERED_SESSION_TTL_SECONDS`
- `ALTERED_OAUTH_STATE_TTL_SECONDS`
- `ALTERED_OAUTH_FALLBACK_LOCAL_ONLY`

## Integration Defaults

By default, Altered relays to tracker services:

- club snapshots -> `tracker-club`
- display-name sync -> `tracker-displayname`
- shared reads -> `aggregator`

Control flags:

- `ALTERED_TRACKER_CLUB_ENABLED`
- `ALTERED_TRACKER_CLUB_FALLBACK_LOCAL`
- `ALTERED_TRACKER_DISPLAYNAME_ENABLED`
- `ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL`

## Live Club Sync and Mapper Names

Live sync supports two cycles:

- full sync (daily)
- discovery sync (hourly)

For production sync, set service credentials (`ALTERED_LIVE_*`).
If missing, Altered can fall back to exchanging the logged-in Ubisoft session for a Nadeo token.

Mapper names are resolved via `https://api.trackmania.com/api/display-names` and persisted in:

- `altered_mapper_accounts`
- `altered_mapper_name_history`

Map rows also store denormalized name fields:

- `altered_maps.author_display_name`
- `altered_maps.submitter_display_name`

## Key Environment Variables

Core:

- `PORT`
- `FRONTEND_DIR`
- `DATA_DIR`
- `DB_FILE`

Tracker/Aggregator wiring:

- `TRACKER_PUBLIC_BASE_URL`
- `TRACKER_ADMIN_BASE_URL`
- `TRACKER_ADMIN_TOKEN`
- `TRACKER_LEADERBOARD_PUBLIC_BASE_URL`
- `TRACKER_LEADERBOARD_ADMIN_BASE_URL`
- `TRACKER_LEADERBOARD_ADMIN_TOKEN`
- `TRACKER_DISPLAYNAME_BASE_URL`
- `TRACKER_CLUB_BASE_URL`
- `AGGREGATOR_BASE_URL`
- `AGGREGATOR_TOKEN`

Full configuration reference: `services/altered/.env.example`.
