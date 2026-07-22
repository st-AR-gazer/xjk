function Test-XjkIsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-XjkAdministrator {
  param([string]$Operation = "Managing Windows services")

  if (-not (Test-XjkIsAdministrator)) {
    throw "$Operation requires an elevated PowerShell session."
  }
}

function Get-XjkWinSWTemplate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [switch]$NoDownload
  )

  $templatePath = Get-XjkWinSwTemplatePath -RepoPath $RepoPath
  if (Test-Path -LiteralPath $templatePath) {
    return $templatePath
  }
  if ($NoDownload) {
    throw "WinSW.exe was not found at $templatePath. Place WinSW.exe there or run without -NoDownload."
  }

  Write-Host "Downloading WinSW from latest GitHub release"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/winsw/winsw/releases/latest" `
    -Headers @{ "User-Agent" = "xjk-deploy" }
  $asset = $release.assets |
    Where-Object { $_.name -match '(?i)^winsw.*x64.*\.exe$' } |
    Select-Object -First 1
  if (-not $asset) {
    $asset = $release.assets |
      Where-Object { $_.name -match '(?i)\.exe$' -and $_.name -match '(?i)x64' } |
      Select-Object -First 1
  }
  if (-not $asset -or -not $asset.browser_download_url) {
    throw "Could not find a WinSW x64 executable in the latest release assets."
  }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $templatePath) | Out-Null
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $templatePath -UseBasicParsing
  return $templatePath
}

function Write-XjkWinSWServiceFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [Parameter(Mandatory = $true)]
    [string]$WinSWTemplatePath,
    [Parameter(Mandatory = $true)]
    $Service,
    [switch]$Force
  )

  if (-not (Test-Path -LiteralPath $Service.WorkingDirectory)) {
    throw "Working directory not found for $($Service.Name): $($Service.WorkingDirectory)"
  }
  if (-not (Test-Path -LiteralPath $Service.Executable)) {
    throw "Executable not found for $($Service.Name): $($Service.Executable)"
  }

  New-Item -ItemType Directory -Force -Path $Service.LogDirectory | Out-Null
  $serviceRoot = Get-XjkWinSwServiceRoot -RepoPath $RepoPath
  New-Item -ItemType Directory -Force -Path $serviceRoot | Out-Null
  $serviceExe = Join-Path $serviceRoot ($Service.Name + ".exe")
  $serviceXml = Join-Path $serviceRoot ($Service.Name + ".xml")
  if ($Force -or -not (Test-Path -LiteralPath $serviceExe)) {
    Copy-Item -LiteralPath $WinSWTemplatePath -Destination $serviceExe -Force
  }
  Set-Content -LiteralPath $serviceXml -Value (New-XjkWinSwXml -Service $Service) -Encoding UTF8
  return [pscustomobject]@{ Exe = $serviceExe; Xml = $serviceXml }
}

function Install-XjkWinSWService {
  param(
    [Parameter(Mandatory = $true)]
    $Files,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & $Files.Exe install
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW install failed for $Name with exit code $LASTEXITCODE"
  }
}

function Remove-XjkService {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [int]$SettleSeconds = 2
  )

  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service) { return }
  if ($service.Status -ne "Stopped") {
    Write-Host "Stopping service $Name"
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    if ($SettleSeconds -gt 0) { Start-Sleep -Seconds $SettleSeconds }
  }
  Write-Host "Deleting service $Name"
  sc.exe delete $Name | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to delete service $Name."
  }
  if ($SettleSeconds -gt 0) { Start-Sleep -Seconds $SettleSeconds }
}
