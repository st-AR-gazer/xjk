param(
  [string]$RepoPath = "D:\srv\xjk",
  [string[]]$ServiceName = @(),
  [string]$CloudflaredTargetName = "xjk-cloudflared",
  [switch]$RemoveMissingStoppedServices,
  [switch]$RemoveNginx,
  [switch]$RemoveNssmFolder,
  [switch]$NoDownload
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-catalog.ps1")
. (Join-Path $PSScriptRoot "winsw-operations.ps1")

function Test-XjkServiceDefinitionRunnable {
  param(
    [Parameter(Mandatory = $true)]
    $Service
  )

  if (-not (Test-Path -LiteralPath $Service.WorkingDirectory)) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "Working directory not found: $($Service.WorkingDirectory)"
    }
  }

  if (-not (Test-Path -LiteralPath $Service.Executable)) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "Executable not found: $($Service.Executable)"
    }
  }

  return [pscustomobject]@{
    Ok = $true
    Reason = ""
  }
}

function Split-XjkServicePathName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathName
  )

  $trimmed = $PathName.Trim()
  if ($trimmed -match '^"([^"]+)"\s*(.*)$') {
    return [pscustomobject]@{
      Executable = $matches[1]
      Arguments = $matches[2].Trim()
    }
  }

  $exeIndex = $trimmed.ToLowerInvariant().IndexOf(".exe")
  if ($exeIndex -lt 0) {
    throw "Could not parse service PathName: $PathName"
  }

  $executable = $trimmed.Substring(0, $exeIndex + 4)
  $arguments = $trimmed.Substring($exeIndex + 4).Trim()
  return [pscustomobject]@{
    Executable = $executable
    Arguments = $arguments
  }
}

function Get-XjkLegacyServiceDefinition {
  param(
    [Parameter(Mandatory = $true)]
    $Service,
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [string]$CloudflaredTargetName = "xjk-cloudflared"
  )

  $targetName = [string]$Service.Name
  $displayName = [string]$Service.DisplayName
  $workingDirectory = ""
  $executable = ""
  $arguments = ""
  $environment = @{}

  if ($Service.Name -eq "Cloudflared") {
    $targetName = $CloudflaredTargetName
    $displayName = "xjk Cloudflared"
  }

  if ($Service.PathName -match 'nssm\.exe|\\nssm\\|nssm') {
    $parametersPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$($Service.Name)\Parameters"
    if (-not (Test-Path $parametersPath)) {
      throw "Missing NSSM Parameters registry key for $($Service.Name)."
    }

    $parameters = Get-ItemProperty -Path $parametersPath
    $workingDirectory = [string]$parameters.AppDirectory
    $executable = [string]$parameters.Application
    $arguments = [string]$parameters.AppParameters

    if ($parameters.AppEnvironmentExtra) {
      foreach ($entry in @($parameters.AppEnvironmentExtra)) {
        if ([string]::IsNullOrWhiteSpace($entry)) {
          continue
        }

        $separator = ([string]$entry).IndexOf("=")
        if ($separator -gt 0) {
          $key = ([string]$entry).Substring(0, $separator)
          $value = ([string]$entry).Substring($separator + 1)
          $environment[$key] = $value
        }
      }
    }
  } else {
    $parsed = Split-XjkServicePathName -PathName ([string]$Service.PathName)
    $executable = $parsed.Executable
    $arguments = $parsed.Arguments
    $workingDirectory = Split-Path -Parent $executable
  }

  if ([string]::IsNullOrWhiteSpace($workingDirectory)) {
    $workingDirectory = Split-Path -Parent $executable
  }

  return [pscustomobject]@{
    SourceName = [string]$Service.Name
    SourceState = [string]$Service.State
    Name = $targetName
    DisplayName = $displayName
    Description = "Migrated from legacy Windows service $($Service.Name) to WinSW."
    WorkingDirectory = $workingDirectory
    Executable = $executable
    Arguments = @($arguments)
    ArgumentString = $arguments
    Environment = $environment
    Port = ""
    LogDirectory = Join-Path $RepoPath ("logs\services\" + $targetName)
    HealthUrl = $null
    RequiredHealth = $false
    StartMode = [string]$Service.StartMode
  }
}

function Start-XjkServiceIfNeeded {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$OriginalState
  )

  if ($OriginalState -ne "Running") {
    Write-Host "Leaving $Name stopped because original service state was $OriginalState."
    return
  }

  Write-Host "Starting service $Name"
  Start-Service -Name $Name -ErrorAction Stop
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
  $targetName = $Prefix + ".removed-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  $target = Join-Path $parent $targetName
  Write-Host "Renaming $Path to $target"
  Rename-Item -LiteralPath $Path -NewName $targetName
}

Assert-XjkAdministrator -Operation "Migrating Windows services"
$repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
$winswTemplate = Get-XjkWinSWTemplate -RepoPath $repoRoot -NoDownload:$NoDownload
$serviceRoot = Get-XjkWinSwServiceRoot -RepoPath $repoRoot
$serviceRootWithSlash = if ($serviceRoot.EndsWith("\")) { $serviceRoot } else { "$serviceRoot\" }

if ($ServiceName.Count -gt 0) {
  $wanted = @{}
  foreach ($name in $ServiceName) {
    $wanted[$name] = $true
  }
  $sourceServices = @(Get-CimInstance Win32_Service | Where-Object { $wanted.ContainsKey($_.Name) })
} else {
  $sourceServices = @(Get-CimInstance Win32_Service | Where-Object {
    $pathName = [string]$_.PathName
    if (($pathName -replace '"', '').StartsWith($serviceRootWithSlash, [StringComparison]::OrdinalIgnoreCase)) {
      return $false
    }
    if ($_.Name -eq "nginx") {
      return $false
    }
    if ($pathName -match 'nssm\.exe|\\nssm\\|nssm') {
      return $true
    }
    if ($pathName -match 'caddy\.exe|cloudflared\.exe') {
      return $true
    }
    return $false
  })
}

$sourceServices = @($sourceServices | Sort-Object Name)
if ($sourceServices.Count -eq 0) {
  Write-Host "No legacy services matched for migration."
} else {
  Write-Host "Legacy services selected for WinSW migration:"
  $sourceServices | Select-Object Name, State, StartMode | Format-Table -AutoSize
}

foreach ($sourceService in $sourceServices) {
  $definition = Get-XjkLegacyServiceDefinition -Service $sourceService -RepoPath $repoRoot -CloudflaredTargetName $CloudflaredTargetName
  $runnable = Test-XjkServiceDefinitionRunnable -Service $definition
  if (-not $runnable.Ok) {
    if ($sourceService.State -ne "Running" -and $RemoveMissingStoppedServices) {
      Write-Host "Removing non-running legacy service $($sourceService.Name) instead of migrating it: $($runnable.Reason)"
      Remove-XjkService -Name $sourceService.Name
      continue
    }

    throw "Cannot migrate $($sourceService.Name): $($runnable.Reason). Use -RemoveMissingStoppedServices to remove non-running dead services."
  }

  $files = Write-XjkWinSWServiceFiles `
    -RepoPath $repoRoot `
    -WinSWTemplatePath $winswTemplate `
    -Service $definition `
    -Force

  $existingTarget = Get-CimInstance Win32_Service -Filter "Name = '$($definition.Name)'" -ErrorAction SilentlyContinue
  if ($existingTarget -and $existingTarget.Name -ne $definition.SourceName) {
    $isWinsw = $existingTarget.PathName -and (($existingTarget.PathName -replace '"', '') -like "$serviceRoot*")
    if (-not $isWinsw) {
      throw "Target service $($definition.Name) already exists and is not WinSW-backed."
    }
    Write-Host "Target service $($definition.Name) already exists as WinSW-backed."
  } elseif ($existingTarget) {
    Remove-XjkService -Name $existingTarget.Name
    Write-Host "Installing WinSW service $($definition.Name)"
    Install-XjkWinSWService -Files $files -Name $definition.Name
  } else {
    Write-Host "Installing WinSW service $($definition.Name)"
    Install-XjkWinSWService -Files $files -Name $definition.Name
  }

  if ($definition.Name -ne $definition.SourceName) {
    $targetService = Get-Service -Name $definition.Name -ErrorAction Stop
    if ($definition.SourceState -eq "Running" -and $targetService.Status -ne "Running") {
      Start-XjkServiceIfNeeded -Name $definition.Name -OriginalState $definition.SourceState
    }
    Remove-XjkService -Name $definition.SourceName
  } else {
    Start-XjkServiceIfNeeded -Name $definition.Name -OriginalState $definition.SourceState
  }
}

if ($RemoveNginx) {
  Remove-XjkService -Name "nginx"
  Rename-XjkDirectoryForRemoval -Path "C:\nginx" -Prefix "nginx"
}

$remainingNssm = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'nssm\.exe|\\nssm\\|nssm' })
if ($remainingNssm.Count -gt 0) {
  Write-Host "NSSM-backed services still remain:"
  $remainingNssm | Select-Object Name, State, StartMode | Sort-Object Name | Format-Table -AutoSize
} elseif ($RemoveNssmFolder) {
  Rename-XjkDirectoryForRemoval -Path "C:\nssm" -Prefix "nssm"
}

Write-Host "Legacy service migration complete."
