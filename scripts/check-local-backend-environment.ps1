$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
. (Join-Path $repoRoot "deploy\platform-manifest.ps1")
. (Join-Path $repoRoot "deploy\local\backend-config.ps1")
. (Join-Path $repoRoot "deploy\local\backend-environment.ps1")

function Assert-XjkEqual {
  param(
    $Expected,
    $Actual,
    [string]$Message
  )

  if ([string]$Expected -cne [string]$Actual) {
    throw "$Message Expected '$Expected', received '$Actual'."
  }
}

function Assert-XjkTrue {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) { throw $Message }
}

function Assert-XjkBackendEnvironment {
  param(
    [hashtable]$BackendByName,
    [string]$BackendName,
    [string]$Key,
    $Expected,
    [string]$Message
  )

  Assert-XjkEqual `
    -Expected $Expected `
    -Actual $BackendByName[$BackendName].Env[$Key] `
    -Message $Message
}

function Assert-XjkThrows {
  param(
    [scriptblock]$Action,
    [string]$ExpectedMessage,
    [string]$Message
  )

  $actualMessage = ""
  try {
    & $Action
  } catch {
    $actualMessage = $_.Exception.Message
  }
  if ($actualMessage -cne $ExpectedMessage) {
    throw "$Message Expected '$ExpectedMessage', received '$actualMessage'."
  }
}

function ConvertTo-XjkCanonicalValue {
  param(
    $Value,
    [string]$PathRoot
  )

  if ($null -eq $Value) { return $null }
  if ($Value -is [System.Collections.IDictionary]) {
    $canonical = [ordered]@{}
    foreach ($key in @($Value.Keys | ForEach-Object { [string]$_ } | Sort-Object)) {
      $canonical[$key] = ConvertTo-XjkCanonicalValue -Value $Value[$key] -PathRoot $PathRoot
    }
    return ,$canonical
  }
  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    return ,@($Value | ForEach-Object {
        ConvertTo-XjkCanonicalValue -Value $_ -PathRoot $PathRoot
      })
  }
  return ([string]$Value).Replace($PathRoot, "<repo>").Replace("\", "/")
}

function Get-XjkCatalogFingerprint {
  param(
    [object]$PlatformManifest,
    [string]$RepoRoot
  )

  $catalog = New-XjkLocalBackendEnvironmentCatalog `
    -RepoRoot $RepoRoot `
    -PlatformManifest $PlatformManifest `
    -AlteredDataDir (Join-Path $RepoRoot "__fixture_data__") `
    -LogDir (Join-Path $RepoRoot "__fixture_logs__") `
    -GatewayPort 48080 `
    -AlteredHubPort 43130 `
    -TrackerHubPort 43131 `
    -AggregatorHubPort 43140 `
    -TrackerDisplaynameHubPort 43141 `
    -TrackerClubHubPort 43142 `
    -TrackerLeaderboardHubPort 43143 `
    -ValidifierPublicDotEnv @{} `
    -CotdPublicDotEnv @{}
  $canonical = ConvertTo-XjkCanonicalValue `
    -Value ([ordered]@{
      EnvironmentOverlays = $catalog.EnvironmentOverlays
      OptionalPathsByName = $catalog.OptionalPathsByName
    }) `
    -PathRoot $RepoRoot
  $json = $canonical | ConvertTo-Json -Depth 20 -Compress
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($json))
  return [BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
}

function Set-XjkTestFile {
  param(
    [string]$Path,
    [string]$Content = "fixture"
  )

  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Copy-XjkTestManifest {
  param([object]$Manifest)

  return ($Manifest | ConvertTo-Json -Depth 100 | ConvertFrom-Json)
}

$platformManifest = Get-XjkPlatformManifest -RepoRoot $repoRoot
$bindingFunctions = @(
  "Get-XjkLearnProfileEnvironmentBindings",
  "Get-XjkAlteredEnvironmentBindings",
  "Get-XjkTrackerEnvironmentBindings",
  "Get-XjkTrackerLeaderboardEnvironmentBindings",
  "Get-XjkAggregatorEnvironmentBindings",
  "Get-XjkTrackerDisplayNameEnvironmentBindings",
  "Get-XjkTrackerClubEnvironmentBindings"
)
$environmentKeys = @(
  foreach ($functionName in $bindingFunctions) {
    foreach ($binding in @(& $functionName)) {
      if ($binding -is [string] -or -not $binding.SourceKey) { [string]$binding } else { [string]$binding.SourceKey }
    }
  }
  "ALTERED_INTERNAL_TOKEN"
  "DASH_ALTERED_INTERNAL_TOKEN"
  "TRACKER_ADMIN_TOKEN"
  "DASH_TRACKER_ADMIN_TOKEN"
  "ALTERED_WR_WEBHOOK_SECRET"
  "TRACKER_WR_WEBHOOK_SECRET"
  "VALIDIFIER_INTERNAL_BASE_URL"
  "VALIDIFIER_INTERNAL_ACCESS_TOKEN"
  "VALIDIFIER_INTERNAL_SUBMISSION_SECRET"
  "REPLAY_VERIFICATION_API_BASE_URL"
  "REPLAY_VERIFICATION_API_TOKEN"
  "COTD_HISTORY_LIMIT"
  "NADEO_GLOBAL_THROTTLE_FILE"
  "NADEO_GLOBAL_MIN_REQUEST_GAP_MS"
  Get-ChildItem Env: |
    Where-Object { $_.Name -match '^(COTD_|VALIDIFIER_|REPLAY_VERIFICATION_)' } |
    ForEach-Object { $_.Name }
) | Sort-Object -Unique
$previousEnvironment = @{}
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("xjk-backend-environment-" + [guid]::NewGuid().ToString("N"))

try {
  foreach ($key in $environmentKeys) {
    $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key)
    [Environment]::SetEnvironmentVariable($key, $null)
  }

  Assert-XjkEqual `
    -Expected "981d4483e2fac78a638dc0adf63b501090a94674fe50c88fcc1a188b518304b4" `
    -Actual (Get-XjkCatalogFingerprint -PlatformManifest $platformManifest -RepoRoot $repoRoot) `
    -Message "The complete default local environment catalog drifted."

  $catalog = New-XjkLocalBackendEnvironmentCatalog `
    -RepoRoot $repoRoot `
    -PlatformManifest $platformManifest `
    -AlteredDataDir (Join-Path $repoRoot "__fixture_data__") `
    -LogDir (Join-Path $repoRoot "__fixture_logs__") `
    -GatewayPort 48080 `
    -AlteredHubPort 43130 `
    -TrackerHubPort 43131 `
    -AggregatorHubPort 43140 `
    -TrackerDisplaynameHubPort 43141 `
    -TrackerClubHubPort 43142 `
    -TrackerLeaderboardHubPort 43143 `
    -ValidifierPublicDotEnv @{} `
    -CotdPublicDotEnv @{}
  $overlaysByName = New-XjkEnvironmentOverlayIndex -EnvironmentOverlays $catalog.EnvironmentOverlays
  Assert-XjkEqual `
    -Expected @($platformManifest.services).Count `
    -Actual $overlaysByName.Count `
    -Message "Every manifest service needs one environment overlay."
  foreach ($service in $platformManifest.services) {
    Assert-XjkTrue `
      -Condition $overlaysByName.ContainsKey([string]$service.localName) `
      -Message "Missing environment overlay for '$($service.id)'."
  }
  foreach ($tool in $platformManifest.tools) {
    if ([string]::IsNullOrWhiteSpace([string]$tool.serviceId)) { continue }
    $service = $platformManifest.services |
      Where-Object { [string]$_.id -ceq [string]$tool.serviceId } |
      Select-Object -First 1
    $backendName = [string]$service.localName
    $expectedFrontend = Join-Path $repoRoot "sites\tools.xjk.yt\$($tool.path)\frontend"
    Assert-XjkEqual `
      -Expected $expectedFrontend `
      -Actual $overlaysByName[$backendName].FRONTEND_DIR `
      -Message "Tool '$($tool.id)' has the wrong frontend overlay."
    if (-not [string]::IsNullOrWhiteSpace([string]$tool.executableName)) {
      Assert-XjkTrue `
        -Condition $catalog.OptionalPathsByName.ContainsKey($backendName) `
        -Message "Tool '$($tool.id)' is missing its optional executable registration."
    }
  }

  $unknownToolManifest = Copy-XjkTestManifest -Manifest $platformManifest
  $unknownToolManifest.tools[0].serviceId = "missing-tool-service"
  Assert-XjkThrows `
    -Action {
      New-XjkLocalBackendEnvironmentCatalog `
        -RepoRoot $repoRoot `
        -PlatformManifest $unknownToolManifest `
        -AlteredDataDir "data" `
        -LogDir "logs" `
        -ValidifierPublicDotEnv @{} `
        -CotdPublicDotEnv @{} |
        Out-Null
    } `
    -ExpectedMessage "Tool 'map-cleaner' references an unknown service 'missing-tool-service'." `
    -Message "Unknown tool services must fail clearly."

  $duplicateToolManifest = Copy-XjkTestManifest -Manifest $platformManifest
  $duplicateToolManifest.tools = @($duplicateToolManifest.tools) + $duplicateToolManifest.tools[0]
  Assert-XjkThrows `
    -Action {
      New-XjkLocalBackendEnvironmentCatalog `
        -RepoRoot $repoRoot `
        -PlatformManifest $duplicateToolManifest `
        -AlteredDataDir "data" `
        -LogDir "logs" `
        -ValidifierPublicDotEnv @{} `
        -CotdPublicDotEnv @{} |
        Out-Null
    } `
    -ExpectedMessage "Duplicate environment overlay for local backend 'tools-strip'." `
    -Message "Duplicate tool registrations must fail clearly."

  $duplicateServiceManifest = Copy-XjkTestManifest -Manifest $platformManifest
  $duplicateServiceManifest.services = @($duplicateServiceManifest.services) + $duplicateServiceManifest.services[0]
  Assert-XjkThrows `
    -Action { New-XjkManifestServiceIndex -PlatformManifest $duplicateServiceManifest | Out-Null } `
    -ExpectedMessage "Duplicate service id in platform manifest: 'validifier-public'." `
    -Message "Duplicate manifest services must fail clearly."

  $incompleteOverlays = @($catalog.EnvironmentOverlays | Where-Object { [string]$_.Name -cne "tools-hub" })
  Assert-XjkThrows `
    -Action {
      Assert-XjkLocalEnvironmentCatalogCoverage `
        -PlatformManifest $platformManifest `
        -EnvironmentOverlays $incompleteOverlays
    } `
    -ExpectedMessage "Missing environment overlay for local backend 'tools-hub'." `
    -Message "Missing environment overlays must fail clearly."

  Set-XjkTestFile `
    -Path (Join-Path $fixtureRoot "services\learn-profile\.env") `
    -Content "LEARN_UBI_OAUTH_SCOPE=dotenv-learn-scope"
  Set-XjkTestFile `
    -Path (Join-Path $fixtureRoot "services\tracker\.env") `
    -Content "TRACKER_ADMIN_USERNAME=dotenv-tracker-user"
  Set-XjkTestFile -Path (Join-Path $fixtureRoot "services\aggregator\.env") -Content "# intentionally empty"
  Set-XjkTestFile `
    -Path (Join-Path $fixtureRoot "services\validifier-public\.env") `
    -Content "REPLAY_VERIFICATION_API_BASE_URL=http://dotenv-validifier"
  Set-XjkTestFile -Path (Join-Path $fixtureRoot "services\cotd-public\.env") -Content "COTD_HISTORY_LIMIT=999"
  Set-XjkTestFile -Path (Join-Path $fixtureRoot "services\altered\.env") -Content @"
ALTERED_MAPPER_NAME_TRACKING_API_BASE_URL=http://dotenv-displayname
ALTERED_MAPPER_NAME_TRACKING_TOKEN_URL=http://dotenv-special-token
UBI_OAUTH_TOKEN_URL=http://dotenv-general-token
"@
  foreach ($tool in $platformManifest.tools) {
    if ([string]::IsNullOrWhiteSpace([string]$tool.executableName)) { continue }
    Set-XjkTestFile `
      -Path (Join-Path $fixtureRoot "sites\tools.xjk.yt\$($tool.path)\tools\$($tool.executableName)")
  }
  Set-XjkTestFile `
    -Path (Join-Path $fixtureRoot "sites\tools.xjk.yt\Embed-RaceValidationGhost\tools\ReplayDataExtractor.exe")
  Set-XjkTestFile `
    -Path (Join-Path $fixtureRoot "sites\tools.xjk.yt\Strip-RaceValidationGhost\tools\gbxlzo.exe")

  $testEnvironment = [ordered]@{
    LEARN_UBI_OAUTH_SCOPE = "process-learn-scope"
    TRACKER_ADMIN_USERNAME = "process-tracker-user"
    ALTERED_LIVE_AUTH_MODE = "altered-auth-mode"
    TRACKER_NADEO_AUTH_MODE = "tracker-auth-mode"
    AGGREGATOR_INGEST_TOKEN = "shared-ingest-token"
    AGGREGATOR_TOKEN = "altered-direct-token"
    TRACKER_AGGREGATOR_TOKEN = "tracker-direct-token"
    TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN = "displayname-direct-token"
    TRACKER_CLUB_AGGREGATOR_TOKEN = "club-direct-token"
    TRACKER_DISPLAYNAME_API_BASE_URL = "http://process-displayname"
    UBI_OAUTH_TOKEN_URL = "http://process-token"
    VALIDIFIER_INTERNAL_BASE_URL = "http://process-validifier"
    COTD_HISTORY_LIMIT = "888"
  }
  foreach ($entry in $testEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable([string]$entry.Key, [string]$entry.Value)
  }

  $stackConfiguration = Resolve-XjkLocalStackConfiguration `
    -Manifest $platformManifest `
    -BoundParameters @{ GatewayPort = 48080 }
  $backends = New-XjkLocalBackendSkeletons `
    -Manifest $platformManifest `
    -ServicePorts $stackConfiguration.ServicePorts `
    -RepoRoot $fixtureRoot
  $backendsByName = New-BackendIndex -Backends $backends
  Initialize-XjkLocalBackendEnvironment `
    -BackendsByName $backendsByName `
    -PlatformManifest $platformManifest `
    -LocalStackConfiguration $stackConfiguration `
    -RepoRoot $fixtureRoot `
    -AlteredDataDir (Join-Path $fixtureRoot "altered-data") `
    -LogDir (Join-Path $fixtureRoot "logs") `
    -GatewayPort 48080 `
    -RemoteTrackerProxyEnabled $true `
    -RemoteAggregatorProxyEnabled $true

  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "learn-profile" `
    -Key "LEARN_UBI_OAUTH_SCOPE" `
    -Expected "dotenv-learn-scope" `
    -Message "Learn dotenv values retain their established precedence over process values."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "altered-hub" `
    -Key "TRACKER_ADMIN_USERNAME" `
    -Expected "dotenv-tracker-user" `
    -Message "Altered tracker credentials retain dotenv precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-hub" `
    -Key "TRACKER_ADMIN_USERNAME" `
    -Expected "process-tracker-user" `
    -Message "Tracker process bindings remain independent from Altered dotenv bindings."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "altered-hub" `
    -Key "ALTERED_LIVE_AUTH_MODE" `
    -Expected "tracker-auth-mode" `
    -Message "Tracker compatibility aliases retain precedence for Altered live auth."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "altered-hub" `
    -Key "AGGREGATOR_TOKEN" `
    -Expected "altered-direct-token" `
    -Message "Direct Altered aggregator tokens retain precedence over compatibility aliases."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-hub" `
    -Key "TRACKER_AGGREGATOR_TOKEN" `
    -Expected "tracker-direct-token" `
    -Message "Direct tracker aggregator tokens retain precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-displayname" `
    -Key "AGGREGATOR_INGEST_TOKEN" `
    -Expected "tracker-direct-token" `
    -Message "Display-name compatibility bindings retain their ordered precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-displayname" `
    -Key "TRACKER_DISPLAYNAME_AGGREGATOR_TOKEN" `
    -Expected "displayname-direct-token" `
    -Message "Direct display-name tokens retain precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-club" `
    -Key "TRACKER_CLUB_AGGREGATOR_TOKEN" `
    -Expected "club-direct-token" `
    -Message "Direct club tokens retain precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-displayname" `
    -Key "TRACKER_DISPLAYNAME_API_BASE_URL" `
    -Expected "http://dotenv-displayname" `
    -Message "Altered dotenv compatibility values retain display-name precedence."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-displayname" `
    -Key "UBI_OAUTH_TOKEN_URL" `
    -Expected "http://dotenv-general-token" `
    -Message "The general token URL retains precedence over its legacy alias."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "validifier-public" `
    -Key "VALIDIFIER_INTERNAL_BASE_URL" `
    -Expected "http://process-validifier" `
    -Message "Validifier process values retain precedence over dotenv fallbacks."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "cotd-public" `
    -Key "COTD_HISTORY_LIMIT" `
    -Expected "888" `
    -Message "COTD process values retain precedence over dotenv values."

  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "altered-hub" `
    -Key "TRACKER_PUBLIC_BASE_URL" `
    -Expected "http://127.0.0.1:48080/trackers/wr/api/v1" `
    -Message "Remote tracker proxy overlays remain intact."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "altered-hub" `
    -Key "AGGREGATOR_BASE_URL" `
    -Expected "http://127.0.0.1:48080/aggregator/api/v1" `
    -Message "Remote aggregator proxy overlays remain intact."
  Assert-XjkBackendEnvironment `
    -BackendByName $backendsByName `
    -BackendName "tracker-aggregator" `
    -Key "DASH_TRACKER_LEADERBOARD_BASE_URL" `
    -Expected "http://127.0.0.1:48080/__remote/trackers/leaderboard" `
    -Message "Dashboard remote tracker overlays remain intact."
  foreach ($override in $platformManifest.infrastructure.security.localOnlyOverrides) {
    $service = $platformManifest.services |
      Where-Object { [string]$_.id -ceq [string]$override.serviceId } |
      Select-Object -First 1
    Assert-XjkBackendEnvironment `
      -BackendByName $backendsByName `
      -BackendName ([string]$service.localName) `
      -Key ([string]$override.environmentVariable) `
      -Expected $override.localValue `
      -Message "Local security override '$($override.environmentVariable)' was not applied."
  }
  foreach ($service in $platformManifest.services) {
    Assert-XjkBackendEnvironment `
      -BackendByName $backendsByName `
      -BackendName ([string]$service.localName) `
      -Key "PORT" `
      -Expected $stackConfiguration.ServicePorts[[string]$service.id] `
      -Message "Service '$($service.id)' received the wrong local port."
  }
  foreach ($tool in $platformManifest.tools) {
    if ([string]::IsNullOrWhiteSpace([string]$tool.executableName)) { continue }
    $service = $platformManifest.services |
      Where-Object { [string]$_.id -ceq [string]$tool.serviceId } |
      Select-Object -First 1
    $toolPath = Join-Path $fixtureRoot "sites\tools.xjk.yt\$($tool.path)\tools\$($tool.executableName)"
    $expectedToolPath = (Resolve-Path $toolPath).Path
    Assert-XjkBackendEnvironment `
      -BackendByName $backendsByName `
      -BackendName ([string]$service.localName) `
      -Key "TOOL_PATH" `
      -Expected $expectedToolPath `
      -Message "Tool '$($tool.id)' did not resolve its managed executable."
  }
  Assert-XjkEqual `
    -Expected (Join-Path $fixtureRoot "services\bannerbuilder\.venv\Scripts\python.exe") `
    -Actual $backendsByName["altered-bannerbuilder"].Executable `
    -Message "Banner builder launch overlays remain intact."

  $serviceCount = @($platformManifest.services).Count
  Write-Output "Local backend environment checks passed: $serviceCount overlays, ordered precedence, proxies, security, and tool paths."
} finally {
  foreach ($entry in $previousEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable([string]$entry.Key, $entry.Value)
  }
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
