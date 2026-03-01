# Trackmania Plugin Hub

Custom frontend for the Openplanet profile plugin list.

## Structure

- `backend/server.js` - Express server (API + static frontend hosting)
- `backend/package.json` - backend dependencies and start script
- `frontend/index.html` - hub UI
- `frontend/styles.css` - hub styling
- `frontend/app.js` - frontend logic (fetches `/api/plugins`)

## What It Does

- Serves the hub UI from `/`
- Exposes `GET /api/plugins` for the plugin catalog
- Fetches plugin cards directly from Openplanet profile pages
- Walks pagination automatically (`?page=2`, `?page=3`, ...)
- Returns normalized plugin data to the custom UI
- Extracts muted highlight/button palettes from plugin card images
- Caches results in memory for a short TTL to avoid over-fetching

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
- `FRONTEND_DIR` default: `../frontend`
- `OPENPLANET_PROFILE_URL` default: `https://openplanet.dev/u/st-AR-gazer`
- `PLUGINS_CACHE_TTL_MS` default: `300000`
- `OPENPLANET_FETCH_TIMEOUT_MS` default: `12000`
- `OPENPLANET_MAX_PAGES` default: `20`
- `IMAGE_PALETTE_CACHE_TTL_MS` default: `43200000`
- `IMAGE_PALETTE_MAX_CONCURRENCY` default: `4`
- `IMAGE_SAMPLE_SIZE` default: `72`
- `PLUGIN_INSTALL_LABEL` default: `Openplanet plugin manager`
- `OPENPLANET_REQUEST_UA` default: `plugins.xjk.yt (+https://plugins.xjk.yt)`
