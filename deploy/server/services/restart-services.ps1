param(
  [string]$RepoPath = "D:\srv\xjk",
  [string[]]$ServiceName = @(),
  [switch]$InstallMissing,
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-catalog.ps1")

function Wait-XjkServiceRunning {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [int]$TimeoutSeconds = 45
  )

  $service = Get-Service -Name $Name -ErrorAction Stop
  if ($service.Status -eq "Running") {
    return
  }

  $service.WaitForStatus("Running", [TimeSpan]::FromSeconds($TimeoutSeconds))
}

$repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
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

foreach ($service in $services) {
  $existing = Get-Service -Name $service.Name -ErrorAction SilentlyContinue

  if (-not $existing) {
    if ($InstallMissing) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "install-services.ps1") `
        -RepoPath $repoRoot `
        -ServiceName $service.Name
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to install missing service $($service.Name)"
      }
      $existing = Get-Service -Name $service.Name -ErrorAction Stop
    } else {
      throw "Windows service is not installed: $($service.Name)"
    }
  }

  if ($existing.Status -eq "Running") {
    Write-Host "Restarting $($service.Name)"
    Restart-Service -Name $service.Name -Force -ErrorAction Stop
  } else {
    Write-Host "Starting $($service.Name)"
    Start-Service -Name $service.Name -ErrorAction Stop
  }

  Wait-XjkServiceRunning -Name $service.Name -TimeoutSeconds $TimeoutSeconds
}

Write-Host "WinSW services restarted."
