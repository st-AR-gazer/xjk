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
- `Replay-Verification` -> served at `https://tools.xjk.yt/Replay-Verification/` as a launch page for `https://validifier.xjk.yt/`

## Naming Convention

- Each tool website folder should use: `<ToolName>`
- Keep names descriptive and hyphenated.

## Runtime artifacts

The tool `tools/` directories are machine-local runtime dependencies and are intentionally absent from Git. Restore the release manifest's checksum-pinned files from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/restore-tool-runtime.ps1
```

Source deployments preserve these directories. Build and release provenance is documented in `deploy/tool-runtime/manifest.json` and `deploy/tool-runtime/README.md`.

Public native-tool routes use the bounded policy in `shared/backend`: excess work fails immediately with `503` and
`Retry-After` instead of accumulating in memory or an internal queue. Shared concurrency, upload, timeout, and
process-output environment overrides are documented in `shared/backend/README.md`.

## Adding a New Tool

1. Create the `<ToolName>` directory and its required `backend`, `frontend`, and local runtime layout.
2. Add its backend record under `services` and its public record under `tools` in
   `config/platform-manifest.json`, including the native `executableName` and `runtimeFileId` when it has one. The
   runtime ID must reference the checksum-pinned file in `deploy/tool-runtime/manifest.json`; validation confirms its
   install destination from the public tool path and executable name.
3. Run `npm run catalog:write` to regenerate `Tools-Hub/data/tools.json`, `deploy/Caddyfile.tools.generated`, and
   `PLATFORM_CATALOG.md`. The manifest path and production port therefore define both discovery and routing.
4. Add only tool-specific configuration that cannot be derived from the manifest, such as environment variables or
   compatibility API aliases, and document it beside the owning runtime.
5. Run `npm run check` so catalog, process, local-stack, deployment-route, and reproducible-install invariants are
   verified together.

Do not edit the generated tool catalog directly. The public link is derived from the manifest path as
`https://tools.xjk.yt/<ToolName>/`.
