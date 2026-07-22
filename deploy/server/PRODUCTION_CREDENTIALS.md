# Production credential preflight

Production credential requirements are declared in `config/production-credentials.json`. The catalog contains setting names and activation conditions only; credential values remain in ignored service or deployment `.env` files.

Every service in `config/platform-manifest.json` has an explicit catalog entry, including services with no production credentials. The preflight rejects missing entries and stale entries that no longer belong to a registered service.

Each service can declare:

- `required`: settings that must always be present in production;
- `optional`: sensitive settings tracked by the catalog but not required for every deployment;
- `conditional`: feature-specific `allOf`, `anyOf`, or complete `anyOfGroups` requirements.

The preflight resolves the effective production environment from `deploy/server/ecosystem.config.cjs`, then validates selected services before install or restart. Failure output contains service and setting names, never configured values.

Validate the catalog structure and its complete platform-manifest coverage:

```powershell
node deploy/server/check-production-credentials.cjs --schema-only
```

Validate one service by platform id or process name:

```powershell
node deploy/server/check-production-credentials.cjs --service xjk-auth
node deploy/server/check-production-credentials.cjs --service xjk-cotd-public
```

Omitting `--service` checks every registered platform service. Add an explicit catalog entry whenever a service is registered, and update it alongside any new production feature that introduces a credential. Do not add secret values, example secrets, or machine-local paths to the catalog.

Console requires `CONSOLE_HUB_BINGO_AUTH_SECRET` because both its TCP protocol and optional HTTP bridge authenticate
messages with that key. Bannerbuilder requires a stable `SECRET_KEY` and Werkzeug `ADMIN_PWHASH`; its plaintext
`ADMIN_PASSWORD` compatibility setting is not accepted by production preflight.

When Altered live monitoring is enabled, preflight requires either a complete dedicated-account login or an access/refresh token, including the supported Tracker fallback names. Aggregator records `ARL_OPENPLANET_AUTH_SECRET` as an optional production capability for authenticated Openplanet ingest.
