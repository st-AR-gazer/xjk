# xjk-auth

Shared session, Ubisoft OAuth, account preference, and account-frontend service for xjk sites.

## Runtime

- Managed process identity and production/local ports: [`PLATFORM_CATALOG.md`](../../PLATFORM_CATALOG.md)
- Account frontend: `sites/account.xjk.yt/frontend`
- Shared frontend assets: `sites/shared`
- SQLite database: `sites/xjk.yt/data/xjk-auth.sqlite`

## Module boundaries

- `server.js` is the composition-only process entrypoint.
- `src/config.js` loads and normalizes deployment settings.
- `src/accountPreferences.js` owns preference defaults and validation.
- `src/staticFiles.js` resolves and streams account/shared assets within configured roots.
- `src/app.js` implements OAuth, session, preference, health, and static HTTP routes.
- `src/runtime.js` constructs the store, OAuth state policy, app, and HTTP listener.

Run `npm run check` and `npm test` from this directory for service-local syntax and behavior checks.

## Production credentials

`UBI_OAUTH_CLIENT_ID` and `UBI_OAUTH_CLIENT_SECRET` are required when `UBI_OAUTH_ENABLED` is enabled. The production credential preflight validates that condition before install or restart. Keep real values in ignored deployment `.env` files; `.env.example` is only the public setting catalog.
