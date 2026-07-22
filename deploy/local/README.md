# Local Test Stack

Runs the full local stack without PM2/Caddy.

The canonical local port inventory is `config/platform-manifest.json`; the generated table is
`PLATFORM_CATALOG.md`. Start-up defaults are validated against the manifest. Restart and reset stop only processes
whose saved PID, executable, and creation time still match the live process. Entry points are validated before launch
and against the live command line whenever Windows permits that inspection.

Local environment defaults are grouped by responsibility in the `backend-environment-catalog-*.ps1` modules. Ordered
process/dotenv compatibility mappings live in `backend-environment-bindings.ps1`; the initializer only composes those
modules. `npm run check:platform` verifies complete manifest coverage, overlay parity, precedence, proxy rewrites,
security overrides, and optional tool paths.

## Start

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local.ps1
```

Recommended on machines where `*.localhost` does not resolve cleanly in the browser:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local-browser-friendly.ps1
```

Optional:

- Run directly against an alternate local snapshot (`sites/altered.xjk.yt/data_server`):
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local.ps1 -UseMirrorData`
- Start only the Altered backend (useful when you already have the other hubs running):
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\start-altered-only.ps1`
  - Alternate snapshot data: `powershell -ExecutionPolicy Bypass -File .\deploy\local\start-altered-only.ps1 -UseMirrorData`
- Enable browser support for `*.localhost` on machines that do not resolve those names natively:
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\enable-localhost-browser-proxy.ps1`
- Disable that browser proxy/PAC setup:
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\disable-localhost-browser-proxy.ps1`
- Disable explicitly configured remote origins and stay local-first:
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\start-local.ps1 -DisableRemoteServerProxy`

Remote origins are accepted only through explicit command parameters or environment variables. The public launcher does
not discover machine-local sync configuration or pull data from another environment.

The local Aggregator deliberately sets `AGGREGATOR_ALLOW_INSECURE_OPEN=1` so the private dashboard can be used
without production credentials. This bypass is local-only; production fails closed when its admin token is absent.

## Stop

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\stop-local.ps1
```

The launcher records each direct Node/Python child as soon as it starts. If a later launch fails, it rolls back only
those exact-owned children and removes the partial state. Environment values are inherited by the child process and
never embedded in a command line. A stale or reused PID is skipped rather than terminated.

## Full Reset

Stops services, clears local DB/token cache state, then starts again.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\local\reset-local.ps1
```

Reset and restart never kill a process merely because it owns a configured port. If an unowned or legacy process is
still listening, the next start fails with its port, PID, process name, and command line so it can be inspected and
stopped deliberately.

## Reset Options

- Keep existing logs:
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\reset-local.ps1 -KeepLogs`
- Skip reinstall during restart:
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\reset-local.ps1 -SkipInstall`
- Reset only (do not start):
  - `powershell -ExecutionPolicy Bypass -File .\deploy\local\reset-local.ps1 -NoStart`

## Local URLs (Subdomain Mode)

The start script prints every canonical URL from the platform manifest. Canonical subdomains follow
`http://<site-id>.localhost:<gateway-port>/`, except the main site, which uses
`http://xjk.localhost:<gateway-port>/`. The current default is generated in
[`PLATFORM_CATALOG.md`](../../PLATFORM_CATALOG.md).

Tracker modes remain nested under `http://trackers.localhost:<gateway-port>/`: `wr/`, `leaderboard/`,
`displayname/`, and `club/`. Legacy tracker subdomains redirect to those paths.

## Path Aliases (Redirects To Subdomains)

The start script also prints canonical path aliases. They follow
`http://localhost:<gateway-port>/<site-id>/`, with `/` for the main site. Tracker mode paths stay nested below
`/trackers/`; the three legacy tracker paths remain redirects.

If your OS does not resolve `*.localhost`, use the path-mode URLs above.

If you want browser access to `*.localhost` without editing the system hosts file or installing a DNS service, enable the local browser proxy PAC above. It routes `http://*.localhost:*` requests through a tiny loopback proxy and keeps all non-local traffic direct. Restart Firefox after enabling it so the new proxy config is picked up.

## Logs

Logs are written to `deploy/local/logs/`, with separate timestamped `.log` and `.error.log` files for standard output
and standard error.
