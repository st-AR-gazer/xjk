function Get-XjkLocalDotEnvMaps {
  param([string]$RepoRoot)

  return [pscustomobject]@{
    Altered = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\altered\.env")
    Tracker = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\tracker\.env")
    Aggregator = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\aggregator\.env")
    LearnProfile = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\learn-profile\.env")
    ValidifierPublic = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\validifier-public\.env")
    CotdPublic = Read-XjkDotEnvFile -Path (Join-Path $RepoRoot "services\cotd-public\.env")
  }
}

function New-XjkEnvironmentOverlayIndex {
  param([object[]]$EnvironmentOverlays)

  $environmentByName = @{}
  foreach ($overlay in $EnvironmentOverlays) {
    $name = [string]$overlay.Name
    if ($environmentByName.ContainsKey($name)) {
      throw "Duplicate environment overlay for local backend '$name'."
    }
    $environmentByName[$name] = $overlay.Env
  }
  return $environmentByName
}

function Set-XjkLocalBackendLaunchOverrides {
  param(
    [hashtable]$BackendByName,
    [string]$RepoRoot
  )

  Add-BackendLaunchOverlays `
    -BackendByName $BackendByName `
    -LaunchByName @{
      "altered-bannerbuilder" = @{
        Executable = Join-Path $RepoRoot "services\bannerbuilder\.venv\Scripts\python.exe"
      }
    }
}

function Set-XjkLocalRemoteProxyEnvironment {
  param(
    [hashtable]$BackendByName,
    [int]$GatewayPort,
    [bool]$RemoteTrackerProxyEnabled,
    [bool]$RemoteAggregatorProxyEnabled
  )

  $alteredBackend = $BackendByName["altered-hub"]
  if ($RemoteTrackerProxyEnabled) {
    $alteredBackend.Env["TRACKER_PUBLIC_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/wr/api/v1"
    $alteredBackend.Env["TRACKER_ADMIN_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/wr/api/v1/admin"
    $alteredBackend.Env["TRACKER_LEADERBOARD_PUBLIC_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/leaderboard/api/v1"
    $alteredBackend.Env["TRACKER_LEADERBOARD_ADMIN_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/leaderboard/api/v1/admin"
    $alteredBackend.Env["TRACKER_DISPLAYNAME_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/displayname/api/v1"
    $alteredBackend.Env["TRACKER_CLUB_BASE_URL"] = "http://127.0.0.1:$GatewayPort/trackers/club/api/v1"

    $aggregatorEnvironment = $BackendByName["tracker-aggregator"].Env
    $aggregatorEnvironment["DASH_TRACKER_WR_BASE_URL"] = "http://127.0.0.1:$GatewayPort/__remote/trackers/wr"
    $aggregatorEnvironment["DASH_TRACKER_LEADERBOARD_BASE_URL"] = "http://127.0.0.1:$GatewayPort/__remote/trackers/leaderboard"
    $aggregatorEnvironment["DASH_TRACKER_DISPLAYNAME_BASE_URL"] = "http://127.0.0.1:$GatewayPort/__remote/trackers/displayname"
    $aggregatorEnvironment["DASH_TRACKER_CLUB_BASE_URL"] = "http://127.0.0.1:$GatewayPort/__remote/trackers/club"
  }

  if ($RemoteAggregatorProxyEnabled) {
    $alteredBackend.Env["AGGREGATOR_BASE_URL"] = "http://127.0.0.1:$GatewayPort/aggregator/api/v1"
  }
}

function Set-XjkLocalOptionalPathEnvironment {
  param(
    [hashtable]$BackendByName,
    [hashtable]$OptionalPathsByName
  )

  foreach ($backendName in $OptionalPathsByName.Keys) {
    $backend = $BackendByName[[string]$backendName]
    foreach ($environmentKey in $OptionalPathsByName[$backendName].Keys) {
      Set-XjkOptionalEnvironmentPath `
        -Environment $backend.Env `
        -Key ([string]$environmentKey) `
        -Candidates @($OptionalPathsByName[$backendName][$environmentKey])
    }
  }
}
