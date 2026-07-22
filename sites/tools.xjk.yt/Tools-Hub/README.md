# Trackmania Tool Hub

Hub site for listing and launching Trackmania tools.

## Layout

- `backend/server.js` - Express API + static frontend host
- `backend/package.json` - backend dependencies and start script
- `frontend/index.html` - hub UI
- `frontend/styles.css` - hub styles
- `frontend/app.js` - frontend logic (calls `/api/tools`)
- `data/tools.json` - generated tool catalog consumed by the hub

## Behavior

- Serves the UI at `/`
- Exposes `GET /api/tools`
- Reads generated tool definitions from `data/tools.json`
- Fails startup when the generated catalog is missing or invalid, so deployment cannot silently publish a stale list
- Individual tool pages can expose their own embedded docs tabs

## Run Local

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

## Optional Environment Variables

- `PORT` default: `3000`
- `FRONTEND_DIR` default: `../frontend`
- `DATA_DIR` default: `../data`
- `TOOLS_FILE` default: `../data/tools.json`

## Add a Tool

Add the tool once under `tools` in `config/platform-manifest.json`, including its service association and catalog
metadata. Then run `npm run catalog:write`; this regenerates both `data/tools.json` and `PLATFORM_CATALOG.md`.

The manifest entry has this shape:

```json
{
  "id": "your-tool-id",
  "name": "Your Tool Name",
  "description": "What this tool does.",
  "category": "Category Name",
  "status": "live",
  "input": "Expected input",
  "output": "Produced output",
  "path": "Your-Tool-Directory",
  "serviceId": "tools-your-tool",
  "listed": true,
  "tone": "cool"
}
```

`status` values:

- `live`
- any other value is treated as `soon`

`tone` values:

- `cool`
- `warm`
