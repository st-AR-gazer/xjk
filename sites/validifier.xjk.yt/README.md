# validifier.xjk.yt

Canonical public Validifier product under the xjk umbrella.

- Frontend assets live in `frontend/`
- Public API and hosting runtime live in `services/validifier-public/`
- The frontend now includes a manual replay-submission dogfood panel wired to the same public API as the plugin, with the public service forwarding accepted submissions into the private backend internal submission API

Public routes:

- `https://validifier.xjk.yt/`
- `https://validifier.xjk.yt/api/v1/records/:recordId`
- `https://validifier.xjk.yt/api/v1/records/:recordId/verdicts`
- `https://validifier.xjk.yt/api/v1/maps/:mapUid/verdicts?track=replay|deep&limit=100`
- `https://validifier.xjk.yt/api/v1/verdicts/batch`
- `https://validifier.xjk.yt/api/v1/uploads/map?filename=<urlencoded>`
- `https://validifier.xjk.yt/api/v1/uploads/replay?filename=<urlencoded>`
- `https://validifier.xjk.yt/api/v1/submissions/replay`
