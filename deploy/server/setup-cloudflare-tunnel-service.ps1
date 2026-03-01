param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelToken,
  [string]$ServiceName = "xjk-cloudflared",
  [string]$DisplayName = "xjk Cloudflare Tunnel",
  [switch]$Recreate,
  [switch]$NoStart,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]$identity
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "Run this script from an elevated (Administrator) PowerShell prompt."
  }
}

function Resolve-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $fallbacks = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files\Cloudflare\Cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
  )

  foreach ($candidate in $fallbacks) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  if ($SkipInstall) {
    throw "cloudflared was not found. Install it first, then rerun this script."
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "cloudflared was not found and winget is unavailable for auto-install."
  }

  Write-Host "Installing cloudflared via winget (Cloudflare.cloudflared)"
  winget install --id Cloudflare.cloudflared -e --source winget
  if ($LASTEXITCODE -ne 0) {
    throw "winget install failed with exit code $LASTEXITCODE."
  }

  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  foreach ($candidate in $fallbacks) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "cloudflared install completed but executable was not found in PATH."
}

Assert-Administrator

$token = $TunnelToken.Trim()
if (-not $token) {
  throw "Tunnel token is empty."
}
$token = $token.Replace('"', "")

$cloudflaredExe = Resolve-CloudflaredPath
Write-Host "Using cloudflared binary: $cloudflaredExe"

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($existingService -and $Recreate) {
  Write-Host "Recreating existing service: $ServiceName"
  if ($existingService.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
  }
  sc.exe delete $ServiceName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to delete service $ServiceName."
  }
  Start-Sleep -Seconds 1
  $existingService = $null
}

$binPath = "`"$cloudflaredExe`" --no-autoupdate tunnel run --token $token"

if ($existingService) {
  Write-Host "Updating existing service: $ServiceName"
  sc.exe config $ServiceName "binPath= $binPath" "start= auto" "displayname= $DisplayName" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to update service $ServiceName."
  }
} else {
  Write-Host "Creating service: $ServiceName"
  sc.exe create $ServiceName "binPath= $binPath" "start= auto" "displayname= $DisplayName" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create service $ServiceName."
  }
}

if (-not $NoStart) {
  Start-Service -Name $ServiceName
}

$service = Get-Service -Name $ServiceName
Write-Host "Service status: $($service.Status)"
Write-Host "Done."
