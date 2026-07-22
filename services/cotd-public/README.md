# cotd-public

Public Cup of the Day / Track of the Day style snapshot service for `cotd.xjk.yt`.

## Runtime

- Managed process identity and production/local ports: [`PLATFORM_CATALOG.md`](../../PLATFORM_CATALOG.md)
- Frontend: `sites/cotd.xjk.yt/frontend`
- Data dir: `sites/cotd.xjk.yt/data`
- SQLite DB: `sites/cotd.xjk.yt/data/cotd-public.sqlite`
- Map files: `sites/cotd.xjk.yt/data/maps`

SQLite stores TOTD days, Nadeo map info, downloaded GBX map files, classifier snapshots, and sync state. Move this to the shared aggregator only if COTD data needs to be reused across multiple services.

## Module boundaries

- `server.js` composes the service and starts it only when invoked as the process entrypoint.
- `src/runtime.js` constructs repository, upstream clients, and the bounded response cache.
- `src/cotdWorkflow.js` owns fetch/sync coordination and the single-flight fetch guard.
- `src/httpPolicy.js` owns admin authentication and public/private cache policy.
- `src/app.js` defines HTTP routes against injected runtime and workflow dependencies.
- `src/serverRuntime.js` owns listener and scheduler startup.

Run `npm run check` and `npm test` from this directory for service-local syntax and behavior checks.

## API

- `GET /api/v1/health`
- `GET /api/v1/today`
- `GET /api/v1/totd`
- `GET /api/v1/maps`
- `GET /api/v1/maps/:mapUid/file`
- `GET /api/v1/history`
- `POST /api/v1/admin/ingest`
- `POST /api/v1/admin/fetch-now`
- `POST /api/v1/admin/sync-totd`

All public responses use `{ ok, data }` and `{ ok:false, error:{ code, message } }`.

Anonymous list responses use a TTL/LRU cache bounded by `COTD_PUBLIC_CACHE_TTL_MS` and
`COTD_PUBLIC_CACHE_MAX_ENTRIES`; `COTD_PUBLIC_PAGINATION_MAX_OFFSET` caps offsets. Debug and authenticated admin
responses bypass that cache and send `Cache-Control: private, no-store`.

## TOTD Fetcher and Downloader

The service can sync Track of the Day months from Nadeo, enrich every returned map UID through Nadeo Core map info, and download the GBX file referenced by `fileUrl`:

- `COTD_TOTD_FETCH_ENABLED`
- `COTD_TOTD_FETCH_ON_START`
- `COTD_TOTD_FETCH_INTERVAL_MS`
- `COTD_TOTD_SYNC_MONTH_LENGTH`
- `COTD_TOTD_SYNC_MONTH_OFFSET`
- `COTD_TOTD_SYNC_ROYAL`
- `COTD_TOTD_DOWNLOAD_MAP_FILES`
- `COTD_NADEO_DEDI_LOGIN`
- `COTD_NADEO_DEDI_PASSWORD`
- `COTD_NADEO_SERVICES_TOKEN`
- `COTD_NADEO_LIVE_SERVICES_TOKEN`
- `COTD_NADEO_USER_AGENT`
- `COTD_AUTO_CLASSIFY_ENABLED`

`NadeoLiveServices` is used for `/api/token/campaign/month`; `NadeoServices` is used for `/maps/by-uid/` and map-file downloads. Without credentials, sync endpoints report `nadeo_not_configured` and the public API stays in demo/empty mode.

Default Nadeo user agent: `cotd.xjk.yt/1.0 (+https://xjk.yt/)`.

Raw classifier/source payloads remain hidden unless `COTD_ALLOW_DEBUG_RAW=1`, `COTD_ADMIN_TOKEN` is configured,
and the request supplies that admin token together with `?debug=1`. Missing admin configuration always fails closed.

Protected `POST /api/v1/admin/sync-totd` accepts JSON or query parameters:

```json
{ "length": 1, "offset": 0, "royal": false, "downloadFiles": true }
```

`POST /api/v1/admin/fetch-now` runs the default configured sync when Nadeo is configured, otherwise it falls back to the generic JSON source adapter.

## Classifier Adapter

The service does not own classifier training or COTD-specific classifier logic. It calls a generalized classifier through:

- `COTD_CLASSIFIER_BASE_URL`
- `COTD_CLASSIFIER_PATH`
- `COTD_CLASSIFIER_TOKEN`
- `COTD_CLASSIFIER_TIMEOUT_MS`

When no classifier is configured, `/api/v1/today` returns clearly marked demo data until real ingest is stored. Scheduled TOTD fetches do not use demo classifier results; they wait for classifier output or manual ingest.

## Development Ingest

Set `COTD_ADMIN_TOKEN`, then post a snapshot to `/api/v1/admin/ingest` with the token in `Authorization: Bearer <token>` or `X-COTD-Admin-Token`.

Local read-only development can omit this token; production preflight requires it so administrative routes cannot be deployed accidentally without protection.

Use protected `POST /api/v1/admin/fetch-now` to run the configured TOTD fetcher immediately during development.
