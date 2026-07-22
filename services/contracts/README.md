# Service Contracts

Interface contracts shared across service boundaries.

## Tracker Admin Map Sync

Used by project services to register/update maps in tracker:

- `POST /api/v1/admin/maps/bulk-upsert`
- `POST /api/v1/admin/maps/:mapUid/tracking`

## Tracker Runtime Control

Used by project services to request runtime checks:

- `POST /api/v1/admin/tracker/run-now`
- `GET /api/v1/tracker/status`
- `GET /api/v1/wr/latest`

## Aggregator Ingest (Leaderboard/Wr)

Used by tracker instances to report telemetry:

- `POST /api/v1/ingest/instance/register`
- `POST /api/v1/ingest/instance/heartbeat`
- `POST /api/v1/ingest/tracker-run`

## Aggregator Ingest (Displayname/Club)

Used by specialized trackers:

- `POST /api/v1/ingest/display-names`
- `POST /api/v1/ingest/display-names/arl`
- `POST /api/v1/ingest/club-snapshot`

## Aggregator Query

Used by portals/trackers/bots:

- `GET /api/v1/display-names`
- `GET /api/v1/display-names/by-name`
- `GET /api/v1/display-names/candidates`
- `GET /api/v1/clubs/:clubId/summary`
- `GET /api/v1/clubs/:clubId/campaigns`
- `GET /api/v1/clubs/:clubId/maps`
- `GET /api/v1/clubs/:clubId/members`

## COTD Public API

Used by `cotd.xjk.yt`, Openplanet clients, and development ingest tooling:

- `GET /api/v1/health`
- `GET /api/v1/today`
- `GET /api/v1/totd`
- `GET /api/v1/maps`
- `GET /api/v1/maps/:mapUid/file`
- `GET /api/v1/history`
- `POST /api/v1/admin/ingest`
- `POST /api/v1/admin/fetch-now`
- `POST /api/v1/admin/sync-totd`

Contract details: `services/contracts/cotd-public-v1.md`.

When splitting services into separate repos, keep these paths and payload shapes stable.
