# XJK Hosting Setup

This repo is structured by subdomain (`sites/`) and service (`services/`) so UI projects and trackers can evolve independently.

## OS Assumption

This setup targets a Windows host machine because the Trackmania processors are Windows executables (`.exe`).

## Folder Layout

```text
sites/
  xjk.yt/
    frontend/
  learn.xjk.yt/
    frontend/
  altered.xjk.yt/
    frontend/
    data/
  trackers.xjk.yt/
    frontend/
  tracker.xjk.yt/
    frontend/            # shared tracker UI served by /wr/ and /leaderboard/
  plugins.xjk.yt/
    Plugins-Hub/
  tools.xjk.yt/
    Tools-Hub/
    Strip-RaceValidationGhost/
    Embed-RaceValidationGhost/

services/
  altered/               # community portal (project-specific admin/workflows)
  tracker/               # tracker runtime (WR + leaderboard mode instances)
  tracker-displayname/   # display-name tracker runtime
  tracker-club/          # club/campaign/upload ingest runtime
  aggregator/            # shared cache API
  contracts/             # shared schema/contracts
  split/                 # service export tooling
  ARCHITECTURE.md

docs/
  README.md
  archive/

deploy/
  Caddyfile
  Caddyfile.tunnel
  deploy-from-dev.ps1
  local/
    start-local.ps1
    stop-local.ps1
  server/
    bootstrap-clean-server.ps1
    apply-update.ps1
    setup-cloudflare-tunnel-service.ps1
    ecosystem.config.cjs
```

## Separation Model

The current target separation is:

- `services/altered`: user-facing community portal/admin UX.
- `services/tracker`: tracker runtime reused for:
  - WR mode (`/trackers/wr/`)
  - leaderboard mode (`/trackers/leaderboard/`)
- `services/tracker-displayname`: account ID -> display-name tracking.
- `services/tracker-club`: club/campaign/upload ingest runtime for project-owned crawlers.
- `services/aggregator`: shared cache/API used by all trackers and projects.

`aggregator` is the shared cache entrypoint. Trackers and portals should read/write through it whenever possible to reduce duplicate Nadeo requests.

## Runtime Model

### Local stack

`deploy/local/start-local.ps1` starts:

- xjk/tools/plugins/learn frontends + tool backends
- `altered`
- `tracker` (WR mode)
- `tracker` (leaderboard mode)
- `tracker-displayname`
- `tracker-club`
- `aggregator`
- local gateway (`deploy/local/local-gateway.js`) for host/path routing

### Server stack

- Caddy handles host/path routing (`deploy/Caddyfile` for direct internet mode, `deploy/Caddyfile.tunnel` for Cloudflare Tunnel mode).
- PM2 process definitions are in `deploy/server/ecosystem.config.cjs`.
- If you expose split tracker services publicly, add dedicated Caddy host blocks and PM2 apps for them.

## Backend Strategy

- Keep `xjk.yt` and `learn.xjk.yt` static unless API/compute is needed.
- Keep tools as dedicated backends while they are evolving.
- Keep trackers as focused runtimes (`tracker`, `tracker-displayname`, `tracker-club`).
- Keep WR and leaderboard polling as separate tracker instances.
- Centralize shared operational data in `aggregator`.
- Keep project/community customization in the portal service (`altered` or other project portal).

## Important Binary Requirements

`Strip-RaceValidationGhost` includes:

- `tools/stripValidationReplay.exe`
- `tools/gbxlzo.exe`

`Embed-RaceValidationGhost` requires these files on the server:

- `sites/tools.xjk.yt/Embed-RaceValidationGhost/tools/EmbedRaceValidationGhost.exe`
- `sites/tools.xjk.yt/Embed-RaceValidationGhost/tools/ReplayDataExtractor.exe`

The embed backend defaults to the local `tools/` folder first.

## Clean-Slate Server Bootstrap

On the server (PowerShell as Administrator), clone the repo:

```powershell
git clone --branch main <REPO_URL> C:\srv\xjk
```

Run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\srv\xjk\deploy\server\bootstrap-clean-server.ps1 -RepoUrl "<REPO_URL>" -RepoPath "C:\srv\xjk" -Branch "main"
```

For Cloudflare Tunnel mode, run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\srv\xjk\deploy\server\bootstrap-clean-server.ps1 -RepoUrl "<REPO_URL>" -RepoPath "C:\srv\xjk" -Branch "main" -InstallCloudflareTunnel -TunnelToken "<TUNNEL_TOKEN>" -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

After bootstrap, copy the two embed binaries into the embed `tools/` folder, then:

```powershell
powershell -ExecutionPolicy Bypass -File C:\srv\xjk\deploy\server\apply-update.ps1 -RepoPath "C:\srv\xjk" -Branch "main" -SkipGit -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

## DNS + Network

### Option A: Direct exposure (legacy)

Create DNS records to your server IP for:

- `xjk.yt`
- `www.xjk.yt`
- `learn.xjk.yt`
- `altered.xjk.yt`
- `trackers.xjk.yt`
- `aggregator.xjk.yt`
- `tracker-displayname.xjk.yt`
- `tracker-club.xjk.yt`
- `tracker.xjk.yt` (legacy redirect)
- `plugins.xjk.yt`
- `tools.xjk.yt`

Forward router ports:

- TCP `80`
- TCP `443`

### Option B: Cloudflare Tunnel

1. Keep domains on Cloudflare DNS (proxied records).
2. Run one tunnel connector service on the server:

```powershell
powershell -ExecutionPolicy Bypass -File C:\srv\xjk\deploy\server\setup-cloudflare-tunnel-service.ps1 -TunnelToken "<TUNNEL_TOKEN>" -ServiceName "xjk-cloudflared" -DisplayName "xjk Cloudflare Tunnel"
```

3. In Cloudflare Tunnel "Published application routes", map these hostnames to `http://127.0.0.1`:
- `xjk.yt` -> `127.0.0.1:80`
- `www.xjk.yt` -> `127.0.0.1:80`
- `learn.xjk.yt` -> `127.0.0.1:80`
- `altered.xjk.yt` -> `127.0.0.1:80`
- `trackers.xjk.yt` -> `127.0.0.1:80`
- `aggregator.xjk.yt` -> `127.0.0.1:80`
- `tracker-displayname.xjk.yt` -> `127.0.0.1:80`
- `tracker-club.xjk.yt` -> `127.0.0.1:80`
- `tracker.xjk.yt` -> `127.0.0.1:80`
- `plugins.xjk.yt` -> `127.0.0.1:80`
- `tools.xjk.yt` -> `127.0.0.1:80`
4. Use `deploy/Caddyfile.tunnel` to avoid HTTP->HTTPS redirect loops behind Cloudflare Tunnel.
5. Do not forward router ports `80/443` in tunnel mode.

## Deploy From Dev Machine

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy-from-dev.ps1 -Server "user@your-server" -RemoteRepoPath "C:\srv\xjk" -Branch "main"
```

Fast path when only frontend/code changed and lockfiles did not change:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\deploy-from-dev.ps1 -Server "user@your-server" -RemoteRepoPath "C:\srv\xjk" -Branch "main" -SkipInstall -CaddyConfigPath "deploy/Caddyfile.tunnel"
```

This script:

1. Pushes `main`
2. SSHs to server
3. Runs `deploy/server/apply-update.ps1` (supports `-SkipInstall`, `-ForceInstall`, and `-CaddyConfigPath`)

## Local Test

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local.ps1
```

Preferred local hosts:

- `http://xjk.localhost:8080/`
- `http://tools.localhost:8080/`
- `http://plugins.localhost:8080/`
- `http://learn.localhost:8080/`
- `http://altered.localhost:8080/`
- `http://trackers.localhost:8080/`
- `http://trackers.localhost:8080/wr/`
- `http://trackers.localhost:8080/leaderboard/`
- `http://trackers.localhost:8080/displayname/`
- `http://trackers.localhost:8080/club/`
- `http://aggregator.localhost:8080/`
- `http://tracker.localhost:8080/`
- `http://tracker-displayname.localhost:8080/`
- `http://tracker-club.localhost:8080/`

Path-mode aliases:

- `http://localhost:8080/`
- `http://localhost:8080/tools/`
- `http://localhost:8080/plugins/`
- `http://localhost:8080/learn/`
- `http://localhost:8080/altered/`
- `http://localhost:8080/trackers/`
- `http://localhost:8080/trackers/wr/`
- `http://localhost:8080/trackers/leaderboard/`
- `http://localhost:8080/trackers/displayname/`
- `http://localhost:8080/trackers/club/`
- `http://localhost:8080/aggregator/`
- `http://localhost:8080/tracker/`
- `http://localhost:8080/tracker-displayname/`
- `http://localhost:8080/tracker-club/`

Stop:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\stop-local.ps1
```

## Add New Subdomain

1. Create directory: `sites/<new-subdomain>/`
2. Add app/frontend files
3. Add host block in `deploy/Caddyfile`
4. If Node backend is needed, add app entry in `deploy/server/ecosystem.config.cjs`
5. Deploy with `deploy-from-dev.ps1`

## Add New Service

1. Create `services/<service-name>/`
2. Add `package.json`, `server.js`, and runtime config (`.env.example`)
3. Add local startup entry in `deploy/local/start-local.ps1`
4. Add PM2 app entry in `deploy/server/ecosystem.config.cjs`
5. Add Caddy host/path routing if externally exposed
6. Document contracts in `services/contracts/` when shared with other services

## Ops Checks

On server:

```powershell
pm2 list
caddy validate --config C:\srv\xjk\deploy\Caddyfile.tunnel
Get-Service xjk-caddy
Get-Service xjk-cloudflared
```

## Rollback

On server:

```powershell
cd C:\srv\xjk
git checkout <known-good-commit>
powershell -ExecutionPolicy Bypass -File .\deploy\server\apply-update.ps1 -RepoPath "C:\srv\xjk" -Branch "main" -SkipGit -CaddyConfigPath "deploy/Caddyfile.tunnel"
```
