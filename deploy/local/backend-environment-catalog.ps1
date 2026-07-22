. (Join-Path $PSScriptRoot "backend-environment-catalog-tools.ps1")
. (Join-Path $PSScriptRoot "backend-environment-catalog-services.ps1")
. (Join-Path $PSScriptRoot "backend-environment-catalog-public.ps1")

function New-XjkLocalBackendEnvironmentCatalog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [object]$PlatformManifest,
    [Parameter(Mandatory = $true)]
    [string]$AlteredDataDir,
    [Parameter(Mandatory = $true)]
    [string]$LogDir,
    [int]$GatewayPort,
    [int]$AlteredHubPort,
    [int]$TrackerHubPort,
    [int]$AggregatorHubPort,
    [int]$TrackerDisplaynameHubPort,
    [int]$TrackerClubHubPort,
    [int]$TrackerLeaderboardHubPort,
    [Parameter(Mandatory = $true)]
    [hashtable]$ValidifierPublicDotEnv,
    [Parameter(Mandatory = $true)]
    [hashtable]$CotdPublicDotEnv
  )

  $servicesById = New-XjkManifestServiceIndex -PlatformManifest $PlatformManifest
  $toolCatalog = New-XjkToolEnvironmentCatalog `
    -RepoRoot $RepoRoot `
    -PlatformManifest $PlatformManifest `
    -ServicesById $servicesById
  $environmentOverlays = @(
    $toolCatalog.EnvironmentOverlays
    New-XjkToolsHubEnvironmentOverlay -RepoRoot $RepoRoot
    New-XjkPluginsHubEnvironmentOverlay -RepoRoot $RepoRoot
    New-XjkAlteredEnvironmentOverlay `
      -RepoRoot $RepoRoot `
      -AlteredDataDir $AlteredDataDir `
      -GatewayPort $GatewayPort `
      -TrackerHubPort $TrackerHubPort `
      -AggregatorHubPort $AggregatorHubPort `
      -TrackerDisplaynameHubPort $TrackerDisplaynameHubPort `
      -TrackerClubHubPort $TrackerClubHubPort `
      -TrackerLeaderboardHubPort $TrackerLeaderboardHubPort
    New-XjkTrackerEnvironmentOverlay `
      -RepoRoot $RepoRoot `
      -AlteredDataDir $AlteredDataDir `
      -AlteredHubPort $AlteredHubPort `
      -AggregatorHubPort $AggregatorHubPort
    New-XjkAggregatorEnvironmentOverlay `
      -RepoRoot $RepoRoot `
      -AlteredDataDir $AlteredDataDir `
      -LogDir $LogDir
    New-XjkTrackerDisplayNameEnvironmentOverlay -RepoRoot $RepoRoot -AggregatorHubPort $AggregatorHubPort
    New-XjkTrackerClubEnvironmentOverlay -RepoRoot $RepoRoot -AggregatorHubPort $AggregatorHubPort
    New-XjkTrackerLeaderboardEnvironmentOverlay `
      -RepoRoot $RepoRoot `
      -AlteredDataDir $AlteredDataDir `
      -AggregatorHubPort $AggregatorHubPort
    New-XjkBannerBuilderEnvironmentOverlay
    New-XjkLearnProfileEnvironmentOverlay -RepoRoot $RepoRoot -GatewayPort $GatewayPort
    New-XjkConsoleEnvironmentOverlay `
      -RepoRoot $RepoRoot `
      -GatewayPort $GatewayPort `
      -AggregatorHubPort $AggregatorHubPort `
      -TrackerDisplaynameHubPort $TrackerDisplaynameHubPort
    New-XjkAuthEnvironmentOverlay -RepoRoot $RepoRoot -GatewayPort $GatewayPort
    New-XjkValidifierEnvironmentOverlay -RepoRoot $RepoRoot -DotEnv $ValidifierPublicDotEnv
    New-XjkCotdEnvironmentOverlay -RepoRoot $RepoRoot -DotEnv $CotdPublicDotEnv
  )
  Assert-XjkLocalEnvironmentCatalogCoverage `
    -PlatformManifest $PlatformManifest `
    -EnvironmentOverlays $environmentOverlays

  return [pscustomobject]@{
    EnvironmentOverlays = $environmentOverlays
    OptionalPathsByName = $toolCatalog.OptionalPathsByName
  }
}
