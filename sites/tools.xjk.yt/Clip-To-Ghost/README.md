# Clip-To-Ghost

Hosted frontend + backend wrapper for `ClipToGhost.exe`.

## Expected tool binary

- `tools/ClipToGhost.exe`

The site now expects the standalone self-contained build. The older framework-dependent bundle is no longer required.

The executable is restored from the checksum-pinned tool runtime release with `deploy/tool-runtime/restore-tool-runtime.ps1`; it is not committed here.

## Backend modules

- `backend/server.js` is the composition-only process entrypoint.
- `backend/src/runtime.js` owns paths, limits, uploads, and native runtime configuration.
- `backend/src/uploadStore.js` owns retained raw uploads, metadata containment, and cleanup.
- `backend/src/clipWorkflow.js` builds native commands and reads generated artifacts.
- `backend/src/app.js` defines the upload, inspect, and export HTTP routes.

Run `npm run check` and `npm test` from `backend` for service-local checks.

## HTTP API

- `GET /health`
- `POST /api/upload-map`
- `POST /api/inspect`
- `POST /api/export`

`/api/inspect` returns JSON describing discovered GPS clip candidates.
`/api/export` streams either a single `.Ghost.Gbx` or a zip containing exported ghosts and a manifest.

For ARL-style use, scan the map, choose a single candidate, and export with manifest output disabled so the response is one `.Ghost.Gbx` file.

`/api/upload-map` accepts a raw file body and returns an `uploadId` that can be reused by `/api/inspect` and `/api/export`.

When using JSON uploads (`mapBase64` + `mapFileName`), make sure the backend body limit is high enough for base64 overhead.
Relevant backend knobs:

- `MAX_FILE_MB`
- `JSON_LIMIT_MB`
- `UPLOAD_RETENTION_MS`
- `MAX_STORED_UPLOADS` (default `16`, hard ceiling `64`)
