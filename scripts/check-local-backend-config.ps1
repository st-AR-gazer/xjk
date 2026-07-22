$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startLocalPath = Join-Path $repoRoot "deploy\local\start-local.ps1"
$startLocalSource = Get-Content -LiteralPath $startLocalPath -Raw
. (Join-Path $repoRoot "deploy\platform-manifest.ps1")
$platformManifest = Get-XjkPlatformManifest -RepoRoot $repoRoot
$expectedBackendCount = @($platformManifest.services).Count
if ($startLocalSource -match '\$backends\[\d+\]') {
  throw "start-local.ps1 contains a positional backend lookup. Use the name-keyed backend index."
}
if ($startLocalSource -notmatch 'Resolve-XjkLocalStackConfiguration' -or
    $startLocalSource -notmatch 'New-XjkLocalBackendSkeletons') {
  throw "start-local.ps1 must derive its resolved ports and backend skeletons from the platform manifest."
}
if ($startLocalSource -match '\$requiredPorts\s*=\s*@\(\s*\$GatewayPort') {
  throw "start-local.ps1 contains a manually rebuilt required-port inventory."
}

$defaults = Resolve-XjkLocalStackConfiguration -Manifest $platformManifest
if ($defaults.GatewayPort -ne [int]$platformManifest.infrastructure.localGateway.port) {
  throw "The manifest-derived local gateway default is incorrect."
}
foreach ($service in $platformManifest.services) {
  if ($defaults.ServicePorts[[string]$service.id] -ne [int]$service.ports.local) {
    throw "The manifest-derived local port is incorrect for '$([string]$service.id)'."
  }
}

$overridePorts = @{
  GatewayPort = 48080
  HubPort = 43110
  TrackerHubPort = 43131
}
$overridden = Resolve-XjkLocalStackConfiguration `
  -Manifest $platformManifest `
  -BoundParameters $overridePorts
if ($overridden.GatewayPort -ne 48080 -or
    $overridden.ServicePorts["tools-hub"] -ne 43110 -or
    $overridden.ServicePorts["tracker-hub"] -ne 43131) {
  throw "Named CLI-compatible local port overrides were not applied by service identity."
}
$collisionRejected = $false
$occupiedService = $platformManifest.services |
  Where-Object { [string]$_.id -eq "validifier-public" } |
  Select-Object -First 1
$occupiedPort = [int]$occupiedService.ports.local
try {
  Resolve-XjkLocalStackConfiguration `
    -Manifest $platformManifest `
    -BoundParameters @{ HubPort = $occupiedPort } | Out-Null
} catch {
  $collisionRejected = $true
}
if (-not $collisionRejected) {
  throw "Manifest-derived local port resolution must reject colliding overrides."
}

$sentinels = @{
  ALTERED_OPS_MONITOR_ENABLED = "backend-check-altered"
  TRACKER_UBI_EMAIL = "backend-check-tracker"
  DASH_ADMIN_TOKEN = "backend-check-aggregator"
  TRACKER_DISPLAYNAME_ENABLED = "backend-check-displayname"
  TRACKER_CLUB_ENABLED = "backend-check-club"
  VALIDIFIER_INTERNAL_BASE_URL = "http://127.0.0.1:48090"
  VALIDIFIER_INTERNAL_ACCESS_TOKEN = "backend-check-validifier-access"
  VALIDIFIER_INTERNAL_SUBMISSION_SECRET = "backend-check-validifier-submission"
}
$previousValues = @{}

try {
  foreach ($entry in $sentinels.GetEnumerator()) {
    $previousValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key)
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value)
  }

  $result = & $startLocalPath `
    -ValidateBackendConfigOnly `
    -DisableRemoteServerProxy `
    -DisableRemoteAlteredProxy `
    -DisableRemoteTrackerProxy `
    -DisableRemoteAggregatorProxy
  $summary = ($result | Out-String).Trim()
  $expectedSummary = "Local backend configuration valid: $expectedBackendCount named backends."
  if ($summary -cne $expectedSummary) {
    throw "Unexpected local backend validation result: $summary"
  }

  $overrideResult = & $startLocalPath `
    -ValidateBackendConfigOnly `
    -DisableRemoteServerProxy `
    -DisableRemoteAlteredProxy `
    -DisableRemoteTrackerProxy `
    -DisableRemoteAggregatorProxy `
    -GatewayPort 48080 `
    -HubPort 43110 `
    -TrackerHubPort 43131
  $overrideSummary = ($overrideResult | Out-String).Trim()
  if ($overrideSummary -cne $expectedSummary) {
    throw "Local backend validation failed with named port overrides: $overrideSummary"
  }

  Write-Output $summary
} finally {
  foreach ($entry in $previousValues.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
  }
}
