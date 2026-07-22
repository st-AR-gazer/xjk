param(
  [string]$RepoPath = "D:\srv\xjk",
  [string[]]$ServiceName = @(),
  [string]$CaddyConfigPath = "deploy\Caddyfile.tunnel",
  [string]$CloudflaredTokenFile = "C:\ProgramData\xjk\Cloudflared-token.txt",
  [switch]$Force,
  [switch]$NoDownload,
  [switch]$NoStart,
  [switch]$ReplaceExistingNssm
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-catalog.ps1")
. (Join-Path $PSScriptRoot "winsw-operations.ps1")

function Remove-XjkExistingService {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $existing = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($existing -and $existing.Status -ne "Stopped") {
    Stop-Service -Name $Name -Force -ErrorAction Stop
  }

  sc.exe delete $Name | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to delete existing service $Name."
  }

  Start-Sleep -Seconds 2
}

$repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
Assert-XjkAdministrator -Operation "Installing Windows services"

$winswTemplate = Get-XjkWinSWTemplate -RepoPath $repoRoot -NoDownload:$NoDownload
$services = Get-XjkInfrastructureServiceCatalog `
  -RepoPath $repoRoot `
  -CaddyConfigPath $CaddyConfigPath `
  -CloudflaredTokenFile $CloudflaredTokenFile `
  -ServiceName $ServiceName

if ($ServiceName.Count -gt 0) {
  $wanted = @{}
  foreach ($name in $ServiceName) {
    $wanted[$name] = $true
  }
  $services = @($services | Where-Object { $wanted.ContainsKey($_.Name) })
}

if ($services.Count -eq 0) {
  throw "No matching xjk infrastructure services found."
}

if (($services.Name -contains "xjk-cloudflared") -and -not (Test-Path -LiteralPath $CloudflaredTokenFile)) {
  throw "Cloudflared token file not found: $CloudflaredTokenFile"
}

$serviceRoot = Get-XjkWinSwServiceRoot -RepoPath $repoRoot

foreach ($service in $services) {
  $files = Write-XjkWinSWServiceFiles `
    -RepoPath $repoRoot `
    -WinSWTemplatePath $winswTemplate `
    -Service $service `
    -Force:$Force
  $existingService = Get-CimInstance Win32_Service -Filter "Name = '$($service.Name)'" -ErrorAction SilentlyContinue

  if ($existingService) {
    $isWinsw = $existingService.PathName -and
      ($existingService.PathName -replace '"', '') -like "$serviceRoot*"
    $isNssm = $existingService.PathName -match 'nssm'

    if ($isWinsw) {
      Write-Host "Updated WinSW config for $($service.Name)."
    } elseif ($isNssm -and $ReplaceExistingNssm) {
      Write-Host "Replacing NSSM service $($service.Name) with WinSW."
      Remove-XjkExistingService -Name $service.Name
      Install-XjkWinSWService -Files $files -Name $service.Name
    } else {
      throw "Service $($service.Name) already exists and is not WinSW-backed. Use -ReplaceExistingNssm only during cutover."
    }
  } else {
    Write-Host "Installing Windows service $($service.Name)"
    Install-XjkWinSWService -Files $files -Name $service.Name
  }

  if (-not $NoStart) {
    $svc = Get-Service -Name $service.Name -ErrorAction Stop
    if ($svc.Status -eq "Running") {
      Write-Host "Restarting $($service.Name)"
      Restart-Service -Name $service.Name -Force
    } else {
      Write-Host "Starting $($service.Name)"
      Start-Service -Name $service.Name
    }
  }
}

Write-Host "WinSW infrastructure service installation/config update complete."
