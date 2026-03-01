param(
  [string]$RepoUrl = "git@github.com:YOUR_ORG/YOUR_REPO.git",
  [string]$RepoPath = "C:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipFirewallRules,
  [switch]$InstallCloudflareTunnel,
  [string]$TunnelToken = "",
  [string]$TunnelServiceName = "xjk-cloudflared",
  [string]$TunnelDisplayName = "xjk Cloudflare Tunnel",
  [string]$CaddyConfigPath = "deploy/Caddyfile"
)

$ErrorActionPreference = "Stop"

function Ensure-Command {
  param(
    [string]$Name,
    [string]$WingetId
  )

  if (Get-Command $Name -ErrorAction SilentlyContinue) {
    Write-Host "$Name already installed."
    return
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required to install $Name automatically."
  }

  Write-Host "Installing $Name ($WingetId)"
  winget install --id $WingetId -e --source winget
}

$resolvedCaddyConfig = if ([System.IO.Path]::IsPathRooted($CaddyConfigPath)) {
  $CaddyConfigPath
} else {
  Join-Path $RepoPath $CaddyConfigPath
}

Write-Host "Ensuring prerequisites"
Ensure-Command -Name git -WingetId Git.Git
Ensure-Command -Name node -WingetId OpenJS.NodeJS.LTS
Ensure-Command -Name caddy -WingetId CaddyServer.Caddy

if ($InstallCloudflareTunnel) {
  Ensure-Command -Name cloudflared -WingetId Cloudflare.cloudflared
}

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  Write-Host "Installing pm2 globally"
  npm install -g pm2
}

if (Test-Path $RepoPath) {
  Write-Host "Repo path already exists. Pulling latest."
  Set-Location $RepoPath
  git fetch origin
  git checkout $Branch
  git pull --ff-only origin $Branch
} else {
  Write-Host "Cloning repository"
  New-Item -ItemType Directory -Path (Split-Path $RepoPath -Parent) -Force | Out-Null
  git clone --branch $Branch $RepoUrl $RepoPath
  Set-Location $RepoPath
}

New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/learn.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/altered.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/tracker.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/trackers.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/tracker-displayname.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/tracker-club.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/aggregator.xjk.yt/frontend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/altered.xjk.yt/data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "sites/plugins.xjk.yt/Plugins-Hub/frontend") | Out-Null

$toolBinaryDirs = @(
  "sites/tools.xjk.yt/Strip-RaceValidationGhost/tools",
  "sites/tools.xjk.yt/Embed-RaceValidationGhost/tools",
  "sites/tools.xjk.yt/Embedded-Blocks-And-Items-Checker/tools",
  "sites/tools.xjk.yt/Extract-Replay-Data/tools",
  "sites/tools.xjk.yt/Gbx-Medal-Time-Modifier/tools",
  "sites/tools.xjk.yt/Map-Validation-Checker/tools"
)

foreach ($dir in $toolBinaryDirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath $dir) | Out-Null
}

Write-Host "Installing backend dependencies"
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
  npm ci --prefix $full
}

Write-Host "Starting PM2 apps"
pm2 startOrReload (Join-Path $RepoPath "deploy/server/ecosystem.config.cjs") --update-env
pm2 save

$caddyExe = (Get-Command caddy).Source
$serviceName = "xjk-caddy"

if (-not (Test-Path $resolvedCaddyConfig)) {
  throw "Caddy config file not found: $resolvedCaddyConfig"
}

if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
  Write-Host "Creating Caddy Windows service: $serviceName"
  New-Service -Name $serviceName `
    -DisplayName "xjk Caddy" `
    -BinaryPathName "`"$caddyExe`" run --config `"$resolvedCaddyConfig`"" `
    -StartupType Automatic | Out-Null
}

Write-Host "Validating Caddy config"
caddy validate --config $resolvedCaddyConfig

$svc = Get-Service -Name $serviceName
if ($svc.Status -eq "Running") {
  Write-Host "Reloading Caddy"
  caddy reload --config $resolvedCaddyConfig
} else {
  Write-Host "Starting Caddy service"
  Start-Service -Name $serviceName
}

$shouldOpenFirewall = -not $SkipFirewallRules
if ($InstallCloudflareTunnel) {
  $shouldOpenFirewall = $false
}

if ($shouldOpenFirewall) {
  Write-Host "Opening firewall ports 80/443"
  if (-not (Get-NetFirewallRule -DisplayName "xjk-http-80" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "xjk-http-80" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80 | Out-Null
  }
  if (-not (Get-NetFirewallRule -DisplayName "xjk-https-443" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "xjk-https-443" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 | Out-Null
  }
} else {
  Write-Host "Skipping firewall rules for ports 80/443."
}

if ($InstallCloudflareTunnel) {
  if (-not $TunnelToken) {
    throw "InstallCloudflareTunnel was set, but TunnelToken is empty."
  }

  $tunnelSetupScript = Join-Path $RepoPath "deploy/server/setup-cloudflare-tunnel-service.ps1"
  if (!(Test-Path $tunnelSetupScript)) {
    throw "Missing tunnel setup script: $tunnelSetupScript"
  }

  Write-Host "Configuring Cloudflare Tunnel service: $TunnelServiceName"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $tunnelSetupScript `
    -TunnelToken $TunnelToken `
    -ServiceName $TunnelServiceName `
    -DisplayName $TunnelDisplayName
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Copy required tool binaries into the corresponding folders under:"
Write-Host (Join-Path $RepoPath "sites/tools.xjk.yt")
Write-Host ""
Write-Host "Required files:"
Write-Host "  Strip-RaceValidationGhost/tools/stripValidationReplay.exe"
Write-Host "  Strip-RaceValidationGhost/tools/gbxlzo.exe"
Write-Host "  Embed-RaceValidationGhost/tools/EmbedRaceValidationGhost.exe"
Write-Host "  Embed-RaceValidationGhost/tools/ReplayDataExtractor.exe"
Write-Host "  Embedded-Blocks-And-Items-Checker/tools/EmbeddedBlocksAndItemsChecker.exe"
Write-Host "  Extract-Replay-Data/tools/ReplayDataExtractor.exe"
Write-Host "  Gbx-Medal-Time-Modifier/tools/GbxMedalTimeModifier.exe"
Write-Host "  Map-Validation-Checker/tools/MapValidationChecker.exe"
Write-Host ""
Write-Host "Then run:"
Write-Host "powershell -ExecutionPolicy Bypass -File $RepoPath\\deploy\\server\\apply-update.ps1 -RepoPath $RepoPath -Branch $Branch -SkipGit -CaddyConfigPath `"$CaddyConfigPath`""
