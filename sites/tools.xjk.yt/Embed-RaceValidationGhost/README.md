# Trackmania Validation Ghost Embed Website

Web app to embed a selected validation ghost into a map by combining:

- `tools/EmbedRaceValidationGhost.exe`
- `tools/ReplayDataExtractor.exe`

Both executables are restored from the checksum-pinned tool runtime release with `deploy/tool-runtime/restore-tool-runtime.ps1`; they are not committed here.

## What It Does

- Select one map (`.Map.Gbx` / `.Gbx`)
- Select one source file (`.Ghost.Gbx` / `.Replay.Gbx` / `.Gbx`)
- If source is replay (`.Replay.Gbx`), the replay is uploaded temporarily and inspected immediately so ghost metadata can be shown
- Replay inspection upload is deleted right after extraction
- Files are only uploaded/stored for real when the user presses the embed button
- If source is replay:
  - extracts replay metadata
  - lists available ghosts with per-ghost details
  - lets user choose ghost index to embed
- Calls embed EXE with `--ghost-index <n>` when replay is used
- Downloads embedded map
- When `KEEP_FILES=true`, stores processed artifacts in:
  - `data/processed/maps`
  - `data/processed/ghosts`
  - `data/processed/replays`

## Project Layout

- `backend/server.js` - composition-only process entrypoint
- `backend/src/runtime.js` - paths, uploads, and native executable configuration
- `backend/src/replayInspection.js` - replay extractor workflow and response normalization
- `backend/src/fileNames.js` - retained artifact and download naming
- `backend/src/app.js` - inspection and embed HTTP routes
- `frontend/index.html` - UI
- `frontend/styles.css` - visual design
- `frontend/app.js` - replay auto-inspection + manual upload/embed flow
- `data/` - temporary uploads and optional retained processed files

Run `npm run check` and `npm test` from `backend` for service-local checks.

## Run Locally

1. Install dependencies:

```powershell
cd backend
npm install
```

2. Start server:

```powershell
npm start
```

3. Open:

`http://127.0.0.1:3000`

## Environment Variables (Optional)

- `PORT` default: `3000`
- `TOOL_PATH` default: `../tools/EmbedRaceValidationGhost.exe`
- `REPLAY_EXTRACT_TOOL_PATH` default: `../tools/ReplayDataExtractor.exe`
- `GBXLZO_PATH` default: empty (tool auto-discovery)
- `MAX_FILE_MB` default: `64`
- `MAX_UPLOAD_MB` default: `96` across all files in a request
- `TOOL_TIMEOUT_MS` default: `180000`
- `TOOL_MAX_ACTIVE_JOBS` default: `4`
- `TOOL_MAX_ACTIVE_JOBS_PER_CLIENT` default: `2`
- `TOOL_MAX_OUTPUT_MB` default: `8` across captured stdout and stderr
- `EXTRACT_TIMEOUT_MS` default: `180000`
- `KEEP_FILES` default: `false`
- `UPLOAD_DIR` default: `../data/uploads`
- `OUTPUT_DIR` default: `../data/processed`
- `FRONTEND_DIR` default: `../frontend`

## Notes

- If embedding fails with a `gbxlzo` error, set `GBXLZO_PATH` to your `gbxlzo.exe`.
- If replay analysis fails, verify `REPLAY_EXTRACT_TOOL_PATH`.
- Server binds to `127.0.0.1`. Put Nginx/Caddy in front if you host publicly.
