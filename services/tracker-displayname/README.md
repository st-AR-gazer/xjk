# Tracker Displayname Service

Dedicated tracker that resolves Trackmania account IDs to display names and writes results into `aggregator`.

## Purpose

- Read stale/missing account IDs from aggregator.
- Fetch display names from Trackmania OAuth API (`/api/display-names`).
- Ingest normalized name updates back into aggregator.

## API

- `GET /health`
- `GET /api/v1/status`
- `POST /api/v1/accounts/enqueue`
- `POST /api/v1/sync/run-now`
- `POST /api/v1/config`

## Required Environment

- `TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL`
- `UBI_OAUTH_CLIENT_ID`
- `UBI_OAUTH_CLIENT_SECRET`

Optional:

- `TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN`
- `TRACKER_DISPLAYNAME_SCHEDULER_ENABLED`
- `TRACKER_DISPLAYNAME_MAINTENANCE_INTERVAL_SECONDS` (default `60`)
- `TRACKER_DISPLAYNAME_STALE_AFTER_SECONDS`
- `TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS`

## Notes

This runtime is cache-first: it requests candidates from aggregator before calling upstream.
