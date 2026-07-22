# COTD Public API v1

The COTD public service owns the stable contract for `cotd.xjk.yt` and Openplanet clients. Responses use the public envelope:

```json
{ "ok": true, "data": {} }
```

Errors use:

```json
{ "ok": false, "error": { "code": "invalid_request", "message": "Human readable message." } }
```

## Endpoints

- `GET /api/v1/health` - service, storage, classifier, and admin-ingest readiness.
- `GET /api/v1/today` - latest COTD snapshot, or clearly marked demo data when no ingest exists.
- `GET /api/v1/totd?limit=100&offset=0` - paged archive of stored Track of the Day map style snapshots.
- `GET /api/v1/maps?limit=100&offset=0` - alias for the TOTD archive.
- `GET /api/v1/maps/:mapUid/file` - downloaded GBX map file when available.
- `GET /api/v1/history?limit=30&offset=0` - paged latest/history snapshots.
- `POST /api/v1/admin/ingest` - protected development ingest. Requires `COTD_ADMIN_TOKEN` via `Authorization: Bearer <token>` or `X-COTD-Admin-Token`.
- `POST /api/v1/admin/fetch-now` - protected development trigger for the configured TOTD fetch source.
- `POST /api/v1/admin/sync-totd` - protected Nadeo month/map-info/map-file sync. Requires Nadeo credentials plus `COTD_ADMIN_TOKEN`.

## Today Snapshot

`GET /api/v1/today` returns:

```json
{
  "ok": true,
  "data": {
    "id": "2026-06-05:mapUid",
    "apiVersion": "v1",
    "source": "manual",
    "status": "classified",
    "cotd": {
      "cotdDate": "2026-06-05",
      "competitionId": "optional-upstream-id",
      "mapUid": "mapUid",
      "mapName": "Map name",
      "authorName": "Mapper",
      "authorAccountId": "optional-account-id",
      "thumbnailUrl": "https://example.invalid/current-cotd-map.jpg",
      "trackId": "optional-track-id",
      "startedAt": "2026-06-05T17:00:00.000Z",
      "endedAt": null
    },
    "rankedStyles": [{ "rank": 1, "style": "technical", "score": 0.82, "evidence": ["optional short note"] }],
    "confidence": { "score": 0.82, "label": "high" },
    "evidenceSummary": {
      "source": "manual",
      "recordCount": 10,
      "replayCount": 10,
      "signals": [{ "label": "Top 10", "value": "10 replay verdicts", "weight": null }],
      "notes": []
    },
    "classifier": {
      "mode": "manual",
      "provider": "trackmania-map-classifier",
      "model": "generalized-map-style",
      "version": null,
      "generatedAt": "2026-06-05T17:05:00.000Z",
      "baseUrlConfigured": false
    },
    "mapInfo": {
      "mapUid": "mapUid",
      "mapId": "optional-track-id",
      "name": "Map name",
      "filename": "Map.Map.Gbx",
      "thumbnailUrl": "https://core.trackmania.nadeo.live/maps/id/thumbnail.jpg",
      "fileUrl": "https://core.trackmania.nadeo.live/maps/id/file",
      "authorScore": 102399,
      "bronzeScore": 154000,
      "silverScore": 123000,
      "goldScore": 109000,
      "fetchedAt": "2026-06-05T17:05:00.000Z"
    },
    "mapFile": {
      "mapUid": "mapUid",
      "filename": "mapUid.Map.Gbx",
      "sha256": "hex",
      "sizeBytes": 1234567,
      "status": "downloaded",
      "downloaded": true,
      "downloadUrl": "/api/v1/maps/mapUid/file",
      "downloadedAt": "2026-06-05T17:05:00.000Z"
    },
    "records": [],
    "generatedAt": "2026-06-05T17:05:00.000Z",
    "updatedAt": "2026-06-05T17:05:00.000Z",
    "warnings": []
  }
}
```

`rankedStyles[].score` is normalized to `0..1`. `cotd.thumbnailUrl` is a real upstream/stored map image URL when available, or `null` while the service is waiting for live map metadata. Demo fallback data always has `source: "demo"`, `status: "demo"`, and warnings.

## Archive Page

`GET /api/v1/totd` and `GET /api/v1/maps` return:

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "limit": 100,
    "offset": 0
  }
}
```

Each `items[]` entry has the same snapshot shape as `/api/v1/today`. The archive is sorted newest TOTD date first. Public clients should paginate instead of assuming every historical map fits in a single response.

Fetched/synced maps without classifier output use `source: "totd-fetch"`, `status: "pending_classifier"`, an `unknown` zero-score style placeholder, and warnings that explain what is missing.

## Nadeo Sync

Official Nadeo sync stores:

- monthly TOTD day rows from `NadeoLiveServices` `/api/token/campaign/month`
- map info by UID from `NadeoServices` `/maps/by-uid/`
- downloaded GBX files from each map info `fileUrl`

`POST /api/v1/admin/sync-totd` accepts:

```json
{
  "length": 1,
  "offset": 0,
  "royal": false,
  "downloadFiles": true
}
```

The response is still enveloped and includes counts such as `daysStored`, `mapInfosStored`, `filesDownloaded`, and `fileDownloadErrors`.

## Raw Debug Gate

Stored `raw` or `debug` payloads are omitted by default. They are only returned when:

- `COTD_ALLOW_DEBUG_RAW=1`
- the request includes `?debug=1`
- `COTD_ADMIN_TOKEN` is configured and the request includes that valid admin token

Public plugin clients should not depend on raw/debug fields.

## Classifier Boundary

The service calls a generalized classifier through:

- `COTD_CLASSIFIER_BASE_URL`
- `COTD_CLASSIFIER_PATH`
- `COTD_CLASSIFIER_TOKEN`
- `COTD_CLASSIFIER_TIMEOUT_MS`

The classifier request body is generic map/evidence data. COTD-specific gathering and persistence stay in this service.

## TOTD Fetcher Boundary

The optional scheduler first uses official Nadeo sync when both audiences are configured. It can also read Track of the Day map metadata from a configured JSON source for development:

- `COTD_TOTD_FETCH_ENABLED`
- `COTD_TOTD_FETCH_INTERVAL_MS`
- `COTD_TOTD_SYNC_MONTH_LENGTH`
- `COTD_TOTD_DOWNLOAD_MAP_FILES`
- `COTD_NADEO_DEDI_LOGIN`
- `COTD_NADEO_DEDI_PASSWORD`
- `COTD_NADEO_SERVICES_TOKEN`
- `COTD_NADEO_LIVE_SERVICES_TOKEN`
- `COTD_NADEO_USER_AGENT`
- `COTD_TOTD_SOURCE_URL`
- `COTD_TOTD_SOURCE_TOKEN`
- `COTD_TOTD_SOURCE_TIMEOUT_MS`
- `COTD_AUTO_CLASSIFY_ENABLED`

The service stores returned map metadata, calls the generalized classifier when available, and records pending status when classifier output is not available.
