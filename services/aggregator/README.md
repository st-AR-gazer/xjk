# Aggregator Service

Shared ingestion and query service for trackers and project portals.

Aggregator is the shared cache for:

- tracker run/check telemetry
- account display names
- club/campaign/upload structure snapshots
- project and instance metadata

## Environment

- `PORT` (default `3140`)
- `DATA_DIR` (default `./data`)
- `DB_FILE` (default `${DATA_DIR}/tracker-aggregator.sqlite`)
- `AGGREGATOR_INGEST_TOKEN` (optional token for ingest endpoints)

## API Endpoints

Health/meta:
- `GET /health`
- `GET /api/v1/meta`

Display names:
- `GET /api/v1/display-names`
- `GET /api/v1/display-names/candidates`

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
- `GET /api/v1/events/recent`
- `GET /api/v1/metrics/overview`
- `GET /api/v1/metrics/timeseries`

DB explorer:
- `GET /api/v1/db/tables`
- `GET /api/v1/db/tables/:table/schema`
- `GET /api/v1/db/tables/:table/rows`

Ingest:
- `POST /api/v1/ingest/tracker-run`
- `POST /api/v1/ingest/display-names`
- `POST /api/v1/ingest/club-snapshot`
- `POST /api/v1/ingest/instance/register`
- `POST /api/v1/ingest/instance/heartbeat`

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
