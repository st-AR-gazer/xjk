param(
  [int]$Port = 8877,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$statePath = Join-Path $scriptDir ".localhost-browser-proxy.json"
$logDir = Join-Path $scriptDir "logs"
$proxyScript = Join-Path $scriptDir "localhost-browser-proxy.js"
. (Join-Path $scriptDir "process-launch.ps1")
. (Join-Path $scriptDir "process-ownership.ps1")

function Get-ManagedProcess {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  try {
    $state = Get-Content $Path -Raw | ConvertFrom-Json
  } catch {
    Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
    return $null
  }

  if (-not $state.pid) {
    Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
    return $null
  }

  $process = Get-XjkLocalProcessSnapshot -ProcessId ([int]$state.pid)
  $owned = Test-XjkLocalProcessOwnership `
    -Process $process `
    -RepoRoot $repoRoot `
    -ExpectedPid ([int]$state.pid) `
    -ExecutablePath ([string]$state.executable) `
    -EntryPoint ([string]$state.entrypoint) `
    -CreatedAt ([string]$state.created_at)
  if (-not $owned) {
    Remove-Item -Path $Path -Force -ErrorAction SilentlyContinue
    return $null
  }

  return $state
}

$existing = Get-ManagedProcess -Path $statePath
if ($existing) {
  if (-not $Quiet) {
    Write-Host "Localhost browser proxy already running on port $($existing.port) (PID $($existing.pid))."
  }
  exit 0
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDir "localhost-browser-proxy-$runStamp.log"
$errorLogPath = Join-Path $logDir "localhost-browser-proxy-$runStamp.error.log"

$launch = Start-XjkRuntimeProcess `
  -Name "localhost-browser-proxy" `
  -Runtime "node" `
  -EntryPoint $proxyScript `
  -WorkingDirectory $repoRoot `
  -Environment @{ LOCALHOST_BROWSER_PROXY_PORT = "$Port" } `
  -LogPath $logPath `
  -ErrorLogPath $errorLogPath
Start-Sleep -Milliseconds 900

if (-not (Get-Process -Id ([int]$launch.pid) -ErrorAction SilentlyContinue)) {
  throw "Failed to start localhost browser proxy."
}

try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/__health" -TimeoutSec 5
  if ($health.StatusCode -ne 200) {
    throw "Health check returned status $($health.StatusCode)."
  }
} catch {
  try {
    Stop-Process -Id ([int]$launch.pid) -Force -ErrorAction Stop
  } catch {}
  throw "Localhost browser proxy failed health check: $($_.Exception.Message)"
}

$launch["port"] = $Port
$payload = $launch | ConvertTo-Json -Depth 3

$payload | Set-Content -Path $statePath -Encoding UTF8

if (-not $Quiet) {
  Write-Host "Localhost browser proxy started on http://127.0.0.1:$Port"
}
