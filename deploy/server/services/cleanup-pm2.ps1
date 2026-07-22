param(
  [switch]$KillKnownPortListeners
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\..\powershell-runtime.ps1")

$pm2 = Resolve-XjkCommandPath -Name "pm2" -FallbackPaths @(
  $env:XJK_PM2_PATH,
  $(if ($env:APPDATA) { Join-Path $env:APPDATA "npm\pm2.cmd" })
)

if ($pm2) {
  Write-Host "Stopping PM2 apps"
  & $pm2 stop all
  & $pm2 delete all
  & $pm2 kill
} else {
  Write-Host "PM2 command not found; skipping PM2 daemon cleanup."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$manifestPath = Join-Path $repoRoot "config\platform-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$knownPorts = @($manifest.services | ForEach-Object { [int]$_.ports.production } | Sort-Object -Unique)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $knownPorts -contains $_.LocalPort })

if ($listeners.Count -eq 0) {
  Write-Host "No listeners found on known xjk app ports."
  exit 0
}

foreach ($listener in $listeners) {
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  $processName = if ($process) { $process.ProcessName } else { "unknown" }
  Write-Host "Port $($listener.LocalPort) is owned by PID $($listener.OwningProcess) ($processName)"

  if ($KillKnownPortListeners -and $process -and $process.ProcessName -eq "node") {
    Write-Host "Stopping stale node listener PID $($process.Id) on port $($listener.LocalPort)"
    Stop-Process -Id $process.Id -Force
  }
}

if (-not $KillKnownPortListeners) {
  Write-Host "Rerun with -KillKnownPortListeners to stop node.exe listeners on known xjk ports."
}
