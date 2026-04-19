# Clip-To-Ghost

Hosted frontend + backend wrapper for `ClipToGhost.exe`.

## Expected tool binary

- `tools/ClipToGhost.exe`

The site now expects the standalone self-contained build. The older framework-dependent bundle is no longer required.

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
