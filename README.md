# website-trackmania_xjk

Monorepo for xjk websites and Trackmania backend services.

## Start Here

- `SETUP.md` - local/server setup and deployment guide
- `PLATFORM_CATALOG.md` - generated site, service, port, health, and tool inventory
- `services/README.md` - backend service map
- `services/ARCHITECTURE.md` - service boundaries and ownership
- `sites/shared/xjk-core/README.md` - shared navigation, topbar, search, and site-registry contract

## Platform Catalog

`config/platform-manifest.json` is the operational source of truth for sites, service identities, production/local
ports, health checks, and tool routes. The local launcher derives every backend skeleton, default and required port,
and gateway port binding from it. The production process catalog derives the same identity, working directory,
runtime, entry point, and port; service-specific environment and executable policy remains in keyed overlays.
`npm run check:platform` also verifies the browser registry's operational site IDs, hosts, and host aliases, plus the
restart/reset scripts, PM2/WinSW source catalog, shared Caddy routes and transport entrypoints, Tools Hub catalog, and
generated documentation.

Regenerate the readable catalog after changing the manifest:

```powershell
npm run catalog:write
```

## Quality Checks

Use Node.js from `.nvmrc` and Python 3.12. Install the Bannerbuilder test dependencies once with
`python -m pip install -r services/bannerbuilder/requirements.txt`.

Run the same test and validation entry point used before deployment and in CI:

```powershell
npm run check
```

The full check includes a production dependency audit for every manifest-managed Node service and therefore requires
access to the npm registry.

That command runs behavior tests, parses every JavaScript and PowerShell source, links the static first-party
JavaScript graph to validate imports and named exports, resolves literal dynamic-import edges, lints all first-party
JavaScript, enforces semantic module-size limits and the copy/paste budget, rejects tracked secrets and machine-specific
paths, records all-files JavaScript coverage by repository area, validates the generated platform catalog, checks
Python security contracts, and exercises the shared browser shell. Coverage is reported against the checked-in
baseline without enforcing a percentage gate; use `npm run coverage:baseline:write` only after reviewing intentional
test-scope changes.

The maintained source boundaries are explicit: executable modules are capped at 850 lines, composition roots and
facades at 300, browser entrypoints and authored stylesheets at 700, JavaScript functions at 350 lines and a
cyclomatic complexity of 80, and Python and PowerShell functions at 120 lines. These JavaScript ceilings are an
initial ratchet; reduce them toward 250 lines and complexity 60 as the remaining legacy hotspots are split. The only
module-size exemptions are declarative catalogs or fixtures with a checked rationale; behavioral source does not
receive exemptions.

First-party HTML scripts, stylesheets, icons, and images use the single `assetVersion` token from the platform
manifest; existing source-level version tokens are normalized to the same value. After changing that value:

```powershell
npm run assets:version
```

## Formatting

Formatting is pinned to Prettier 3.6.2. Local commands cover the current uncommitted change set, including untracked
files; CI checks every tracked source file so formatting cannot depend on commit boundaries:

```powershell
npm run format
npm run format:check
```

The shared `.prettierrc.json` is the canonical style configuration. Generated data and template-aware HTML listed in
`.prettierignore` remain outside this formatter pass.
