# Trackmania Tool Hub

Hub site for listing and launching Trackmania tools.

## Layout

- `backend/server.js` - Express API + static frontend host
- `backend/package.json` - backend dependencies and start script
- `frontend/index.html` - hub UI
- `frontend/styles.css` - hub styles
- `frontend/app.js` - frontend logic (calls `/api/tools`)
- `data/tools.json` - tool catalog used by the hub

## Behavior

- Serves the UI at `/`
- Exposes `GET /api/tools`
- Reads tool definitions from `data/tools.json`
- Uses built-in defaults if `tools.json` is missing or invalid

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

Add an object in `data/tools.json` with this shape:

```json
{
  "id": "your-tool-id",
  "name": "Your Tool Name",
  "description": "What this tool does.",
  "category": "Category Name",
  "status": "live",
  "input": "Expected input",
  "output": "Produced output",
  "link": "URL or path to open",
  "source": "URL or path to source",
  "tone": "cool"
}
```

`status` values:
- `live`
- any other value is treated as `soon`

`tone` values:
- `cool`
- `warm`
