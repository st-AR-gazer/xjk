param(
  [switch]$SkipInstall,
  [switch]$UseMirrorData,
  [int]$GatewayPort = 0,
  [switch]$ShowConsole
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "platform-manifest.ps1")
$localStack = Resolve-XjkLocalStackConfiguration -BoundParameters $PSBoundParameters -RepoRoot $repoRoot
$enableProxyPath = Join-Path $scriptDir "enable-localhost-browser-proxy.ps1"
$startLocalPath = Join-Path $scriptDir "start-local.ps1"

& powershell -ExecutionPolicy Bypass -File $enableProxyPath

$startArgs = @(
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $startLocalPath,
  "-GatewayPort",
  "$($localStack.GatewayPort)",
  "-DisableRemoteServerProxy",
  "-DisableRemoteAlteredProxy",
  "-DisableRemoteTrackerProxy",
  "-DisableRemoteAggregatorProxy"
)

if ($SkipInstall) {
  $startArgs += "-SkipInstall"
}

if ($UseMirrorData) {
  $startArgs += "-UseMirrorData"
}

if ($ShowConsole) {
  $startArgs += "-ShowConsole"
}

& powershell @startArgs
