param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $scriptDir ".local-pids.json"
. (Join-Path $scriptDir "process-ownership.ps1")
. (Join-Path $scriptDir "process-launch.ps1")

if (!(Test-Path $pidFile)) {
  if (-not $Quiet) { Write-Host "No local PID file found. Nothing to stop." }
  exit 0
}

$raw = Get-Content $pidFile -Raw
$state = $raw | ConvertFrom-Json
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\.."))
$stateRepoRoot = if ($state.repo_root) { [System.IO.Path]::GetFullPath([string]$state.repo_root) } else { "" }
if ([string]::IsNullOrWhiteSpace($stateRepoRoot) -or $stateRepoRoot -ine $repoRoot) {
  throw "The local PID file does not belong to this repository. Refusing to stop any process."
}

$entries = @($state.processes)
if ($state.gateway) { $entries += $state.gateway }
$stopResult = Stop-XjkOwnedRuntimeProcesses -Entries $entries -RepoRoot $repoRoot -Quiet:$Quiet
$unresolvedEntries = @($stopResult.UnresolvedEntries)
if ($unresolvedEntries.Count) {
  $startedAt = if ($state.started_at) { [string]$state.started_at } else { (Get-Date).ToUniversalTime().ToString("o") }
  Write-XjkLocalProcessState `
    -Path $pidFile `
    -RepoRoot $repoRoot `
    -StartedAt $startedAt `
    -Processes $unresolvedEntries
  throw "Could not safely stop $($unresolvedEntries.Count) recorded local-stack process(es); retained their ownership state for retry."
}

Remove-Item -LiteralPath $pidFile -Force
if (-not $Quiet) { Write-Host "Local stack stopped." }
