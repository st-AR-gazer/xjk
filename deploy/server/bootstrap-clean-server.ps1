param(
  [string]$RepoUrl = "git@github.com:YOUR_ORG/YOUR_REPO.git",
  [string]$RepoPath = "D:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipFirewallRules,
  [switch]$InstallCloudflareTunnel,
  [string]$TunnelTokenFile = "C:\ProgramData\xjk\Cloudflared-token.txt",
  [string]$CaddyConfigPath = "deploy/Caddyfile"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\platform-manifest.ps1")
. (Join-Path $PSScriptRoot "cloudflare-token.ps1")

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
Ensure-Command -Name python -WingetId Python.Python.3.12
Ensure-Command -Name caddy -WingetId CaddyServer.Caddy

if ($InstallCloudflareTunnel) {
  Ensure-Command -Name cloudflared -WingetId Cloudflare.cloudflared
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

$platformManifest = Get-XjkPlatformManifest -RepoRoot $RepoPath
$siteDirectories = @($platformManifest.sites | ForEach-Object { [string]$_.frontend } | Sort-Object -Unique)
foreach ($directory in $siteDirectories) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath $directory) | Out-Null
}
foreach ($directory in @("sites/learn.xjk.yt/data", "sites/altered.xjk.yt/data")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath $directory) | Out-Null
}

$toolBinaryDirs = @(
  $platformManifest.tools |
    Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.serviceId) } |
    ForEach-Object { "sites/tools.xjk.yt/$(([string]$_.path).Trim('/'))/tools" } |
    Sort-Object -Unique
)

foreach ($dir in $toolBinaryDirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath $dir) | Out-Null
}

Write-Host "Installing backend dependencies"
$backendDirs = Get-XjkNodeServiceDirectories -RepoRoot $RepoPath

foreach ($dir in $backendDirs) {
  $full = Join-Path $RepoPath $dir
  if (-not (Test-Path -LiteralPath (Join-Path $full "package.json") -PathType Leaf)) {
    throw "Managed Node service is missing package.json: $dir"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $full "package-lock.json") -PathType Leaf)) {
    throw "Managed Node service is missing package-lock.json: $dir"
  }
  npm ci --prefix $full
}

$bannerBuilderDir = Join-Path $RepoPath "services/bannerbuilder"
if (Test-Path $bannerBuilderDir) {
  Write-Host "Installing legacy banner builder Python dependencies"
  $venvDir = Join-Path $bannerBuilderDir ".venv"
  $venvPython = Join-Path $venvDir "Scripts\python.exe"
  $venvOk = $false
  if (Test-Path $venvPython) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & $venvPython --version *> $null
      $venvOk = ($LASTEXITCODE -eq 0)
    } catch {
      $venvOk = $false
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  }
  if (-not $venvOk) {
    if (Test-Path $venvDir) {
      Write-Host "Removing broken bannerbuilder Python venv"
      Remove-Item -LiteralPath $venvDir -Recurse -Force
    }
    python -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create bannerbuilder Python venv."
    }
  }
  & $venvPython -m pip install -r (Join-Path $bannerBuilderDir "requirements.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install bannerbuilder Python dependencies."
  }
}

Write-Host "Installing WinSW backend services"
$installServicesScript = Join-Path $RepoPath "deploy/server/services/install-services.ps1"
$restartServicesScript = Join-Path $RepoPath "deploy/server/services/restart-services.ps1"
$healthCheckScript = Join-Path $RepoPath "deploy/server/services/health-check.ps1"

& powershell -NoProfile -ExecutionPolicy Bypass -File $installServicesScript -RepoPath $RepoPath
if ($LASTEXITCODE -ne 0) {
  throw "install-services.ps1 failed with exit code $LASTEXITCODE"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $restartServicesScript -RepoPath $RepoPath
if ($LASTEXITCODE -ne 0) {
  throw "restart-services.ps1 failed with exit code $LASTEXITCODE"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $healthCheckScript -RepoPath $RepoPath
if ($LASTEXITCODE -ne 0) {
  throw "health-check.ps1 failed with exit code $LASTEXITCODE"
}

$caddyExe = (Get-Command caddy).Source
$serviceName = "xjk-caddy"
$installInfraScript = Join-Path $RepoPath "deploy/server/services/install-infrastructure-services.ps1"

if (-not (Test-Path $resolvedCaddyConfig)) {
  throw "Caddy config file not found: $resolvedCaddyConfig"
}

if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Caddy WinSW service: $serviceName"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $installInfraScript `
    -RepoPath $RepoPath `
    -ServiceName $serviceName `
    -CaddyConfigPath $CaddyConfigPath `
    -NoStart
  if ($LASTEXITCODE -ne 0) {
    throw "install-infrastructure-services.ps1 failed with exit code $LASTEXITCODE"
  }
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
  $resolvedTokenFile = Initialize-XjkCloudflaredTokenFile -Path $TunnelTokenFile

  Write-Host "Configuring Cloudflare Tunnel WinSW service: xjk-cloudflared"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $installInfraScript `
    -RepoPath $RepoPath `
    -ServiceName "xjk-cloudflared" `
    -CaddyConfigPath $CaddyConfigPath `
    -CloudflaredTokenFile $resolvedTokenFile
  if ($LASTEXITCODE -ne 0) {
    throw "install-infrastructure-services.ps1 failed with exit code $LASTEXITCODE"
  }
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Restore the checksum-pinned tool runtime:"
Write-Host "powershell -NoProfile -ExecutionPolicy Bypass -File $RepoPath\\deploy\\tool-runtime\\restore-tool-runtime.ps1 -RepoPath $RepoPath"
Write-Host ""
Write-Host "Then apply the service update:"
Write-Host "powershell -ExecutionPolicy Bypass -File $RepoPath\\deploy\\server\\apply-update-winsw.ps1 -RepoPath $RepoPath -Branch $Branch -SkipGit -CaddyConfigPath `"$CaddyConfigPath`""
