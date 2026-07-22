function Get-XjkCredentialMapValue {
  param(
    [hashtable]$SourceMap,
    [string]$Key
  )
  if ($null -eq $SourceMap -or -not $SourceMap.ContainsKey($Key)) { return "" }
  return ([string]$SourceMap[$Key]).Trim()
}

function Assert-XjkCredentialMatch {
  param(
    [string]$LeftValue,
    [string]$RightValue,
    [string]$LeftLabel,
    [string]$RightLabel
  )
  if ($LeftValue -and $RightValue -and $LeftValue -cne $RightValue) {
    throw "$LeftLabel and $RightLabel must contain the same shared credential."
  }
}

function Resolve-XjkCredentialPair {
  param(
    [hashtable]$Environment = @{},
    [hashtable]$FallbackEnvironment = @{},
    [Parameter(Mandatory = $true)]
    [string]$PrimaryKey,
    [Parameter(Mandatory = $true)]
    [string]$PeerKey,
    [string]$DefaultValue = ""
  )
  $primaryValue = Get-XjkCredentialMapValue -SourceMap $Environment -Key $PrimaryKey
  $peerValue = Get-XjkCredentialMapValue -SourceMap $Environment -Key $PeerKey
  $fallbackPrimaryValue = Get-XjkCredentialMapValue -SourceMap $FallbackEnvironment -Key $PrimaryKey
  $fallbackPeerValue = Get-XjkCredentialMapValue -SourceMap $FallbackEnvironment -Key $PeerKey

  Assert-XjkCredentialMatch -LeftValue $primaryValue -RightValue $peerValue -LeftLabel $PrimaryKey -RightLabel $PeerKey
  Assert-XjkCredentialMatch -LeftValue $fallbackPrimaryValue -RightValue $fallbackPeerValue -LeftLabel "fallback $PrimaryKey" -RightLabel "fallback $PeerKey"
  Assert-XjkCredentialMatch -LeftValue $primaryValue -RightValue $fallbackPeerValue -LeftLabel $PrimaryKey -RightLabel "fallback $PeerKey"
  Assert-XjkCredentialMatch -LeftValue $peerValue -RightValue $fallbackPrimaryValue -LeftLabel $PeerKey -RightLabel "fallback $PrimaryKey"

  foreach ($value in @($primaryValue, $peerValue, $fallbackPrimaryValue, $fallbackPeerValue, $DefaultValue)) {
    if (-not [string]::IsNullOrWhiteSpace($value)) { return ([string]$value).Trim() }
  }
  return ""
}

function Get-XjkCredentialProcessEnvironment {
  param([string[]]$Keys)
  $environment = @{}
  foreach ($key in $Keys) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $environment[$key] = $value
    }
  }
  return $environment
}

function Set-XjkLocalCredentialBindings {
  param(
    [hashtable]$BackendByName,
    [hashtable]$EnvironmentByName,
    [hashtable]$AlteredDotEnv,
    [hashtable]$TrackerDotEnv,
    [hashtable]$AggregatorDotEnv
  )
  $alteredBackend = $BackendByName["altered-hub"]
  $trackerBackend = $BackendByName["tracker-hub"]
  $trackerLeaderboardBackend = $BackendByName["tracker-leaderboard"]
  $aggregatorBackend = $BackendByName["tracker-aggregator"]
  $credentialEnvironment = Get-XjkCredentialProcessEnvironment -Keys @(
    "ALTERED_INTERNAL_TOKEN",
    "DASH_ALTERED_INTERNAL_TOKEN",
    "TRACKER_ADMIN_TOKEN",
    "DASH_TRACKER_ADMIN_TOKEN",
    "ALTERED_WR_WEBHOOK_SECRET",
    "TRACKER_WR_WEBHOOK_SECRET"
  )

  $alteredInternalDefault = Resolve-XjkCredentialPair `
    -PrimaryKey "ALTERED_INTERNAL_TOKEN" `
    -PeerKey "DASH_ALTERED_INTERNAL_TOKEN" `
    -FallbackEnvironment @{
      ALTERED_INTERNAL_TOKEN = $EnvironmentByName["altered-hub"]["ALTERED_INTERNAL_TOKEN"]
      DASH_ALTERED_INTERNAL_TOKEN = $EnvironmentByName["tracker-aggregator"]["DASH_ALTERED_INTERNAL_TOKEN"]
    }
  $alteredInternalCredential = Resolve-XjkCredentialPair `
    -Environment $credentialEnvironment `
    -FallbackEnvironment @{
      ALTERED_INTERNAL_TOKEN = Get-XjkCredentialMapValue -SourceMap $AlteredDotEnv -Key "ALTERED_INTERNAL_TOKEN"
      DASH_ALTERED_INTERNAL_TOKEN = Get-XjkCredentialMapValue -SourceMap $AggregatorDotEnv -Key "DASH_ALTERED_INTERNAL_TOKEN"
    } `
    -PrimaryKey "ALTERED_INTERNAL_TOKEN" `
    -PeerKey "DASH_ALTERED_INTERNAL_TOKEN" `
    -DefaultValue $alteredInternalDefault
  $alteredBackend.Env["ALTERED_INTERNAL_TOKEN"] = $alteredInternalCredential
  $aggregatorBackend.Env["DASH_ALTERED_INTERNAL_TOKEN"] = $alteredInternalCredential

  $trackerAdminCredential = Resolve-XjkCredentialPair `
    -Environment $credentialEnvironment `
    -FallbackEnvironment @{
      TRACKER_ADMIN_TOKEN = Get-XjkCredentialMapValue -SourceMap $TrackerDotEnv -Key "TRACKER_ADMIN_TOKEN"
      DASH_TRACKER_ADMIN_TOKEN = Get-XjkCredentialMapValue -SourceMap $AggregatorDotEnv -Key "DASH_TRACKER_ADMIN_TOKEN"
    } `
    -PrimaryKey "TRACKER_ADMIN_TOKEN" `
    -PeerKey "DASH_TRACKER_ADMIN_TOKEN"
  if ($trackerAdminCredential) {
    $alteredBackend.Env["TRACKER_ADMIN_TOKEN"] = $trackerAdminCredential
    $trackerBackend.Env["TRACKER_ADMIN_TOKEN"] = $trackerAdminCredential
    $trackerLeaderboardBackend.Env["TRACKER_ADMIN_TOKEN"] = $trackerAdminCredential
    $aggregatorBackend.Env["DASH_TRACKER_ADMIN_TOKEN"] = $trackerAdminCredential
  }

  $wrWebhookDefault = Resolve-XjkCredentialPair `
    -PrimaryKey "ALTERED_WR_WEBHOOK_SECRET" `
    -PeerKey "TRACKER_WR_WEBHOOK_SECRET" `
    -FallbackEnvironment @{
      ALTERED_WR_WEBHOOK_SECRET = $EnvironmentByName["altered-hub"]["ALTERED_WR_WEBHOOK_SECRET"]
      TRACKER_WR_WEBHOOK_SECRET = $EnvironmentByName["tracker-hub"]["TRACKER_WR_WEBHOOK_SECRET"]
    }
  $wrWebhookCredential = Resolve-XjkCredentialPair `
    -Environment $credentialEnvironment `
    -FallbackEnvironment @{
      ALTERED_WR_WEBHOOK_SECRET = Get-XjkCredentialMapValue -SourceMap $AlteredDotEnv -Key "ALTERED_WR_WEBHOOK_SECRET"
      TRACKER_WR_WEBHOOK_SECRET = Get-XjkCredentialMapValue -SourceMap $TrackerDotEnv -Key "TRACKER_WR_WEBHOOK_SECRET"
    } `
    -PrimaryKey "ALTERED_WR_WEBHOOK_SECRET" `
    -PeerKey "TRACKER_WR_WEBHOOK_SECRET" `
    -DefaultValue $wrWebhookDefault
  $alteredBackend.Env["ALTERED_WR_WEBHOOK_SECRET"] = $wrWebhookCredential
  $trackerBackend.Env["TRACKER_WR_WEBHOOK_SECRET"] = $wrWebhookCredential
  $trackerLeaderboardBackend.Env["TRACKER_WR_WEBHOOK_SECRET"] = $wrWebhookCredential
}
