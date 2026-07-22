param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$backupPath = Join-Path $scriptDir ".localhost-browser-proxy-settings.json"
. (Join-Path $scriptDir "browser-proxy-settings.ps1")

if (Test-Path $backupPath) {
  $backup = Get-Content $backupPath -Raw | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace([string]$backup.previous_auto_config_url)) {
    Remove-ItemProperty -Path $registryPath -Name AutoConfigURL -ErrorAction SilentlyContinue
  } else {
    Set-ItemProperty -Path $registryPath -Name AutoConfigURL -Value ([string]$backup.previous_auto_config_url)
  }

  Remove-Item -Path $backupPath -Force -ErrorAction SilentlyContinue
} else {
  Remove-ItemProperty -Path $registryPath -Name AutoConfigURL -ErrorAction SilentlyContinue
}

Update-XjkWinInetSettings
& (Join-Path $scriptDir "stop-localhost-browser-proxy.ps1") -Quiet

Write-Host "Disabled the *.localhost browser PAC and stopped the local proxy."
