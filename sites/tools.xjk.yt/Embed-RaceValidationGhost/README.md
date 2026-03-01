# Trackmania Validation Ghost Embed Website

Web app to embed a selected validation ghost into a map by combining:

- `tools/EmbedRaceValidationGhost.exe`
- `tools/ReplayDataExtractor.exe`

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
- Stores processed artifacts in:
  - `data/processed/maps`
  - `data/processed/ghosts`
  - `data/processed/replays`

## Project Layout

- `backend/server.js` - API server + replay inspection + embed execution
- `frontend/index.html` - UI
- `frontend/styles.css` - visual design
- `frontend/app.js` - replay auto-inspection + manual upload/embed flow
- `data/` - uploads and processed files

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
- `MAX_FILE_MB` default: `128`
- `TOOL_TIMEOUT_MS` default: `180000`
- `EXTRACT_TIMEOUT_MS` default: `180000`
- `KEEP_FILES` default: `false`
- `UPLOAD_DIR` default: `../data/uploads`
- `OUTPUT_DIR` default: `../data/processed`
- `FRONTEND_DIR` default: `../frontend`

## Notes

- If embedding fails with a `gbxlzo` error, set `GBXLZO_PATH` to your `gbxlzo.exe`.
- If replay analysis fails, verify `REPLAY_EXTRACT_TOOL_PATH`.
- Server binds to `127.0.0.1`. Put Nginx/Caddy in front if you host publicly.
