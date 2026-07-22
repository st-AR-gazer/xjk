param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$statePath = Join-Path $scriptDir ".localhost-browser-proxy.json"
. (Join-Path $scriptDir "process-ownership.ps1")

if (-not (Test-Path $statePath)) {
  if (-not $Quiet) {
    Write-Host "Localhost browser proxy is not running."
  }
  exit 0
}

try {
  $state = Get-Content $statePath -Raw | ConvertFrom-Json
} catch {
  Remove-Item -Path $statePath -Force -ErrorAction SilentlyContinue
  if (-not $Quiet) {
    Write-Host "Localhost browser proxy state was invalid and has been cleared."
  }
  exit 0
}

if ($state.pid) {
  $process = Get-XjkLocalProcessSnapshot -ProcessId ([int]$state.pid)
  $owned = Test-XjkLocalProcessOwnership `
    -Process $process `
    -RepoRoot $repoRoot `
    -ExpectedPid ([int]$state.pid) `
    -ExecutablePath ([string]$state.executable) `
    -EntryPoint ([string]$state.entrypoint) `
    -CreatedAt ([string]$state.created_at)
  if ($owned) {
    Stop-Process -Id ([int]$state.pid) -Force -ErrorAction Stop
    if (-not $Quiet) {
      Write-Host "Stopped localhost browser proxy PID $($state.pid)."
    }
  } elseif (-not $Quiet) {
    Write-Host "Refused to stop PID $($state.pid): saved ownership metadata did not match the live process." -ForegroundColor Yellow
  }
}

Remove-Item -Path $statePath -Force -ErrorAction SilentlyContinue
