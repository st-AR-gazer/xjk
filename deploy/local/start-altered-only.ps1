param(
  [int]$AlteredHubPort = 0,
  [int]$GatewayPort = 0,
  [switch]$UseMirrorData,
  [switch]$ShowConsole,
  [switch]$HiddenLauncher
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "hidden-launcher.ps1")

if (-not $ShowConsole -and -not $HiddenLauncher) {
  Start-XjkHiddenPowerShellScript -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters
  return
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "platform-manifest.ps1")
. (Join-Path $scriptDir "process-launch.ps1")
$platformManifest = Get-XjkPlatformManifest -RepoRoot $repoRoot
if ($AlteredHubPort -le 0) {
  $AlteredHubPort = Get-XjkServicePort -ServiceId "altered-hub" -RepoRoot $repoRoot
}
if ($GatewayPort -le 0) {
  $GatewayPort = [int]$platformManifest.infrastructure.localGateway.port
}
$trackerHubPort = Get-XjkServicePort -ServiceId "tracker-hub" -RepoRoot $repoRoot
$trackerLeaderboardPort = Get-XjkServicePort -ServiceId "tracker-leaderboard-hub" -RepoRoot $repoRoot
$trackerDisplayNamePort = Get-XjkServicePort -ServiceId "tracker-displayname-hub" -RepoRoot $repoRoot
$trackerClubPort = Get-XjkServicePort -ServiceId "tracker-club-hub" -RepoRoot $repoRoot
$aggregatorPort = Get-XjkServicePort -ServiceId "aggregator-hub" -RepoRoot $repoRoot
$logDir = Join-Path $scriptDir "logs"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$cwd = Join-Path $repoRoot "services\altered"
$snapshotDir = Join-Path $repoRoot "sites\altered.xjk.yt\data_server"
$dataDir = Join-Path $repoRoot "sites\altered.xjk.yt\data"
if ($UseMirrorData -and (Test-Path $snapshotDir)) {
  $dataDir = $snapshotDir
}
$dbFile = Join-Path $dataDir "altered-service.sqlite"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$listener = Get-NetTCPConnection -LocalPort $AlteredHubPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Host "Altered backend is already listening on port $AlteredHubPort (PID $($listener.OwningProcess))."
  return
}

$logPath = Join-Path $logDir "altered-hub-$runStamp.log"
$errorLogPath = Join-Path $logDir "altered-hub-$runStamp.error.log"
$envMap = @{
  PORT = "$AlteredHubPort"
  NODE_OPTIONS = "--max-old-space-size=12288"
  FRONTEND_DIR = (Join-Path $repoRoot "sites\altered.xjk.yt\frontend")
  DATA_DIR = $dataDir
  DB_FILE = $dbFile
  TRACKER_PUBLIC_BASE_URL = "http://127.0.0.1:$trackerHubPort/api/v1"
  TRACKER_ADMIN_BASE_URL = "http://127.0.0.1:$trackerHubPort/api/v1/admin"
  TRACKER_LEADERBOARD_PUBLIC_BASE_URL = "http://127.0.0.1:$trackerLeaderboardPort/api/v1"
  TRACKER_LEADERBOARD_ADMIN_BASE_URL = "http://127.0.0.1:$trackerLeaderboardPort/api/v1/admin"
  TRACKER_DISPLAYNAME_BASE_URL = "http://127.0.0.1:$trackerDisplayNamePort/api/v1"
  TRACKER_CLUB_BASE_URL = "http://127.0.0.1:$trackerClubPort/api/v1"
  AGGREGATOR_BASE_URL = "http://127.0.0.1:$aggregatorPort/api/v1"
  ALTERED_TRACKER_DISPLAYNAME_ENABLED = "1"
  ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL = "1"
  ALTERED_TRACKER_CLUB_ENABLED = "1"
  ALTERED_TRACKER_CLUB_FALLBACK_LOCAL = "1"
  TRACKER_PROXY_TIMEOUT_MS = "15000"
  ALTERED_INTERNAL_TOKEN = "local-altered-internal"
  ALTERED_WR_WEBHOOK_SECRET = "local-tracker-wr-webhook"
  ALTERED_LIVE_MONITOR_ENABLED = "0"
  ALTERED_LIVE_MONITOR_INTERVAL_SECONDS = "1800"
  ALTERED_LIVE_CLUB_ID = "24231"
  ALTERED_LIVE_ACTIVITY_PAGE_SIZE = "250"
  ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY = "0"
  ALTERED_LIVE_FETCH_MAP_DETAILS = "1"
  ALTERED_LIVE_AUTH_MODE = "basic"
  ALTERED_LIVE_USER_AGENT = "xjk.yt tracker (admin@xjk.yt)"
  ALTERED_LIVE_REQUEST_TIMEOUT_MS = "15000"
  ALTERED_LIVE_MIN_REQUEST_GAP_MS = "5000"
  ALTERED_OPS_MONITOR_ENABLED = "0"
  ALTERED_OPS_MONITOR_TICK_SECONDS = "120"
  ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN = "5000"
  ALTERED_MAP_COPY_BACKFILL_ENABLED = "0"
  ALTERED_EVENT_LOOP_WATCHDOG_DISABLED = "1"
  ALTERED_DEV_LOCAL_OPEN = "1"
  XJK_SHARED_AUTH_ENABLED = "1"
  XJK_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
  XJK_LOCAL_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
  XJK_AUTH_DB_FILE = (Join-Path $repoRoot "sites\xjk.yt\data\xjk-auth.sqlite")
  XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
}

$launch = Start-XjkRuntimeProcess `
  -Name "altered-hub" `
  -Runtime "node" `
  -EntryPoint "server.js" `
  -WorkingDirectory $cwd `
  -Environment $envMap `
  -LogPath $logPath `
  -ErrorLogPath $errorLogPath
Start-Sleep -Milliseconds 1200

$listener = Get-NetTCPConnection -LocalPort $AlteredHubPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Host "Altered backend did not start on port $AlteredHubPort. Check the log for details:" -ForegroundColor Red
  Write-Host "Log: $logPath"
  Write-Host "Error log: $errorLogPath"
  return
}

Write-Host "Started altered backend on port $AlteredHubPort (PID $($launch.pid))."
Write-Host "Log: $logPath"
Write-Host "Error log: $errorLogPath"
