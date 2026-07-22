param(
  [string]$RepoPath = "D:\srv\xjk",
  [string[]]$ServiceName = @(),
  [switch]$Force,
  [switch]$NoDownload
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-catalog.ps1")
. (Join-Path $PSScriptRoot "winsw-operations.ps1")

$repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath

$winswTemplate = Get-XjkWinSWTemplate -RepoPath $repoRoot -NoDownload:$NoDownload
$services = Get-XjkServiceCatalog -RepoPath $repoRoot

if ($ServiceName.Count -gt 0) {
  $wanted = @{}
  foreach ($name in $ServiceName) {
    $wanted[$name] = $true
  }
  $services = @($services | Where-Object { $wanted.ContainsKey($_.Name) })
}

if ($services.Count -eq 0) {
  throw "No matching xjk services found."
}

Assert-XjkProductionCredentials -RepoPath $repoRoot -ServiceName @($services | ForEach-Object { $_.Name })

$isAdministrator = Test-XjkIsAdministrator
if (-not $isAdministrator) {
  $missingServices = @(
    $services |
      Where-Object { -not (Get-Service -Name $_.Name -ErrorAction SilentlyContinue) } |
      ForEach-Object { $_.Name }
  )

  if ($Force -or $missingServices.Count -gt 0) {
    throw "Installing or force-updating Windows services requires an elevated PowerShell session. Missing services: $($missingServices -join ', ')"
  }

  Write-Host "Not elevated; all requested WinSW services already exist, so service installation/config update is skipped."
  return
}

foreach ($service in $services) {
  $files = Write-XjkWinSWServiceFiles `
    -RepoPath $repoRoot `
    -WinSWTemplatePath $winswTemplate `
    -Service $service `
    -Force:$Force
  $existing = Get-Service -Name $service.Name -ErrorAction SilentlyContinue

  if ($existing) {
    Write-Host "Updated WinSW config for $($service.Name) on port $($service.Port)"
    continue
  }

  Write-Host "Installing Windows service $($service.Name) on port $($service.Port)"
  Install-XjkWinSWService -Files $files -Name $service.Name
}

Write-Host "WinSW service installation/config update complete."
