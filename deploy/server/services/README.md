# WinSW Service Deployment

This deployment no longer starts backend processes with PM2. Backend services, Caddy, and the xjk Cloudflare tunnel are installed and restarted as Windows services through WinSW.

`deploy\server\ecosystem.config.cjs` derives process identities, ports, source paths, runtimes, and entry points from
`config\platform-manifest.json`, then adds environment-specific launch policy. WinSW install/update scripts read the
resulting catalog and generate the actual Windows service wrappers from it.

Process environments are assembled without mutating the deployment shell. `deploy/server/.env` supplies shared
defaults, each manifest service's `<cwd>/.env` supplies its isolated service overlay, and an inherited environment
setting has final precedence. Service files are discovered from the manifest rather than a separate path list, so a
setting in one service's `.env` cannot leak into another service.

Install and restart commands validate the effective service environments against the declarative requirements in
[`deploy/server/PRODUCTION_CREDENTIALS.md`](../PRODUCTION_CREDENTIALS.md) before changing service state.

## First Elevated Migration

Run these commands once from an elevated PowerShell session:

```powershell
cd D:\srv\xjk
powershell -ExecutionPolicy Bypass -File .\deploy\server\services\cleanup-pm2.ps1 -KillKnownPortListeners
powershell -ExecutionPolicy Bypass -File .\deploy\server\services\install-services.ps1 -RepoPath D:\srv\xjk
powershell -ExecutionPolicy Bypass -File .\deploy\server\services\restart-services.ps1 -RepoPath D:\srv\xjk
powershell -ExecutionPolicy Bypass -File .\deploy\server\services\health-check.ps1 -RepoPath D:\srv\xjk
powershell -ExecutionPolicy Bypass -File .\deploy\server\services\cutover-winsw.ps1 -RepoPath D:\srv\xjk -RemoveAllNssmServices
```

`install-services.ps1` downloads `deploy\server\winsw\WinSW.exe` if it is missing, then generates runtime XML files under `deploy\server\winsw\services\`.
`cutover-winsw.ps1` migrates `xjk-caddy` and `Cloudflared` from NSSM to WinSW, removes the disabled nginx service, renames `C:\nginx`, and can remove remaining NSSM-backed services when `-RemoveAllNssmServices` is passed.

## Normal Deploy

Use:

```powershell
powershell -ExecutionPolicy Bypass -File D:\srv\xjk\deploy\server\apply-update-winsw.ps1 -RepoPath D:\srv\xjk -SkipGit -CaddyConfigPath deploy/Caddyfile.tunnel
```

The deploy script installs dependencies, updates WinSW service configs, restarts services, checks required local health endpoints, validates Caddy, and reloads Caddy.

## Required Health Checks

Every managed service has a required readiness probe. The complete process, port, source, and probe inventory is
generated in `PLATFORM_CATALOG.md` from `config/platform-manifest.json`; do not maintain a second health-check list
here. The WinSW health checker consumes the same manifest-backed catalog.

Node dependency installs are also derived from the manifest and always use `npm ci`. Each managed Node service must
therefore commit a current `package-lock.json`; deployment fails closed when either package file is missing.

`deploy\server\apply-update.ps1` is a compatibility wrapper around `apply-update-winsw.ps1`.
