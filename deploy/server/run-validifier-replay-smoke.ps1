param(
  [string]$RepoPath = "D:\srv\xjk",
  [string]$PublicBaseUrl = "http://127.0.0.1:3044",
  [string]$PrivateBaseUrl = "",
  [int]$TimeoutSeconds = 180,
  [int]$IntervalSeconds = 3
)

$ErrorActionPreference = "Stop"

function Test-HttpReady {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSeconds = 180,
    [int]$IntervalSeconds = 3
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return
      }
      $lastError = "HTTP $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds $IntervalSeconds
  }
  throw "Timed out waiting for $Url ($lastError)"
}

function Invoke-OctetUpload {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  return Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/octet-stream" -InFile $FilePath -TimeoutSec 60
}

function Get-ReplayVerification {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$RecordId
  )

  $encodedRecord = [uri]::EscapeDataString($RecordId)
  return Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/records/$encodedRecord" -Method Get -TimeoutSec 30
}

$resolvedRepo = (Resolve-Path -LiteralPath $RepoPath).Path
$fixtureRoot = Join-Path $resolvedRepo "services\validifier-public\testdata\replay_validation"
$mapPath = Join-Path $fixtureRoot "smoke.Map.Gbx"
$replayPath = Join-Path $fixtureRoot "smoke.Ghost.Gbx"

if (-not (Test-Path -LiteralPath $mapPath)) {
  throw "Missing Validifier smoke map fixture: $mapPath"
}
if (-not (Test-Path -LiteralPath $replayPath)) {
  throw "Missing Validifier smoke replay fixture: $replayPath"
}

if ([string]::IsNullOrWhiteSpace($PrivateBaseUrl)) {
  $PrivateBaseUrl = $env:VALIDIFIER_INTERNAL_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($PrivateBaseUrl)) {
  $PrivateBaseUrl = $env:REPLAY_VERIFICATION_API_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($PrivateBaseUrl)) {
  throw "PrivateBaseUrl was not provided and VALIDIFIER_INTERNAL_BASE_URL is not configured."
}

$publicHealthUrl = "$($PublicBaseUrl.TrimEnd('/'))/health"
$privateHealthUrl = "$($PrivateBaseUrl.TrimEnd('/'))/v1/health"

Write-Host "Waiting for validifier-public: $publicHealthUrl"
Test-HttpReady -Url $publicHealthUrl -TimeoutSeconds $TimeoutSeconds -IntervalSeconds $IntervalSeconds

Write-Host "Waiting for private validifier backend: $privateHealthUrl"
Test-HttpReady -Url $privateHealthUrl -TimeoutSeconds $TimeoutSeconds -IntervalSeconds $IntervalSeconds

$recordId = "deploy-smoke-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$mapUid = "deploy.smoke.validifier.replay"
$validateExeVersion = "Trackmania date=2026-02-02_17_51 git=128149-c7d05ad2551 GameVersion=3.3.0"

Write-Host "Uploading smoke map fixture"
$mapUpload = Invoke-OctetUpload -Url "$($PublicBaseUrl.TrimEnd('/'))/api/v1/uploads/map?filename=smoke.Map.Gbx" -FilePath $mapPath

Write-Host "Uploading smoke replay fixture"
$replayUpload = Invoke-OctetUpload -Url "$($PublicBaseUrl.TrimEnd('/'))/api/v1/uploads/replay?filename=smoke.Ghost.Gbx" -FilePath $replayPath

Write-Host "Submitting replay smoke record $recordId"
$submission = Invoke-RestMethod -Uri "$($PublicBaseUrl.TrimEnd('/'))/api/v1/submissions/replay" -Method Post -ContentType "application/json" -Body (@{
  record_id = $recordId
  map_uid = $mapUid
  rank = 1
  map_ref = $mapUpload.data.artifact_ref
  replay_ref = $replayUpload.data.artifact_ref
  validate_exe_version = $validateExeVersion
} | ConvertTo-Json -Depth 6) -TimeoutSec 60

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$lastRecord = $null
while ([DateTime]::UtcNow -lt $deadline) {
  Start-Sleep -Seconds $IntervalSeconds
  $lastRecord = Get-ReplayVerification -BaseUrl $PublicBaseUrl -RecordId $recordId
  $record = $lastRecord.data
  $replayVerification = @($record.verifications) | Where-Object { $_.track -eq "replay" } | Select-Object -First 1
  if ($replayVerification.status -eq "pass") {
    $batch = Invoke-RestMethod -Uri "$($PublicBaseUrl.TrimEnd('/'))/api/v1/verdicts/batch" -Method Post -ContentType "application/json" -Body (@{
      record_ids = @($recordId)
      track = "replay"
    } | ConvertTo-Json -Depth 4) -TimeoutSec 30
    $mapVerdicts = Invoke-RestMethod -Uri "$($PublicBaseUrl.TrimEnd('/'))/api/v1/maps/$([uri]::EscapeDataString($mapUid))/verdicts?track=replay&limit=10" -Method Get -TimeoutSec 30
    Write-Host "Validifier replay smoke passed."
    Write-Host ($submission | ConvertTo-Json -Depth 6)
    Write-Host ($lastRecord | ConvertTo-Json -Depth 6)
    Write-Host ($batch | ConvertTo-Json -Depth 6)
    Write-Host ($mapVerdicts | ConvertTo-Json -Depth 6)
    exit 0
  }
  if ($replayVerification.status -eq "fail" -or $replayVerification.status -eq "unavailable") {
    throw "Replay smoke returned a failing public record verdict for $recordId"
  }
}

throw "Timed out waiting for replay smoke record $recordId to become VALID. Last record: $($lastRecord | ConvertTo-Json -Depth 6)"
