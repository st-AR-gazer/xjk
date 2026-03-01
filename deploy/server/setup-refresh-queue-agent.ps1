param(
  [string]$RemoteRoot = "C:\srv\xjk",
  [string]$TaskName = "xjk-process-refresh-queue",
  [int]$IntervalMinutes = 1
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
$repeatingTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1)
$repeatingTrigger.Repetition.Interval = New-TimeSpan -Minutes $IntervalMinutes
$repeatingTrigger.Repetition.Duration = New-TimeSpan -Days 3650
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($startupTrigger, $repeatingTrigger) -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "Installed scheduled task: $TaskName"
Write-Output "Worker: $scriptPath"
