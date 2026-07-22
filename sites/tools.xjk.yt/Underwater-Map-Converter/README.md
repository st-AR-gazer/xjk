# Underwater-Map-Converter

Frontend + backend wrapper for `UnderwaterMapConverter.exe`.

## Expected tool binary

- `tools/UnderwaterMapConverter.exe`

The standalone executable is restored from the checksum-pinned tool runtime release with `deploy/tool-runtime/restore-tool-runtime.ps1`; it is not committed here. A separate `UnderwaterMapConverter.dll` is not required at runtime.

## Backend modules

- `backend/server.js` composes the app and starts maintenance only for the live process.
- `backend/src/runtime.js` owns paths, limits, uploads, and native runtime configuration.
- `backend/src/options.js` validates conversion options and output names.
- `backend/src/singleConversion.js` implements the synchronous conversion endpoint.
- `backend/src/batchJobs.js` owns durable batch state, processing, downloads, and retention.
- `backend/src/app.js` assembles the HTTP surface.

Run `npm run check` and `npm test` from `backend` for service-local checks.

## Public runtime limits

Underwater jobs fail fast with `503` when the backend already has two active jobs or the same client has one. Batch
requests accept at most six files, 24 MB per file, and 64 MB combined by default. `TOOL_MAX_ACTIVE_JOBS`,
`TOOL_MAX_ACTIVE_JOBS_PER_CLIENT`, `MAX_FILE_COUNT`, `MAX_FILE_MB`, and `MAX_UPLOAD_MB` provide bounded deployment
overrides. Batch submissions are limited to six per five minutes per client, and completed job artifacts expire after
one hour unless `JOB_TTL_MS` is configured. At most 12 job directories are retained by default, controlled by the
bounded `MAX_STORED_JOBS` override, and a downloaded result is removed after the response completes unless
`KEEP_FILES=true`.
