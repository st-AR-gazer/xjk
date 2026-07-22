# Tool Runtime Release

The tool backends call Windows executables that are built in their own source repositories. Those binaries are deployment artifacts: they are restored from one checksum-pinned release bundle and are not committed to the website repository.

The published v2 bundle is:

- repository: `st-AR-gazer/xjk`
- tag: `tool-runtime-v2.0.0`
- asset: `xjk-tool-runtime-v2.0.0-win-x64.zip`
- manifest: `deploy/tool-runtime/manifest.json`

The manifest is finalized: it records the released archive checksum, each runtime checksum, and the exact source revision used for every first-party executable. Restore and release tooling still rejects `PENDING_*` placeholders so an unfinished future manifest cannot be treated as publishable.

## Clean-build contract

For each first-party runtime:

1. Start from the committed source revision recorded in the manifest and apply every declared source patch after verifying its SHA-256 checksum.
2. Build `Release` for `win-x64` in a path-neutral environment. Set deterministic/CI build properties and omit debug symbols from the distributable output. Use an MSBuild `PathMap` when a project or dependency still embeds its checkout path.
3. Run the source repository tests and the website backend smoke test for that exact output.
4. Scan the executable and its dependencies for `:\Users\`, `:/Users/`, the website workspace name, credentials, and private hostnames. `update-manifest-hashes.ps1` repeats the machine-path scan and refuses unsafe outputs.
5. Copy the verified files into a staging directory using the manifest's `archivePath` layout.
6. Include `licenses/THIRD_PARTY_NOTICES.md`, `licenses/GPL-2.0.txt`, and `licenses/GPL-3.0.txt`. `gbxlzo.exe` is pinned to the GPL-2.0 `GreffMASTER/GBXLZO` v1.1.0 source/release provenance; the GPL-3.0 text covers the GBX.NET.LZO/NativeSharpLzo runtime components.

The canonical Underwater v1.1 release contains a personal home-directory CodeView path from an upstream dependency. It must not be copied into the xjk release bundle. The restore manifest instead pins and downloads that canonical external asset directly; the xjk bundle never republishes it.

An offline `-ArchivePath` supplies only the xjk-owned bundle. External-release entries such as Underwater are still fetched from their pinned HTTPS URL and verified independently.

The existing website copies are reference inputs only. Do not upload them: several contain local PDB paths, and six are unreleased variants that must be recreated from their source revisions.

## Assemble a future release asset

Create a new tag and asset name, record every new source `revision`, stage the clean outputs, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/update-manifest-hashes.ps1 `
  -StagingRoot "<PATH_TO_CLEAN_STAGING_DIRECTORY>"
```

The command verifies that the staging directory exactly matches the manifest, rejects machine-path markers, creates the ZIP under the ignored `artifacts/tool-runtime/` directory, and writes all file/archive hashes into the manifest. Use `-Force` only when deliberately replacing a previously generated local ZIP.

Before publishing a successor, review both the finalized manifest and ZIP, run a malware scan, test a restore into a clean checkout, and verify each tool endpoint. Publishing the GitHub release is a separate explicit operation; do not overwrite the checksum-pinned v2.0.0 asset.

## Restore

To restore the published bundle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/restore-tool-runtime.ps1
```

For an offline or pre-publication verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/restore-tool-runtime.ps1 `
  -ArchivePath "<PATH_TO_xjk-tool-runtime-v2.0.0-win-x64.zip>" `
  -ExternalArtifactDirectory "<DIRECTORY_CONTAINING_UnderwaterMapConverter.exe>"
```

Without `-ExternalArtifactDirectory`, external-release entries are fetched from their checksum-pinned HTTPS URLs. The restore script rejects incomplete manifests, non-HTTPS release URLs, unsafe ZIP paths, unexpected archive files, reparse-point escapes, and checksum mismatches before it changes any runtime file. `-WhatIf` performs the extraction and verification pass without installing files.

### Post-restore smoke checks

A normal non-`WhatIf` restore runs `smoke-native-tools.ps1` in strict mode. Every installed native runtime is discovered through the platform and runtime manifests, and the restore reports `ready` only after all eight checks execute successfully. Missing runtimes or fixture paths fail the restore. Use ignored, non-sensitive fixtures and never commit user maps, ghosts, or replays just to satisfy this check.

Fixture paths can be passed to `restore-tool-runtime.ps1`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/restore-tool-runtime.ps1 `
  -SmokeMapFixturePath "<PATH_TO_MAP_FIXTURE>" `
  -SmokeGhostFixturePath "<PATH_TO_GHOST_FIXTURE>" `
  -SmokeReplayFixturePath "<PATH_TO_REPLAY_FIXTURE>" `
  -SmokeUnderwaterMapFixturePath "<PATH_TO_UNDERWATER_COMPATIBLE_MAP_FIXTURE>"
```

The equivalent environment settings are `XJK_TOOL_SMOKE_MAP_PATH`, `XJK_TOOL_SMOKE_GHOST_PATH`, `XJK_TOOL_SMOKE_REPLAY_PATH`, and `XJK_TOOL_SMOKE_UNDERWATER_MAP_PATH`. `-SmokeTimeoutSeconds` changes the per-process timeout. The Underwater fixture is separate because that converter supports only specific map collections; when omitted it falls back to the general map fixture. `-SkipSmokeTests` is the explicit escape hatch for a deliberate restore-only operation; it must not be used to claim release verification.

To exercise the harness independently, invoke `smoke-native-tools.ps1` with the same fixture parameters. Standalone runs may omit `-Strict` to inventory unavailable cases as skips; release and restore verification uses `-Strict` and requires complete coverage.

The deployment reconciler excludes and preserves every managed tool `tools/` directory, so source deployments cannot remove a restored runtime as a stale Git file.
Production process definitions bind executable-backed tools to those manifest-managed destinations after environment
resolution. A machine or service `.env` cannot redirect production to a sibling checkout; `TOOL_PATH` remains
available to direct development launches outside the production service catalog.
