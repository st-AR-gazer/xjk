$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
. (Join-Path $repoRoot "deploy\local\process-ownership.ps1")
. (Join-Path $repoRoot "deploy\local\process-launch.ps1")
. (Join-Path $repoRoot "deploy\local\credential-policy.ps1")

$nodeExecutable = Resolve-XjkRuntimeExecutable -Runtime "node"
$entryPoint = [IO.Path]::GetFullPath((Join-Path $repoRoot "deploy\local\local-gateway.js"))
$createdAt = [DateTimeOffset]::UtcNow
$owned = [pscustomobject]@{
  ProcessId = 4242
  Name = [IO.Path]::GetFileName($nodeExecutable)
  ExecutablePath = $nodeExecutable
  CommandLine = "`"$nodeExecutable`" `"$entryPoint`""
  CreationDate = $createdAt.UtcDateTime
}
$ownershipArgs = @{
  RepoRoot = $repoRoot
  ExpectedPid = 4242
  ExecutablePath = $nodeExecutable
  EntryPoint = $entryPoint
  CreatedAt = $createdAt.ToString("o")
}
if (-not (Test-XjkLocalProcessOwnership -Process $owned @ownershipArgs)) {
  throw "An exact local runtime identity was not accepted."
}

$ownedWithoutCommandLine = $owned.PSObject.Copy()
$ownedWithoutCommandLine.CommandLine = ""
if (-not (Test-XjkLocalProcessOwnership -Process $ownedWithoutCommandLine @ownershipArgs)) {
  throw "An exact runtime identity was rejected when CIM command-line access was unavailable."
}

$wrongPid = $owned.PSObject.Copy()
$wrongPid.ProcessId = 5252
if (Test-XjkLocalProcessOwnership -Process $wrongPid @ownershipArgs) {
  throw "A reused PID was accepted."
}

$wrongExecutable = $owned.PSObject.Copy()
$wrongExecutable.ExecutablePath = Join-Path $repoRoot "unrelated\node.exe"
if (Test-XjkLocalProcessOwnership -Process $wrongExecutable @ownershipArgs) {
  throw "A process with the wrong executable was accepted."
}

$wrongEntryPoint = $owned.PSObject.Copy()
$wrongEntryPoint.CommandLine = "`"$nodeExecutable`" `"$(Join-Path $repoRoot 'unrelated\server.js')`""
if (Test-XjkLocalProcessOwnership -Process $wrongEntryPoint @ownershipArgs) {
  throw "A process with the wrong entry point was accepted."
}

$staleCreation = $owned.PSObject.Copy()
$staleCreation.CreationDate = $createdAt.AddMinutes(1).UtcDateTime
if (Test-XjkLocalProcessOwnership -Process $staleCreation @ownershipArgs) {
  throw "A reused PID with a different creation time was accepted."
}

$originalSnapshotProvider = (Get-Item Function:Get-XjkLocalProcessSnapshot).ScriptBlock
$failedStopSnapshot = $owned.PSObject.Copy()
$failedStopSnapshot.ProcessId = 2147483000
$failedStopProvider = { param([int]$ProcessId) return $failedStopSnapshot }.GetNewClosure()
try {
  Set-Item Function:Get-XjkLocalProcessSnapshot -Value $failedStopProvider
  $failedStopResult = Stop-XjkOwnedRuntimeProcesses `
    -Entries @(@{
        pid = 2147483000
        executable = $nodeExecutable
        entrypoint = $entryPoint
        created_at = $createdAt.ToString("o")
      }) `
    -RepoRoot $repoRoot `
    -Quiet
  if (@($failedStopResult.UnresolvedEntries).Count -ne 1) {
    throw "A still-live owned process was not returned for retry after stop failure."
  }
} finally {
  Set-Item Function:Get-XjkLocalProcessSnapshot -Value $originalSnapshotProvider
}

$existingName = "XJK_PROCESS_LAUNCH_EXISTING_TEST"
$missingName = "XJK_PROCESS_LAUNCH_MISSING_TEST"
$previousExisting = [Environment]::GetEnvironmentVariable($existingName, "Process")
$previousMissing = [Environment]::GetEnvironmentVariable($missingName, "Process")
try {
  [Environment]::SetEnvironmentVariable($existingName, "original", "Process")
  [Environment]::SetEnvironmentVariable($missingName, $null, "Process")
  $observed = Invoke-WithXjkProcessEnvironment `
    -Environment @{ $existingName = "temporary"; $missingName = "present" } `
    -Action { "$env:XJK_PROCESS_LAUNCH_EXISTING_TEST|$env:XJK_PROCESS_LAUNCH_MISSING_TEST" }
  if ($observed -cne "temporary|present") { throw "The environment overlay was not visible to the launch action." }
  if ($env:XJK_PROCESS_LAUNCH_EXISTING_TEST -cne "original") { throw "An existing environment value was not restored." }
  if (Test-Path "Env:$missingName") { throw "A previously absent environment value was retained." }

  try {
    Invoke-WithXjkProcessEnvironment `
      -Environment @{ $existingName = "temporary-after-error" } `
      -Action { throw "expected launch test failure" }
  } catch {
    if ($_.Exception.Message -ne "expected launch test failure") { throw }
  }
  if ($env:XJK_PROCESS_LAUNCH_EXISTING_TEST -cne "original") {
    throw "The environment overlay was not restored after an error."
  }
} finally {
  [Environment]::SetEnvironmentVariable($existingName, $previousExisting, "Process")
  [Environment]::SetEnvironmentVariable($missingName, $previousMissing, "Process")
}

$credentialKeys = @(
  "ALTERED_INTERNAL_TOKEN",
  "DASH_ALTERED_INTERNAL_TOKEN",
  "TRACKER_ADMIN_TOKEN",
  "DASH_TRACKER_ADMIN_TOKEN",
  "ALTERED_WR_WEBHOOK_SECRET",
  "TRACKER_WR_WEBHOOK_SECRET"
)
$previousCredentials = @{}
foreach ($key in $credentialKeys) {
  $previousCredentials[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
}
try {
  foreach ($key in $credentialKeys) {
    [Environment]::SetEnvironmentVariable($key, $null, "Process")
  }
  $credentialBackends = @{
    "altered-hub" = @{ Env = @{} }
    "tracker-hub" = @{ Env = @{} }
    "tracker-leaderboard" = @{ Env = @{} }
    "tracker-aggregator" = @{ Env = @{} }
  }
  Set-XjkLocalCredentialBindings `
    -BackendByName $credentialBackends `
    -EnvironmentByName @{
      "altered-hub" = @{
        ALTERED_INTERNAL_TOKEN = "default-internal"
        ALTERED_WR_WEBHOOK_SECRET = "default-webhook"
      }
      "tracker-hub" = @{ TRACKER_WR_WEBHOOK_SECRET = "default-webhook" }
      "tracker-aggregator" = @{ DASH_ALTERED_INTERNAL_TOKEN = "default-internal" }
    } `
    -AlteredDotEnv @{
      ALTERED_INTERNAL_TOKEN = "configured-internal"
      ALTERED_WR_WEBHOOK_SECRET = "configured-webhook"
    } `
    -TrackerDotEnv @{
      TRACKER_ADMIN_TOKEN = "configured-admin"
      TRACKER_WR_WEBHOOK_SECRET = "configured-webhook"
    } `
    -AggregatorDotEnv @{
      DASH_ALTERED_INTERNAL_TOKEN = "configured-internal"
      DASH_TRACKER_ADMIN_TOKEN = "configured-admin"
    }

  if ($credentialBackends["altered-hub"].Env["ALTERED_INTERNAL_TOKEN"] -cne $credentialBackends["tracker-aggregator"].Env["DASH_ALTERED_INTERNAL_TOKEN"]) {
    throw "The local Altered internal producer and aggregator consumer received different credentials."
  }
  if ($credentialBackends["tracker-hub"].Env["TRACKER_ADMIN_TOKEN"] -cne $credentialBackends["tracker-aggregator"].Env["DASH_TRACKER_ADMIN_TOKEN"]) {
    throw "The local tracker admin producer and aggregator consumer received different credentials."
  }
  if ($credentialBackends["altered-hub"].Env["ALTERED_WR_WEBHOOK_SECRET"] -cne $credentialBackends["tracker-hub"].Env["TRACKER_WR_WEBHOOK_SECRET"]) {
    throw "The local WR webhook receiver and sender received different credentials."
  }

  $sameKeyOverride = Resolve-XjkCredentialPair `
    -Environment @{ ALTERED_INTERNAL_TOKEN = "process-value" } `
    -FallbackEnvironment @{ ALTERED_INTERNAL_TOKEN = "dotenv-value" } `
    -PrimaryKey "ALTERED_INTERNAL_TOKEN" `
    -PeerKey "DASH_ALTERED_INTERNAL_TOKEN"
  if ($sameKeyOverride -cne "process-value") {
    throw "A process credential did not override the same fallback key."
  }

  $crossSourceConflictRejected = $false
  try {
    Resolve-XjkCredentialPair `
      -Environment @{ DASH_ALTERED_INTERNAL_TOKEN = "client-value" } `
      -FallbackEnvironment @{ ALTERED_INTERNAL_TOKEN = "server-value" } `
      -PrimaryKey "ALTERED_INTERNAL_TOKEN" `
      -PeerKey "DASH_ALTERED_INTERNAL_TOKEN" | Out-Null
  } catch {
    if ($_.Exception.Message -notmatch "must contain the same shared credential") { throw }
    $crossSourceConflictRejected = $true
  }
  if (-not $crossSourceConflictRejected) {
    throw "A cross-source credential mismatch was accepted."
  }
} finally {
  foreach ($key in $credentialKeys) {
    [Environment]::SetEnvironmentVariable($key, $previousCredentials[$key], "Process")
  }
}

$statePath = Join-Path ([IO.Path]::GetTempPath()) "xjk-local-process-state-$PID.json"
try {
  Write-XjkLocalProcessState `
    -Path $statePath `
    -RepoRoot $repoRoot `
    -StartedAt $createdAt.ToString("o") `
    -Processes @(@{
        name = "ownership-test"
        pid = 4242
        executable = $nodeExecutable
        entrypoint = $entryPoint
        created_at = $createdAt.ToString("o")
      })
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ([IO.Path]::GetFullPath([string]$state.repo_root) -ine $repoRoot) {
    throw "The persisted process state did not retain its repository identity."
  }
  if (@($state.processes).Count -ne 1 -or [int]$state.processes[0].pid -ne 4242) {
    throw "The persisted process state did not retain the launched runtime identity."
  }
} finally {
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
}

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) "xjk-process-launch-$PID"
$fixtureEntryPoint = Join-Path $repoRoot "scripts\fixtures\local-process-child.mjs"
$fixtureLog = Join-Path $fixtureRoot "fixture.log"
$fixtureErrorLog = Join-Path $fixtureRoot "fixture.error.log"
$fixtureLaunch = $null
try {
  New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
  $fixtureLaunch = Start-XjkRuntimeProcess `
    -Name "process-ownership-fixture" `
    -Runtime "node" `
    -EntryPoint $fixtureEntryPoint `
    -WorkingDirectory $repoRoot `
    -Environment @{ XJK_PROCESS_FIXTURE_VALUE = "isolated" } `
    -LogPath $fixtureLog `
    -ErrorLogPath $fixtureErrorLog

  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-Path -LiteralPath $fixtureLog) -and
        (Get-Content -LiteralPath $fixtureLog -Raw -ErrorAction SilentlyContinue) -match 'fixture:isolated') {
      break
    }
    Start-Sleep -Milliseconds 100
  }
  if ((Get-Content -LiteralPath $fixtureLog -Raw) -notmatch 'fixture:isolated') {
    throw "The real runtime launch did not inherit its scoped environment or write its output log."
  }
  if ($env:XJK_PROCESS_FIXTURE_VALUE) {
    throw "The real runtime launch leaked its environment overlay into the parent process."
  }

  $fixtureSnapshot = Get-XjkLocalProcessSnapshot -ProcessId ([int]$fixtureLaunch.pid)
  if (-not (Test-XjkLocalProcessOwnership `
      -Process $fixtureSnapshot `
      -RepoRoot $repoRoot `
      -ExpectedPid ([int]$fixtureLaunch.pid) `
      -ExecutablePath ([string]$fixtureLaunch.executable) `
      -EntryPoint ([string]$fixtureLaunch.entrypoint) `
      -CreatedAt ([string]$fixtureLaunch.created_at))) {
    throw "The real runtime launch did not produce a verifiable ownership record."
  }

  $forcedFailureObserved = $false
  try {
    Start-XjkRuntimeProcess `
      -Name "forced-startup-failure" `
      -Runtime "node" `
      -EntryPoint (Join-Path $repoRoot "scripts\fixtures\missing-process-child.mjs") `
      -WorkingDirectory $repoRoot `
      -LogPath (Join-Path $fixtureRoot "missing.log") `
      -ErrorLogPath (Join-Path $fixtureRoot "missing.error.log") | Out-Null
  } catch {
    if ($_.Exception.Message -notmatch "entry point does not exist") { throw }
    $forcedFailureObserved = $true
  }
  if (-not $forcedFailureObserved) {
    throw "The real partial-start fixture did not fail at its intended second launch."
  }

  $rollback = Stop-XjkOwnedRuntimeProcesses -Entries @($fixtureLaunch) -RepoRoot $repoRoot -Quiet
  if (@($rollback.UnresolvedEntries).Count -ne 0) {
    throw "The real partial-start rollback retained a process that it launched and owned."
  }
  $fixtureLaunch = $null
} finally {
  if ($fixtureLaunch) {
    Stop-XjkOwnedRuntimeProcesses -Entries @($fixtureLaunch) -RepoRoot $repoRoot -Quiet | Out-Null
  }
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}

foreach ($relativePath in @(
    "deploy/local/start-local.ps1",
    "deploy/local/start-altered-only.ps1",
    "deploy/local/start-localhost-browser-proxy.ps1"
  )) {
  $source = Get-Content (Join-Path $repoRoot $relativePath) -Raw
  if ($source -match 'Start-Process\s+-FilePath\s+"cmd\.exe"' -or $source -match '\bset\s+""[^\r\n]+=') {
    throw "$relativePath still exposes runtime environment values through a cmd wrapper."
  }
}

$startLocalSource = Get-Content (Join-Path $repoRoot "deploy/local/start-local.ps1") -Raw
if (($startLocalSource | Select-String -Pattern 'Write-XjkLocalProcessState' -AllMatches).Matches.Count -lt 2) {
  throw "start-local.ps1 does not persist partial ownership state throughout startup."
}
if ($startLocalSource -notmatch 'catch\s*\{[\s\S]*Stop-XjkOwnedRuntimeProcesses[\s\S]*UnresolvedEntries[\s\S]*Write-XjkLocalProcessState[\s\S]*else\s*\{[\s\S]*Remove-Item\s+-LiteralPath\s+\$pidFile') {
  throw "start-local.ps1 does not retain unresolved exact-owned state after a partial startup rollback."
}

$stopLocalSource = Get-Content (Join-Path $repoRoot "deploy/local/stop-local.ps1") -Raw
if ($stopLocalSource -notmatch 'Stop-XjkOwnedRuntimeProcesses[\s\S]*UnresolvedEntries[\s\S]*Write-XjkLocalProcessState[\s\S]*throw[\s\S]*Remove-Item\s+-LiteralPath\s+\$pidFile') {
  throw "stop-local.ps1 does not retain unresolved ownership state before failing safely."
}

Write-Host "Local process ownership checks passed."
