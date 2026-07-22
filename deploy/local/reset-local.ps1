param(
  [switch]$SkipInstall,
  [switch]$NoStart,
  [switch]$KeepLogs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$dataDir = Join-Path $repoRoot "sites\altered.xjk.yt\data"
$logDir = Join-Path $scriptDir "logs"
$pidFile = Join-Path $scriptDir ".local-pids.json"

function Remove-IfExists {
  param(
    [string]$Path,
    [switch]$Recurse
  )
  if (-not (Test-Path $Path)) { return }
  if ($Recurse) {
    Remove-Item -Path $Path -Recurse -Force -ErrorAction Stop
  } else {
    Remove-Item -Path $Path -Force -ErrorAction Stop
  }
}

Write-Host "Stopping local stack..."
try {
  & (Join-Path $scriptDir "stop-local.ps1") -Quiet
} catch { }

Write-Host "Removing local data files..."
if (Test-Path $dataDir) {
  Get-ChildItem -Path $dataDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.Name
    if (
      $name -like "altered-service.sqlite*" -or
      $name -like "altered-tracker.sqlite*" -or
      $name -like "altered-tracker-leaderboard.sqlite*" -or
      $name -like "tracker-aggregator.sqlite*" -or
      $name -like "nadeo-token-cache*.json"
    ) {
      Remove-IfExists -Path $_.FullName
    }
  }
}

Write-Host "Cleaning local runtime metadata..."
Remove-IfExists -Path $pidFile

if (-not $KeepLogs) {
  if (Test-Path $logDir) {
    Get-ChildItem -Path $logDir -File -ErrorAction SilentlyContinue | ForEach-Object {
      Remove-IfExists -Path $_.FullName
    }
  }
}

Write-Host "Local reset complete."

if (-not $NoStart) {
  Write-Host "Starting local stack..."
  $startScript = Join-Path $scriptDir "start-local.ps1"
  if ($SkipInstall) {
    & $startScript -SkipInstall
  } else {
    & $startScript
  }
}
