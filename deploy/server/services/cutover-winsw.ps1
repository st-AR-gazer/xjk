param(
  [string]$RepoPath = "D:\srv\xjk",
  [string]$CaddyConfigPath = "deploy\Caddyfile.tunnel",
  [string]$CloudflaredTokenFile = "C:\ProgramData\xjk\Cloudflared-token.txt",
  [string]$OldCloudflaredServiceName = "Cloudflared",
  [switch]$SkipBackendDeploy,
  [switch]$RemoveAllNssmServices,
  [switch]$SkipPublicChecks,
  [switch]$KeepNginxFolder,
  [switch]$KeepNssmFolder
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\..\powershell-runtime.ps1")
. (Join-Path $PSScriptRoot "winsw-operations.ps1")

function Test-XjkIsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-XjkAdministrator {
  if (-not (Test-XjkIsAdministrator)) {
    throw "Run this cutover from an elevated PowerShell session."
  }
}

function Invoke-XjkHttpCheck {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastError = $null

  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Host "OK $Url HTTP $($response.StatusCode)"
        return
      }
      $lastError = "HTTP $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 3
  }

  throw "Health check failed for ${Url}: $lastError"
}

function Rename-XjkDirectoryForRemoval {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Prefix
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $parent = Split-Path -Parent $Path
  $target = Join-Path $parent ($Prefix + ".removed-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Write-Host "Renaming $Path to $target"
  Rename-Item -LiteralPath $Path -NewName (Split-Path -Leaf $target)
}

function Get-XjkNssmBackedServices {
  return @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'nssm\.exe|\\nssm\\|nssm' })
}

Assert-XjkAdministrator

$repoRoot = (Resolve-Path -LiteralPath $RepoPath).Path
$applyScript = Join-Path $repoRoot "deploy\server\apply-update-winsw.ps1"
$installInfraScript = Join-Path $repoRoot "deploy\server\services\install-infrastructure-services.ps1"
$healthScript = Join-Path $repoRoot "deploy\server\services\health-check.ps1"

foreach ($script in @($applyScript, $installInfraScript, $healthScript)) {
  if (-not (Test-Path -LiteralPath $script)) {
    throw "Missing required cutover script: $script"
  }
}

Write-Host "Pre-cutover supervisor inventory"
Get-CimInstance Win32_Service |
  Where-Object { $_.PathName -match 'nssm|nginx|caddy|cloudflared|winsw|xjk' -or $_.Name -match '^xjk|nginx|Cloudflared|caddy' } |
  Select-Object Name, State, StartMode |
  Sort-Object Name |
  Format-Table -AutoSize

if ($SkipBackendDeploy) {
  Write-Host "Skipping backend dependency install/service restart; checking existing backend health"
  Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $healthScript,
    "-RepoPath",
    $repoRoot
  ) -Label "health-check.ps1"
} else {
  Write-Host "Installing dependencies, WinSW backend services, and required backend health checks"
  Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $applyScript,
    "-RepoPath",
    $repoRoot,
    "-SkipGit",
    "-CaddyConfigPath",
    $CaddyConfigPath
  ) -Label "apply-update-winsw.ps1"
}

Write-Host "Migrating xjk-caddy from NSSM to WinSW"
Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $installInfraScript,
  "-RepoPath",
  $repoRoot,
  "-ServiceName",
  "xjk-caddy",
  "-CaddyConfigPath",
  $CaddyConfigPath,
  "-CloudflaredTokenFile",
  $CloudflaredTokenFile,
  "-ReplaceExistingNssm"
) -Label "install-infrastructure-services.ps1 xjk-caddy"

Write-Host "Preparing xjk-cloudflared WinSW service"
Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $installInfraScript,
  "-RepoPath",
  $repoRoot,
  "-ServiceName",
  "xjk-cloudflared",
  "-CaddyConfigPath",
  $CaddyConfigPath,
  "-CloudflaredTokenFile",
  $CloudflaredTokenFile,
  "-NoStart"
) -Label "install-infrastructure-services.ps1 xjk-cloudflared"

Write-Host "Migrating Cloudflared from NSSM to WinSW"
$oldCloudflared = Get-CimInstance Win32_Service -Filter "Name = '$OldCloudflaredServiceName'" -ErrorAction SilentlyContinue
if ($oldCloudflared) {
  $oldService = Get-Service -Name $OldCloudflaredServiceName -ErrorAction SilentlyContinue
  if ($oldService -and $oldService.Status -ne "Stopped") {
    Stop-Service -Name $OldCloudflaredServiceName -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
  }
}

$newCloudflared = Get-Service -Name "xjk-cloudflared" -ErrorAction Stop
if ($newCloudflared.Status -eq "Running") {
  Restart-Service -Name "xjk-cloudflared" -Force
} else {
  Start-Service -Name "xjk-cloudflared"
}

if ($oldCloudflared) {
  Remove-XjkService -Name $OldCloudflaredServiceName
}

Write-Host "Rechecking required local backend health"
Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $healthScript,
  "-RepoPath",
  $repoRoot
) -Label "health-check.ps1"

if (-not $SkipPublicChecks) {
  Write-Host "Checking public routes"
  Invoke-XjkHttpCheck -Url "https://aggregator.xjk.yt/api/v1/meta"
  Invoke-XjkHttpCheck -Url "https://aggregator.xjk.yt/api/catalog.json"
  Invoke-XjkHttpCheck -Url "https://altered.xjk.yt/bannerbuilder/"
}

Write-Host "Removing nginx service and renaming nginx install folder"
Remove-XjkService -Name "nginx"
if (-not $KeepNginxFolder) {
  Rename-XjkDirectoryForRemoval -Path "C:\nginx" -Prefix "nginx"
}

$remainingNssm = Get-XjkNssmBackedServices
if ($remainingNssm.Count -gt 0) {
  Write-Host "Remaining NSSM-backed services:"
  $remainingNssm | Select-Object Name, State, StartMode | Sort-Object Name | Format-Table -AutoSize

  if ($RemoveAllNssmServices) {
    foreach ($svc in $remainingNssm) {
      Remove-XjkService -Name $svc.Name
    }
  } else {
    Write-Host "Leaving non-xjk NSSM services in place. Rerun with -RemoveAllNssmServices to remove them."
  }
}

$remainingNssm = Get-XjkNssmBackedServices
if ($remainingNssm.Count -eq 0 -and -not $KeepNssmFolder) {
  Rename-XjkDirectoryForRemoval -Path "C:\nssm" -Prefix "nssm"
} elseif ($remainingNssm.Count -gt 0) {
  Write-Host "Not renaming C:\nssm because NSSM-backed services still exist."
}

Write-Host "Final supervisor inventory"
Get-CimInstance Win32_Service |
  Where-Object { $_.PathName -match 'nssm|nginx|caddy|cloudflared|winsw|xjk' -or $_.Name -match '^xjk|nginx|Cloudflared|caddy' } |
  Select-Object Name, State, StartMode |
  Sort-Object Name |
  Format-Table -AutoSize

Write-Host "Cutover complete."
