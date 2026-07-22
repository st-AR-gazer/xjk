param(
  [switch]$SkipInstall,
  [switch]$UseMirrorData,
  [int]$GatewayPort = 0
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "platform-manifest.ps1")
$localStack = Resolve-XjkLocalStackConfiguration -BoundParameters $PSBoundParameters -RepoRoot $repoRoot

Write-Host "Stopping local stack..."
try {
  & (Join-Path $scriptDir "stop-local.ps1") -Quiet
} catch { }

Write-Host "Starting local stack..."
$startScript = Join-Path $scriptDir "start-local.ps1"
$startArgs = @("-ShowConsole", "-GatewayPort", "$($localStack.GatewayPort)")
if ($SkipInstall) { $startArgs += "-SkipInstall" }
if ($UseMirrorData) { $startArgs += "-UseMirrorData" }

& powershell -ExecutionPolicy Bypass -File $startScript @startArgs
