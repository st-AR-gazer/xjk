param(
  [int]$Port = 8877
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$registryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$backupPath = Join-Path $scriptDir ".localhost-browser-proxy-settings.json"
$pacUrl = "http://127.0.0.1:$Port/proxy.pac"
. (Join-Path $scriptDir "browser-proxy-settings.ps1")

& (Join-Path $scriptDir "start-localhost-browser-proxy.ps1") -Port $Port -Quiet

$current = Get-ItemProperty -Path $registryPath

if ($current.AutoConfigURL -ne $pacUrl) {
  if (-not (Test-Path $backupPath)) {
    $backup = @{
      previous_auto_config_url = [string]$current.AutoConfigURL
      saved_at = (Get-Date).ToString("s")
      managed_pac_url = $pacUrl
    } | ConvertTo-Json -Depth 3

    $backup | Set-Content -Path $backupPath -Encoding UTF8
  }

  Set-ItemProperty -Path $registryPath -Name AutoConfigURL -Value $pacUrl
}

Update-XjkWinInetSettings

Write-Host "Enabled browser PAC for *.localhost via $pacUrl"
Write-Host "If Firefox is already open, restart it to pick up the new proxy settings."
