function New-XjkManifestServiceIndex {
  param([object]$PlatformManifest)

  $servicesById = @{}
  foreach ($service in $PlatformManifest.services) {
    $serviceId = [string]$service.id
    if ($servicesById.ContainsKey($serviceId)) {
      throw "Duplicate service id in platform manifest: '$serviceId'."
    }
    $servicesById[$serviceId] = $service
  }
  return $servicesById
}

function New-XjkToolEnvironmentCatalog {
  param(
    [string]$RepoRoot,
    [object]$PlatformManifest,
    [hashtable]$ServicesById
  )

  $optionalPathsByName = @{}
  $overlays = @(
    foreach ($tool in $PlatformManifest.tools) {
      $serviceId = [string]$tool.serviceId
      if ([string]::IsNullOrWhiteSpace($serviceId)) { continue }

      $service = $ServicesById[$serviceId]
      if ($null -eq $service) {
        throw "Tool '$($tool.id)' references an unknown service '$serviceId'."
      }

      $backendName = [string]$service.localName
      $toolRoot = Join-Path $RepoRoot "sites\tools.xjk.yt\$($tool.path)"
      $environment = @{
        FRONTEND_DIR = Join-Path $toolRoot "frontend"
      }
      if (-not [string]::IsNullOrWhiteSpace([string]$tool.executableName)) {
        $environment.UPLOAD_DIR = Join-Path $toolRoot "data\uploads"
        $environment.OUTPUT_DIR = Join-Path $toolRoot "data\processed"
        $optionalPathsByName[$backendName] = @{
          TOOL_PATH = @((Join-Path $toolRoot "tools\$($tool.executableName)"))
        }
      }
      if ([string]$tool.id -eq "underwater-converter") {
        $environment.JOBS_DIR = Join-Path $toolRoot "data\jobs"
      }

      @{
        Name = $backendName
        Env = $environment
      }
    }
  )

  if ($optionalPathsByName.ContainsKey("tools-embed")) {
    $optionalPathsByName["tools-embed"].REPLAY_EXTRACT_TOOL_PATH = @(
      (Join-Path $RepoRoot "sites\tools.xjk.yt\Embed-RaceValidationGhost\tools\ReplayDataExtractor.exe"),
      (Join-Path $RepoRoot "sites\tools.xjk.yt\Extract-Replay-Data\tools\ReplayDataExtractor.exe")
    )
    $optionalPathsByName["tools-embed"].GBXLZO_PATH = @(
      (Join-Path $RepoRoot "sites\tools.xjk.yt\Strip-RaceValidationGhost\tools\gbxlzo.exe")
    )
  }

  return [pscustomobject]@{
    EnvironmentOverlays = $overlays
    OptionalPathsByName = $optionalPathsByName
  }
}

function Assert-XjkLocalEnvironmentCatalogCoverage {
  param(
    [object]$PlatformManifest,
    [object[]]$EnvironmentOverlays
  )

  $expectedNames = @{}
  foreach ($service in $PlatformManifest.services) {
    $expectedNames[[string]$service.localName] = $true
  }

  $actualNames = @{}
  foreach ($overlay in $EnvironmentOverlays) {
    $name = [string]$overlay.Name
    if ($actualNames.ContainsKey($name)) {
      throw "Duplicate environment overlay for local backend '$name'."
    }
    if (-not $expectedNames.ContainsKey($name)) {
      throw "Environment overlay references unknown local backend '$name'."
    }
    $actualNames[$name] = $true
  }

  foreach ($name in $expectedNames.Keys) {
    if (-not $actualNames.ContainsKey([string]$name)) {
      throw "Missing environment overlay for local backend '$name'."
    }
  }
}
