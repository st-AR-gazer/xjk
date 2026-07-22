# Strip-RaceValidationGhost

Frontend + backend wrapper for `stripValidationReplay.exe`.

The hosted backend always runs the tool with `--allow-clones remove`, so clone-enabled maps can be stripped and have their clone state cleared automatically. The website does not expose the tool's `keep` mode.

## Expected Tool Binaries

- `tools/stripValidationReplay.exe`
- `tools/liblzo2.dll`
- `tools/gbxlzo.exe`

All three files are restored from the checksum-pinned tool runtime release with `deploy/tool-runtime/restore-tool-runtime.ps1`; they are not committed here.
