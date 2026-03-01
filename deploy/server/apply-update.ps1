param(
  [string]$RepoPath = "C:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipGit,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "deploy/Caddyfile"
)

$ErrorActionPreference = "Stop"

Write-Host "RepoPath: $RepoPath"
Write-Host "Branch:   $Branch"
Write-Host "SkipGit:  $SkipGit"
Write-Host "SkipInstall: $SkipInstall"
Write-Host "ForceInstall: $ForceInstall"

if (!(Test-Path $RepoPath)) {
  throw "Repo path does not exist: $RepoPath"
}

Set-Location $RepoPath

$beforeHead = ""
$afterHead = ""
$changedFiles = @()

if (-not $SkipGit) {
  $beforeHead = (git rev-parse HEAD).Trim()
  git fetch origin
  git checkout $Branch
  git pull --ff-only origin $Branch
  $afterHead = (git rev-parse HEAD).Trim()

  if ($beforeHead -and $afterHead -and ($beforeHead -ne $afterHead)) {
    $changedFiles = git diff --name-only "$beforeHead..$afterHead" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }
}

$normalizedChangedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($file in $changedFiles) {
  [void]$normalizedChangedFiles.Add(($file -replace "\\", "/"))
}

if ($beforeHead -and $afterHead) {
  Write-Host "Previous HEAD: $beforeHead"
  Write-Host "Current  HEAD: $afterHead"
}

if ($changedFiles.Count -gt 0) {
  Write-Host "Detected $($changedFiles.Count) changed file(s) in pulled range."
}

function Should-InstallDependencies {
  param(
    [string]$BackendDir,
    [string]$BackendPath
  )

  if ($ForceInstall) {
    return $true
  }

  if ($SkipInstall) {
    return $false
  }

  $nodeModulesPath = Join-Path $BackendPath "node_modules"
  if (!(Test-Path $nodeModulesPath)) {
    return $true
  }

  if ($SkipGit) {
    return $true
  }

  if ($normalizedChangedFiles.Count -eq 0) {
    return $false
  }

  $normalizedBackendDir = $BackendDir -replace "\\", "/"
  $packageJson = "$normalizedBackendDir/package.json"
  $packageLock = "$normalizedBackendDir/package-lock.json"

  return $normalizedChangedFiles.Contains($packageJson) -or $normalizedChangedFiles.Contains($packageLock)
}

$backendDirs = @(
  "services/altered",
  "services/tracker",
  "services/aggregator",
  "services/tracker-displayname",
  "services/tracker-club",
  "sites/plugins.xjk.yt/Plugins-Hub/backend",
  "sites/tools.xjk.yt/Tools-Hub/backend",
  "sites/tools.xjk.yt/Strip-RaceValidationGhost/backend",
  "sites/tools.xjk.yt/Embed-RaceValidationGhost/backend",
  "sites/tools.xjk.yt/Embedded-Blocks-And-Items-Checker/backend",
  "sites/tools.xjk.yt/Extract-Replay-Data/backend",
  "sites/tools.xjk.yt/Gbx-Medal-Time-Modifier/backend",
  "sites/tools.xjk.yt/Map-Validation-Checker/backend"
)

foreach ($dir in $backendDirs) {
  $full = Join-Path $RepoPath $dir
  if (!(Test-Path $full)) {
    throw "Missing backend directory: $full"
  }

  if (Should-InstallDependencies -BackendDir $dir -BackendPath $full) {
    Write-Host "Installing dependencies in $full"
    npm ci --prefix $full
  } else {
    Write-Host "Skipping dependency install in $full (no lockfile changes detected)."
  }
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  throw "pm2 is not installed or not in PATH."
}

Write-Host "Reloading PM2 apps"
pm2 startOrReload (Join-Path $RepoPath "deploy/server/ecosystem.config.cjs") --update-env
pm2 save

if (-not (Get-Command caddy -ErrorAction SilentlyContinue)) {
  throw "caddy is not installed or not in PATH."
}

$resolvedCaddyConfig = if ([System.IO.Path]::IsPathRooted($CaddyConfigPath)) {
  $CaddyConfigPath
} else {
  Join-Path $RepoPath $CaddyConfigPath
}

if (!(Test-Path $resolvedCaddyConfig)) {
  throw "Caddy config file not found: $resolvedCaddyConfig"
}

Write-Host "Validating Caddy config"
caddy validate --config $resolvedCaddyConfig

Write-Host "Reloading Caddy config"
caddy reload --config $resolvedCaddyConfig

Write-Host "Deployment complete."
