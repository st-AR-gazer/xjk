# tools.xjk.yt Workspace

This directory contains everything that belongs to the `tools.xjk.yt` subdomain.

## Structure

- `Tools-Hub` -> served at `https://tools.xjk.yt/`
- `Strip-RaceValidationGhost` -> served at `https://tools.xjk.yt/Strip-RaceValidationGhost/`
- `Embed-RaceValidationGhost` -> served at `https://tools.xjk.yt/Embed-RaceValidationGhost/`
- `Embedded-Blocks-And-Items-Checker` -> served at `https://tools.xjk.yt/Embedded-Blocks-And-Items-Checker/`
- `Extract-Replay-Data` -> served at `https://tools.xjk.yt/Extract-Replay-Data/`
- `Gbx-Medal-Time-Modifier` -> served at `https://tools.xjk.yt/Gbx-Medal-Time-Modifier/`
- `Map-Validation-Checker` -> served at `https://tools.xjk.yt/Map-Validation-Checker/`

## Naming Convention

- Each tool website folder should use: `<ToolName>`
- Keep names descriptive and hyphenated.

## Adding a New Tool

1. Create folder: `<ToolName>`
2. Reuse standard layout:
   - `backend/`
   - `frontend/`
   - `data/`
   - `tools/`
3. Add an entry to `Tools-Hub/data/tools.json`
4. Wire routes in:
   - `deploy/Caddyfile`
   - `deploy/server/ecosystem.config.cjs`
   - `deploy/local/start-local.ps1`
   - `deploy/local/local-gateway.js`
5. Set tool link to: `https://tools.xjk.yt/<ToolName>/`
