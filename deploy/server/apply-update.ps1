param(
  [string]$RepoPath = "D:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipGit,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "deploy/Caddyfile",
  [switch]$SkipServices,
  [switch]$SkipHealthCheck,
  [switch]$SkipCaddy,
  [switch]$IncludePublicHealthChecks
)

$ErrorActionPreference = "Stop"

$winswApplyScript = Join-Path $PSScriptRoot "apply-update-winsw.ps1"
if (-not (Test-Path -LiteralPath $winswApplyScript)) {
  throw "Missing WinSW deployment script: $winswApplyScript"
}

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $winswApplyScript,
  "-RepoPath",
  $RepoPath,
  "-Branch",
  $Branch,
  "-CaddyConfigPath",
  $CaddyConfigPath
)

if ($SkipGit) { $arguments += "-SkipGit" }
if ($SkipInstall) { $arguments += "-SkipInstall" }
if ($ForceInstall) { $arguments += "-ForceInstall" }
if ($SkipServices) { $arguments += "-SkipServices" }
if ($SkipHealthCheck) { $arguments += "-SkipHealthCheck" }
if ($SkipCaddy) { $arguments += "-SkipCaddy" }
if ($IncludePublicHealthChecks) { $arguments += "-IncludePublicHealthChecks" }

& powershell @arguments
exit $LASTEXITCODE
