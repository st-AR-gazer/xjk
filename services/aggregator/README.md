# Aggregator Service

Shared ingestion and query service for trackers and project portals.

Browser docs:

- `GET /api/`
- `GET /api/catalog.json`
- `GET /api/v1/catalog`

Aggregator is the shared cache for:

- tracker run/check telemetry
- account display names
- club/campaign/upload structure snapshots
- project and instance metadata

## Repository boundaries

`AggregatorRepository` is the stable public facade. Traffic storage is composed from explicit repositories under
`src/repositories/traffic/`:

- `TrafficIngestionRepository` validates and stores samples and performs legacy backfills.
- `TrafficQueryRepository` serves samples, facets, and observed-window metadata.
- `TrafficAnalyticsRepository` owns overview, timeseries, top, and error aggregations.
- `TrafficRepositorySupport` owns the shared query cache and backfill-state cache.

General database value helpers live under `src/repositories/support/`, while traffic normalization and SQL query
support remain in the traffic domain. `repositoryUtils.js` is a compatibility export surface for existing consumers;
new repository code imports the focused modules directly.

## Environment

- `PORT` (managed production/local values are generated in [`PLATFORM_CATALOG.md`](../../PLATFORM_CATALOG.md))
- `DATA_DIR` (default `./data`)
- `DB_FILE` (default `${DATA_DIR}/tracker-aggregator.sqlite`)
- `AGGREGATOR_INGEST_TOKEN` (required bearer/header secret for ingest endpoints)
- `DASH_ADMIN_TOKEN` (required bearer/header secret for private dashboard endpoints)
- `DASH_ALTERED_INTERNAL_TOKEN` (must match Altered's `ALTERED_INTERNAL_TOKEN` for dashboard control requests)
- `DASH_TRACKER_ADMIN_TOKEN` (must match `TRACKER_ADMIN_TOKEN` for tracker control requests)
- `AGGREGATOR_ALLOW_INSECURE_OPEN` (default `0`; set to `1` only for an isolated local stack)
- `ARL_OPENPLANET_AUTH_SECRET` (required for authenticated ARL display-name ingest)
- `OPENPLANET_AUTH_VALIDATE_URL` (default `https://openplanet.dev/api/auth/validate`)

Startup fails closed when either Aggregator secret is missing. The local launcher opts into the explicit insecure-open
mode; production configuration and CI reject that override. Credentials are accepted in headers, never in query
parameters that can leak through URLs and logs.

## Production backfills

The map-catalog and display-name backfills under `deploy/server/` share one CLI and path resolver. Database paths
are selected in this order: an explicit `--*-db=` argument, the matching `XJK_*_DB` environment variable, then
`XJK_ALTERED_DATA_ROOT` (or the repository's `sites/altered.xjk.yt/data` directory). Use `--dry-run` to inspect a
backfill without writing.

## API Endpoints

Health/meta:

- `GET /health`
- `GET /api/v1/meta`

Display names:

- `GET /api/v1/display-names`
- `POST /api/v1/display-names/resolve` (up to 500 account IDs)
- `GET /api/v1/display-names/resolve/:accountId`
- `GET /api/v1/display-names/by-name`
- `GET /api/v1/display-names/search`
- `GET /api/v1/display-names/candidates`
- `GET /api/v1/display-names/candidates/details`

Club data:

- `GET /api/v1/clubs/:clubId/summary`
- `GET /api/v1/clubs/:clubId/campaigns`
- `GET /api/v1/clubs/:clubId/maps`
- `GET /api/v1/clubs/:clubId/members`

Project/map views:

- `GET /api/v1/projects`
- `GET /api/v1/projects/:projectKey`
- `GET /api/v1/projects/:projectKey/maps`
- `GET /api/v1/projects/:projectKey/instances`
- `GET /api/v1/maps/:mapUid/projects`

Events/metrics:

- `GET /api/v1/events/facets`
- `GET /api/v1/events/recent`
- `GET /api/v1/queue/wr-baseline`
- `GET /api/v1/metrics/overview`
- `GET /api/v1/metrics/leaderboards/coverage`
- `GET /api/v1/metrics/timeseries`

DB explorer:

- `GET /api/v1/db/tables`
- `GET /api/v1/db/tables/:table/schema`
- `GET /api/v1/db/tables/:table/rows`

Ingest:

- `POST /api/v1/ingest/tracker-run`
- `POST /api/v1/ingest/tracker-runs`
- `POST /api/v1/ingest/display-names`
- `POST /api/v1/ingest/display-names/arl`
- `POST /api/v1/ingest/club-snapshot`
- `POST /api/v1/ingest/instance/register`
- `POST /api/v1/ingest/instance/heartbeat`
- `POST /api/v1/ingest/event`
- `POST /api/v1/ingest/events`
- `POST /api/v1/ingest/traffic`
- `POST /api/v1/ingest/traffic/batch`

## ARL Authenticated Display-name Ingest

`POST /api/v1/ingest/display-names/arl`

This route is intended for the Arbitrary Record Loader Openplanet plugin.

It requires:

- an Openplanet auth token in the request body (`opToken`)
- `ARL_OPENPLANET_AUTH_SECRET` configured on the server

The route validates the plugin token against Openplanet before passing normalized
display-name data into the shared aggregator store.

Display-name ingest rejects shared-cache artifacts such as `accountId`,
`zoneId`, `groupUid`, `mapId`, `mapUid`, `seasonId`, personal-best labels, and
known platform labels. Rejected rows are reported in the ingest response and are
not stored.

## Ingest Payload Shape

```json
{
  "projectKey": "altered-prod-1",
  "projectName": "Altered Nadeo Production",
  "sourceLabel": "altered",
  "run": {
    "provider": "nadeo-live",
    "reason": "scheduled",
    "startedAt": "2026-02-23T10:00:00.000Z",
    "finishedAt": "2026-02-23T10:00:05.000Z",
    "mapsConsidered": 25,
    "mapsChecked": 25,
    "wrChanges": 2
  },
  "checks": [
    {
      "mapUid": "abc123",
      "mapName": "My Map",
      "checkedAt": "2026-02-23T10:00:02.000Z",
      "changed": true,
      "oldWrTime": 65234,
      "newWrTime": 65180,
      "oldHolder": "Old",
      "newHolder": "New",
      "source": "nadeo-live",
      "note": "checked"
    }
  ]
}
```
