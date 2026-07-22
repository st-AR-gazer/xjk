. (Join-Path $PSScriptRoot "backend-environment-values.ps1")
. (Join-Path $PSScriptRoot "backend-environment-bindings.ps1")
. (Join-Path $PSScriptRoot "backend-environment-overrides.ps1")
. (Join-Path $PSScriptRoot "backend-environment-catalog.ps1")
. (Join-Path $PSScriptRoot "credential-policy.ps1")

function Initialize-XjkLocalBackendEnvironment {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$BackendsByName,
    [Parameter(Mandatory = $true)]
    [object]$PlatformManifest,
    [Parameter(Mandatory = $true)]
    [object]$LocalStackConfiguration,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$AlteredDataDir,
    [Parameter(Mandatory = $true)]
    [string]$LogDir,
    [int]$GatewayPort,
    [bool]$RemoteTrackerProxyEnabled,
    [bool]$RemoteAggregatorProxyEnabled
  )

  $dotEnv = Get-XjkLocalDotEnvMaps -RepoRoot $RepoRoot
  $catalog = New-XjkLocalBackendEnvironmentCatalog `
    -RepoRoot $RepoRoot `
    -PlatformManifest $PlatformManifest `
    -AlteredDataDir $AlteredDataDir `
    -LogDir $LogDir `
    -GatewayPort $GatewayPort `
    -AlteredHubPort ([int]$LocalStackConfiguration.ServicePorts["altered-hub"]) `
    -TrackerHubPort ([int]$LocalStackConfiguration.ServicePorts["tracker-hub"]) `
    -AggregatorHubPort ([int]$LocalStackConfiguration.ServicePorts["aggregator-hub"]) `
    -TrackerDisplaynameHubPort ([int]$LocalStackConfiguration.ServicePorts["tracker-displayname-hub"]) `
    -TrackerClubHubPort ([int]$LocalStackConfiguration.ServicePorts["tracker-club-hub"]) `
    -TrackerLeaderboardHubPort ([int]$LocalStackConfiguration.ServicePorts["tracker-leaderboard-hub"]) `
    -ValidifierPublicDotEnv $dotEnv.ValidifierPublic `
    -CotdPublicDotEnv $dotEnv.CotdPublic
  $environmentByName = New-XjkEnvironmentOverlayIndex `
    -EnvironmentOverlays $catalog.EnvironmentOverlays

  Add-BackendEnvironmentOverlays `
    -BackendByName $BackendsByName `
    -EnvironmentByName $environmentByName
  Add-XjkLocalSecurityOverrides `
    -BackendByName $BackendsByName `
    -Manifest $PlatformManifest
  Set-XjkLocalBackendLaunchOverrides -BackendByName $BackendsByName -RepoRoot $RepoRoot
  Set-XjkLocalRemoteProxyEnvironment `
    -BackendByName $BackendsByName `
    -GatewayPort $GatewayPort `
    -RemoteTrackerProxyEnabled $RemoteTrackerProxyEnabled `
    -RemoteAggregatorProxyEnabled $RemoteAggregatorProxyEnabled
  Set-XjkLocalBackendEnvironmentBindings `
    -BackendByName $BackendsByName `
    -AlteredDotEnv $dotEnv.Altered `
    -TrackerDotEnv $dotEnv.Tracker `
    -LearnProfileDotEnv $dotEnv.LearnProfile
  Set-XjkLocalOptionalPathEnvironment `
    -BackendByName $BackendsByName `
    -OptionalPathsByName $catalog.OptionalPathsByName
  Set-XjkLocalCredentialBindings `
    -BackendByName $BackendsByName `
    -EnvironmentByName $environmentByName `
    -AlteredDotEnv $dotEnv.Altered `
    -TrackerDotEnv $dotEnv.Tracker `
    -AggregatorDotEnv $dotEnv.Aggregator

  Assert-BackendConfiguration `
    -BackendByName $BackendsByName `
    -Manifest $PlatformManifest `
    -ServicePorts $LocalStackConfiguration.ServicePorts `
    -RepoRoot $RepoRoot `
    -OptionalPathsByName $catalog.OptionalPathsByName `
    -EnvironmentBindings @(Get-XjkBackendEnvironmentValidationBindings)
}
