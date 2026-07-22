# validifier-public

Canonical public Validifier product and API for `validifier.xjk.yt`.

## Responsibilities

- Hosts the public Validifier frontend
- Hosts the public API documentation page at `/api/`
- Exposes stable public API routes under `/api/v1/...`
- Reads from the private validation backend using server-only credentials
- Normalizes backend verdict envelopes into frontend-safe and plugin-safe contracts
- Stores public staged upload artifacts and replay submissions in a local SQLite-backed cache/store
- Bridges accepted public replay submissions into the private backend internal submission API

## Public API

- `GET /health`
- `GET /api/`
- `GET /api/v1`
- `GET /api/v1/endpoints`
- `GET /api/v1/health`
- `GET /api/v1/records/:recordId`
- `GET /api/v1/records/:recordId/verdicts`
- `GET /api/v1/maps/:mapUid/verdicts?track=replay|deep&limit=100`
- `POST /api/v1/verdicts/batch`
- `POST /api/v1/uploads/map?filename=<urlencoded>`
- `POST /api/v1/uploads/replay?filename=<urlencoded>`
- `POST /api/v1/submissions/replay`

## Private configuration

- `VALIDIFIER_INTERNAL_BASE_URL`
- `VALIDIFIER_INTERNAL_TOKEN` (optional)
- `VALIDIFIER_INTERNAL_TOKEN_HEADER` (optional)
- `VALIDIFIER_INTERNAL_TOKEN_PREFIX` (optional)
- `VALIDIFIER_INTERNAL_ACCESS_TOKEN` (optional; sent only in the `X-Validifier-Access-Token` request header)
- `VALIDIFIER_INTERNAL_SUBMISSION_SECRET` (required whenever `VALIDIFIER_INTERNAL_BASE_URL` is configured; startup fails closed when it is missing)
- `VALIDIFIER_REPLAY_BUILD_ID` (optional, otherwise latest supported build is resolved server-side)
- `VALIDIFIER_PUBLIC_REQUEST_TIMEOUT_MS` (optional)
- `VALIDIFIER_PUBLIC_CACHE_TTL_MS` (optional)
- `VALIDIFIER_PUBLIC_DATA_DIR` (optional)
- `VALIDIFIER_PUBLIC_DB_FILE` (optional)
- `VALIDIFIER_PUBLIC_ARTIFACT_ROOT` (optional)
- `VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS` (optional; staged artifact retention, default 7 days)
- `VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS` (optional; local pending-submission retention and artifact pin lifetime, default 7 days)
- `VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY` (optional; persistent daily upload-byte allowance per client IP, default 256 MiB)
- `VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY` (optional; service-wide daily upload-byte allowance, default 2 GiB)
- `VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT` (optional; simultaneous uploads per client IP, default 2)
- `VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT` (optional; process-wide simultaneous upload cap, default 8)

Upload byte usage is reserved from the declared `Content-Length` before the request body is read. Invalid or interrupted
uploads therefore still consume that client's daily allowance, which prevents repeated malformed bodies from bypassing
the bandwidth quota. Daily counters reset at UTC midnight.

## Deploy smoke

- Fixture files live in `services/validifier-public/testdata/replay_validation/`
- `deploy/server/run-validifier-replay-smoke.ps1` exercises the public upload + submission flow end to end
- `deploy/server/apply-update-winsw.ps1` runs that smoke automatically when `VALIDIFIER_ENABLE_DEPLOY_SMOKE=1`
