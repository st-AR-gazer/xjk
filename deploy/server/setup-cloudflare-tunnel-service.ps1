param(
  [string]$TunnelTokenFile = "C:\ProgramData\xjk\Cloudflared-token.txt",
  [string]$ServiceName = "xjk-cloudflared",
  [string]$DisplayName = "xjk Cloudflare Tunnel",
  [switch]$Recreate,
  [switch]$NoStart,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "cloudflare-token.ps1")

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]$identity
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell prompt."
  }
}

function Resolve-CloudflaredPath {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $fallbacks = @(
    $env:XJK_CLOUDFLARED_PATH,
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files\Cloudflare\Cloudflared\cloudflared.exe",
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe" })
  )

  foreach ($candidate in $fallbacks) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  if ($SkipInstall) {
    throw "cloudflared was not found. Install it first, then rerun this script."
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "cloudflared was not found and winget is unavailable for automatic installation."
  }

  winget install --id Cloudflare.cloudflared -e --source winget
  if ($LASTEXITCODE -ne 0) {
    throw "winget install failed with exit code $LASTEXITCODE."
  }

  return (Resolve-CloudflaredPath)
}

Assert-Administrator

$resolvedTokenFile = Initialize-XjkCloudflaredTokenFile -Path $TunnelTokenFile
$cloudflaredExe = Resolve-CloudflaredPath
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($existingService -and $Recreate) {
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

$binPath = "`"$cloudflaredExe`" --no-autoupdate tunnel run --token-file `"$resolvedTokenFile`""

if ($existingService) {
  sc.exe config $ServiceName "binPath= $binPath" "start= auto" "displayname= $DisplayName" | Out-Null
} else {
  sc.exe create $ServiceName "binPath= $binPath" "start= auto" "displayname= $DisplayName" | Out-Null
}
if ($LASTEXITCODE -ne 0) {
  throw "Failed to configure service $ServiceName."
}

if (-not $NoStart) {
  $service = Get-Service -Name $ServiceName
  if ($service.Status -eq "Running") {
    Restart-Service -Name $ServiceName -Force
  } else {
    Start-Service -Name $ServiceName
  }
}

$service = Get-Service -Name $ServiceName
Write-Host "Service status: $($service.Status)"
