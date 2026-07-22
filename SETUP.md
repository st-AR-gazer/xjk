# XJK Hosting Setup

This repo is structured by subdomain (`sites/`) and service (`services/`) so UI projects and trackers can evolve independently.

The canonical operational inventory is `config/platform-manifest.json`. The generated human-readable site, service,
port, health, and tool tables live in `PLATFORM_CATALOG.md`; do not maintain a second inventory in this guide.

## OS Assumption

This setup targets a Windows host machine because the Trackmania processors are Windows executables (`.exe`).

## Deployment Configuration

The examples use `D:\srv\xjk` as a portable server convention, not a machine-specific user path. Operator credentials, release transport, and workstation-to-server automation intentionally live outside this public repository.

The Caddy entrypoints use these environment variables:

- `XJK_SITES_ROOT`, defaulting to `D:/srv/xjk/sites`
- `XJK_ACME_EMAIL`, defaulting to the public `admin@xjk.yt` role address

Set machine-scoped values before installing or restarting the Caddy service when the server uses a different layout.

`deploy/Caddyfile` terminates HTTPS directly, while `deploy/Caddyfile.tunnel` accepts HTTP from Cloudflare Tunnel.
Both import `deploy/Caddyfile.routes`, which is the only place site and path routing is defined. Canonical site blocks
redirect `/favicon.ico` to `/favicon.svg`. On `tools.xjk.yt`, the root `/api/*` namespace belongs to the Tools Hub;
each dedicated tool backend is reachable only below its registered `/<tool-path>/api/*` namespace.

## Folder Layout

`sites/` contains host-facing frontends and tool/plugin packages. `services/` contains independent backend
runtimes and shared contracts. `deploy/` contains the local gateway, Caddy configuration, and Windows service
automation. See `PLATFORM_CATALOG.md` for the complete current inventory.

## Separation Model

The current target separation is:

- `services/altered`: user-facing community portal/admin UX.
- `services/tracker`: tracker runtime reused for:
  - WR mode (`/trackers/wr/`)
  - leaderboard mode (`/trackers/leaderboard/`)
- `services/tracker-displayname`: account ID -> display-name tracking.
- `services/tracker-club`: club/campaign/upload ingest runtime for project-owned crawlers.
- `services/aggregator`: shared cache/API used by all trackers and projects.
- `services/validifier-public`: canonical public Validifier site and stable public API.
- `services/cotd-public`: public COTD style snapshot site/API for the Openplanet plugin and web clients.
- `services/xjk-auth`: shared authentication and account runtime.
- `services/learn-profile`: authenticated Learn profile/progress runtime.
- `services/console-hub`: Console rooms and game-mode runtime.
- `services/bannerbuilder`: banner rendering/persistence runtime for Altered.

`aggregator` is the shared cache entrypoint. Trackers and portals should read/write through it whenever possible to reduce duplicate Nadeo requests.

## Runtime Model

### Local stack

`deploy/local/start-local.ps1` derives each service identity, working directory, runtime, entry point, default port,
required-port inventory, and gateway binding from the platform manifest, then applies only keyed per-service
environment or executable overlays from focused local configuration modules. Existing named port switches remain
available as explicit overrides. The launcher records direct runtime children transactionally; stop, restart, and reset
terminate only processes whose saved PID, executable, and creation time still match. Entry points are validated before
launch and against live command lines when Windows allows inspection. Occupied ports are reported and never used as
authority to kill a process. Local development explicitly opts into the Aggregator's
insecure-open mode through the manifest's local-only security policy; the production catalog does not.

### Server stack

- Caddy handles host/path routing through `deploy/Caddyfile.routes`; `deploy/Caddyfile` selects direct HTTPS and
  `deploy/Caddyfile.tunnel` selects the HTTP origin used behind Cloudflare Tunnel.
- `deploy/server/ecosystem.config.cjs` derives each process identity, path, runtime, entry point, and port from the
  platform manifest, and contains only production-specific environment or executable policy.
- WinSW install/update scripts read that catalog and manage the Windows services.
- Public service routes remain explicit in `deploy/Caddyfile.routes` and are checked against the manifest owner and
  port contracts.

## Backend Strategy

- Keep `xjk.yt` and `learn.xjk.yt` static unless API/compute is needed.
- Keep tools as dedicated backends while they are evolving.
- Keep trackers as focused runtimes (`tracker`, `tracker-displayname`, `tracker-club`).
- Keep WR and leaderboard polling as separate tracker instances.
- Centralize shared operational data in `aggregator`.
- Keep project/community customization in the portal service (`altered` or other project portal).

## Tool Binary Requirements

Tool executables are deployment artifacts and are not committed to Git. The authoritative file list, source revisions, and SHA-256 checksums live in `deploy/tool-runtime/manifest.json`.

Restore the pinned bundle after cloning or updating a machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/tool-runtime/restore-tool-runtime.ps1
```

The restore fails closed if the release manifest is incomplete, the archive contains unexpected paths, or any checksum differs. See `deploy/tool-runtime/README.md` for clean-build and release preparation.

The deployment package must provide:

- `sites/tools.xjk.yt/Strip-RaceValidationGhost/tools/stripValidationReplay.exe`
- `sites/tools.xjk.yt/Strip-RaceValidationGhost/tools/liblzo2.dll`
- `sites/tools.xjk.yt/Strip-RaceValidationGhost/tools/gbxlzo.exe`
- `sites/tools.xjk.yt/Embed-RaceValidationGhost/tools/EmbedRaceValidationGhost.exe`
- `sites/tools.xjk.yt/Embed-RaceValidationGhost/tools/ReplayDataExtractor.exe`
- `sites/tools.xjk.yt/Embedded-Blocks-And-Items-Checker/tools/EmbeddedBlocksAndItemsChecker.exe`
- `sites/tools.xjk.yt/Extract-Replay-Data/tools/ReplayDataExtractor.exe`
- `sites/tools.xjk.yt/Gbx-Medal-Time-Modifier/tools/GbxMedalTimeModifier.exe`
- `sites/tools.xjk.yt/Map-Validation-Checker/tools/MapValidationChecker.exe`
- `sites/tools.xjk.yt/Underwater-Map-Converter/tools/UnderwaterMapConverter.exe`
- `sites/tools.xjk.yt/Clip-To-Ghost/tools/ClipToGhost.exe`

Tool backends resolve their local `tools/` directories first.

## Clean-Slate Server Bootstrap

On the server (PowerShell as Administrator), clone the repo:

```powershell
git clone --branch main <REPO_URL> D:\srv\xjk
```

Run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\bootstrap-clean-server.ps1 -RepoUrl "<REPO_URL>" -RepoPath "D:\srv\xjk" -Branch "main"
```

For Cloudflare Tunnel mode, run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\bootstrap-clean-server.ps1 -RepoUrl "<REPO_URL>" -RepoPath "D:\srv\xjk" -Branch "main" -InstallCloudflareTunnel -TunnelTokenFile "C:\ProgramData\xjk\Cloudflared-token.txt" -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

When the token file does not exist, the bootstrap script prompts for the token without placing it in the command line and restricts the file to `SYSTEM` and local administrators.

After bootstrap, restore the checksum-pinned tool runtime and then apply the service update:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\tool-runtime\restore-tool-runtime.ps1 -RepoPath "D:\srv\xjk"
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\apply-update-winsw.ps1 -RepoPath "D:\srv\xjk" -SkipGit -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

## DNS + Network

### Option A: Direct exposure (legacy)

Create DNS records to your server IP for every canonical host and alias in `PLATFORM_CATALOG.md`.

Forward router ports:

- TCP `80`
- TCP `443`

### Option B: Cloudflare Tunnel

1. Keep domains on Cloudflare DNS (proxied records).
2. Run one tunnel connector service on the server:

```powershell
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\setup-cloudflare-tunnel-service.ps1 -TunnelTokenFile "C:\ProgramData\xjk\Cloudflared-token.txt" -ServiceName "xjk-cloudflared" -DisplayName "xjk Cloudflare Tunnel"
```

The setup script prompts securely when the token file is absent. For unattended provisioning, create the protected token file through the host's secret-management workflow first.
The token-file option requires `cloudflared` 2025.4.0 or newer.

3. In Cloudflare Tunnel "Published application routes", map every canonical host and alias in
   `PLATFORM_CATALOG.md` to `http://127.0.0.1:80`.

4. Use `deploy/Caddyfile.tunnel` to avoid HTTP->HTTPS redirect loops behind Cloudflare Tunnel.
5. Do not forward router ports `80/443` in tunnel mode.

## Releases

Release transport, operator credentials, and workstation-to-server automation are deliberately private. Validate a
candidate with `npm run check`, deliver it through the operator-owned release process, and use the documented
server-side service tooling after the workspace is present on the host.

## Local Test

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local.ps1
```

The complete preferred-host list is generated from `config/platform-manifest.json` in the Sites table of
`PLATFORM_CATALOG.md`; use each site's Local URL there. The same gateway also exposes manifest-derived path mode:
`http://localhost:<gateway-port>/` for Main and `http://localhost:<gateway-port>/<site-id>/` for every other
registered site. The current gateway port is listed in `PLATFORM_CATALOG.md`. Tracker
modes remain nested under `/trackers/wr/`, `/trackers/leaderboard/`, `/trackers/displayname/`, and `/trackers/club/`.
Legacy tracker host/path aliases redirect to those canonical routes.

Stop:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\stop-local.ps1
```

## Add New Subdomain

1. Create `sites/<new-subdomain>/` and its frontend.
2. Register the operational ID, host, host aliases, and path in `config/platform-manifest.json`.
3. Register user-facing navigation metadata under that exact ID/host contract in
   `sites/shared/xjk-core/site-registry.js`; browser-only labels, colors, aliases, and layout stay there.
4. Add the host block in `deploy/Caddyfile.routes` and any required production environment overlay in
   `ecosystem.config.cjs`.
5. Run `npm run catalog:write`, then `npm run check`.
6. Release through the private operator process.

## Add New Service

1. Create `services/<service-name>/` with its package, committed lockfile, entry point, and `.env.example`.
2. Add one service record to `config/platform-manifest.json`, including its local CLI parameter and gateway
   environment-variable name. That record automatically supplies the local identity, path, runtime, entry point,
   default port, required-port check, and backend validation contract.
3. Add focused local defaults to `deploy/local/backend-environment-catalog-services.ps1` (or
   `backend-environment-catalog-public.ps1` for a public integration). Register process/dotenv compatibility keys as
   ordered bindings in `backend-environment-bindings.ps1`; keep `backend-environment.ps1` as orchestration only. Add a
   keyed production environment overlay to `ecosystem.config.cjs` when needed. Process metadata and the production port
   are supplied by the manifest in both cases.
4. Add Caddy routing if externally exposed and document shared contracts under `services/contracts/`.
5. Run `npm run catalog:write`, then `npm run check`. Deployment dependency installs are derived from the manifest,
   and the check fails when a managed Node service lacks a current `package-lock.json`.

Tool services are registered once in `config/platform-manifest.json`. `npm run catalog:write` derives their Tools Hub
entries, production Caddy routes, and operational catalog from that record; do not add tool path handlers directly to
`deploy/Caddyfile.routes`.

## Ops Checks

On server:

```powershell
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\services\health-check.ps1 -RepoPath D:\srv\xjk
caddy validate --config D:\srv\xjk\deploy\Caddyfile.tunnel
Get-Service xjk-*
Get-Service xjk-caddy
Get-Service xjk-cloudflared
```

## Rollback

Release rollback is owned by the private operator process and intentionally is not documented in this repository.

To rerun the apply phase against the already committed workspace on the server:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\server\apply-update-winsw.ps1 -RepoPath "D:\srv\xjk" -SkipGit -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

If a service refresh fails after a workspace is present, resolve the service or configuration problem and rerun the
server-side apply phase. Restoring an older workspace remains the responsibility of the private release process.
