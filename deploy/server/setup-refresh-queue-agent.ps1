param(
  [string]$RemoteRoot = "C:\srv\xjk",
  [string]$TaskName = "xjk-process-refresh-queue",
  [int]$IntervalMinutes = 1,
  [string]$TaskUser = "Admin",
  [switch]$UseSystemAccount
)

$ErrorActionPreference = "Stop"

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be >= 1."
}

$scriptPath = Join-Path $RemoteRoot "deploy\server\process-refresh-queue.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "Missing queue worker script: $scriptPath"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -RemoteRoot `"$RemoteRoot`""
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$repeatingTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).Date.AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$principal = if ($UseSystemAccount) {
  New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
} else {
  New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType S4U -RunLevel Highest
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($startupTrigger, $repeatingTrigger) -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Worker: $scriptPath"
Write-Output "Runs as: $(if ($UseSystemAccount) { 'SYSTEM' } else { $TaskUser })"
