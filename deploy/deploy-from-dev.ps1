param(
  [string]$Server = "user@your-server",
  [string]$RemoteRepoPath = "C:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipPush,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "deploy/Caddyfile"
)

$ErrorActionPreference = "Stop"

if (-not $SkipPush) {
  Write-Host "Pushing branch $Branch"
  git push origin $Branch
}

$applyScript = "$RemoteRepoPath\deploy\server\apply-update.ps1"
$remoteParts = @(
  "powershell -NoProfile -ExecutionPolicy Bypass",
  "-File `"$applyScript`"",
  "-RepoPath `"$RemoteRepoPath`"",
  "-Branch `"$Branch`"",
  "-CaddyConfigPath `"$CaddyConfigPath`""
)

if ($SkipInstall) {
  $remoteParts += "-SkipInstall"
}

if ($ForceInstall) {
  $remoteParts += "-ForceInstall"
}

$remoteCmd = $remoteParts -join " "

Write-Host "Running remote deployment on $Server"
ssh $Server $remoteCmd
