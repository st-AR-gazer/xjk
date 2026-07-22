# Bannerbuilder service

Flask service for rendering Trackmania banners, serving the Altered builder UI, and optionally publishing a persisted
banner to Dashmap.

Generated banners begin in `static/banners/.pending`. The create response includes an unguessable capability that is
required to refresh, release, persist, or publish that banner. Persistence atomically moves the image into
`static/banners`; pending files expire after ten minutes.
Pending capability hashes and expiry timestamps are stored beside the image so a restart can recover live artifacts and
sweep expired or legacy orphan files. `BANNERBUILDER_MAX_PENDING`, `BANNERBUILDER_MAX_PENDING_BYTES`,
`BANNERBUILDER_MAX_PERSISTED`, and `BANNERBUILDER_MAX_PERSISTED_BYTES` bound filesystem use.

## Local setup

```powershell
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
Copy-Item .env.example .env
# Set SECRET_KEY and ADMIN_PWHASH, or opt into an ephemeral key for this local process only:
# BANNERBUILDER_ALLOW_EPHEMERAL_SECRET=1
# BANNERBUILDER_COOKIE_SECURE=0
./.venv/Scripts/python app.py
```

`SECRET_KEY` should be stable and secret outside local development. Generate `ADMIN_PWHASH` with Werkzeug's
`generate_password_hash`; the plaintext `ADMIN_PASSWORD` setting exists only as a legacy local fallback and does not
satisfy production preflight. Dashmap publishing remains disabled unless both `DASHMAP_API_KEY` and `DASHMAP_USER` are
configured. Use a shared Flask-Limiter storage backend in a multi-process deployment; the single-process local default
is `memory://`.

## Verification

```powershell
python -m compileall -q .
python -m unittest discover -s tests -p "test_*.py" -v
```
