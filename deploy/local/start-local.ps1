param(
  [switch]$SkipInstall,
  [switch]$UseMirrorData,
  [int]$GatewayPort = 0,
  [int]$HubPort = 0,
  [int]$PluginsHubPort = 0,
  [int]$LearnProfilePort = 0,
  [int]$ConsoleHubPort = 0,
  [int]$XjkAuthPort = 0,
  [int]$AlteredHubPort = 0,
  [int]$AlteredBannerBuilderPort = 0,
  [int]$TrackerHubPort = 0,
  [int]$AggregatorHubPort = 0,
  [int]$TrackerDisplaynameHubPort = 0,
  [int]$TrackerClubHubPort = 0,
  [int]$TrackerLeaderboardHubPort = 0,
  [int]$ValidifierPublicPort = 0,
  [int]$CotdPublicPort = 0,
  [int]$StripPort = 0,
  [int]$EmbedPort = 0,
  [int]$EmbeddedCheckerPort = 0,
  [int]$ExtractReplayPort = 0,
  [int]$MedalModifierPort = 0,
  [int]$MapValidationPort = 0,
  [int]$UnderwaterPort = 0,
  [int]$ClipToGhostPort = 0,
  [int]$ReplayVerificationPort = 0,
  [string]$RemoteServerOrigin = "",
  [switch]$DisableRemoteServerProxy,
  [string]$RemoteAlteredOrigin = "",
  [string]$RemoteAlteredHostHeader = "altered.xjk.yt",
  [switch]$DisableRemoteAlteredProxy,
  [string]$RemoteTrackerOrigin = "",
  [string]$RemoteTrackerHostHeader = "trackers.xjk.yt",
  [switch]$DisableRemoteTrackerProxy,
  [string]$RemoteAggregatorOrigin = "",
  [string]$RemoteAggregatorHostHeader = "aggregator.xjk.yt",
  [switch]$DisableRemoteAggregatorProxy,
  [switch]$DisableSubdomainRedirects,
  [switch]$ValidateBackendConfigOnly,
  [switch]$ShowConsole,
  [switch]$HiddenLauncher
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "hidden-launcher.ps1")

if (-not $ValidateBackendConfigOnly -and -not $ShowConsole -and -not $HiddenLauncher) {
  Start-XjkHiddenPowerShellScript -ScriptPath $PSCommandPath -BoundParameters $PSBoundParameters
  return
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
. (Join-Path $scriptDir "platform-manifest.ps1")
. (Join-Path $scriptDir "backend-config.ps1")
. (Join-Path $scriptDir "backend-environment.ps1")
. (Join-Path $scriptDir "process-launch.ps1")
. (Join-Path $scriptDir "process-ownership.ps1")
$platformManifest = Get-XjkPlatformManifest -RepoRoot $repoRoot
$localStackConfiguration = Resolve-XjkLocalStackConfiguration `
  -Manifest $platformManifest `
  -BoundParameters $PSBoundParameters
$GatewayPort = [int]$localStackConfiguration.GatewayPort
foreach ($entry in $localStackConfiguration.ParameterPorts.GetEnumerator()) {
  Set-Variable -Name ([string]$entry.Key) -Value ([int]$entry.Value)
}
$pidFile = Join-Path $scriptDir ".local-pids.json"
$logDir = Join-Path $scriptDir "logs"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$alteredDataSnapshotDir = Join-Path $repoRoot "sites\altered.xjk.yt\data_server"
$alteredDataLocalDir = Join-Path $repoRoot "sites\altered.xjk.yt\data"
$alteredDataDir = $alteredDataLocalDir
$usingMirrorData = $false

if ($UseMirrorData) {
  if (Test-Path $alteredDataSnapshotDir) {
    $alteredDataDir = $alteredDataSnapshotDir
    $usingMirrorData = $true
  } else {
    Write-Host "Mirror mode requested, but data snapshot path was not found:"
    Write-Host "  $alteredDataSnapshotDir"
    Write-Host "Falling back to local writable data."
  }
}


function Get-ListeningPortOccupants {
  param([int[]]$Ports)

  $safePorts = @($Ports | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
  if (-not $safePorts.Count) { return @() }

  $listeners = @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -in $safePorts }
  )
  if (-not $listeners.Count) { return @() }

  $processIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  $processIndex = @{}
  foreach ($process in (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -in $processIds })) {
    $processIndex[[int]$process.ProcessId] = $process
  }

  $rows = @()
  foreach ($listener in $listeners) {
    $process = $processIndex[[int]$listener.OwningProcess]
    $commandLine = ""
    if ($process -and -not [string]::IsNullOrWhiteSpace($process.CommandLine)) {
      $commandLine = $process.CommandLine.Trim()
    }

    $rows += [pscustomobject]@{
      Port        = [int]$listener.LocalPort
      ProcessId   = [int]$listener.OwningProcess
      ProcessName = if ($process -and $process.Name) { [string]$process.Name } else { "unknown" }
      CommandLine = $commandLine
    }
  }

  return $rows | Sort-Object Port, ProcessId
}

function Assert-PortsAvailable {
  param(
    [int[]]$Ports,
    [string]$StackName = "local stack"
  )

  $occupied = @(Get-ListeningPortOccupants -Ports $Ports)
  if (-not $occupied.Count) { return }

  Write-Host ""
  Write-Host "Cannot start $StackName because required ports are already in use:" -ForegroundColor Red
  foreach ($entry in $occupied) {
    $summary = "  port $($entry.Port) -> pid $($entry.ProcessId) ($($entry.ProcessName))"
    if (-not [string]::IsNullOrWhiteSpace($entry.CommandLine)) {
      $summary += " :: $($entry.CommandLine)"
    }
    Write-Host $summary
  }
  Write-Host ""
  Write-Host "Run deploy\\local\\stop-local.ps1 or free the ports above, then start again." -ForegroundColor Yellow
  throw "Required local-dev ports are already occupied."
}


if (-not $DisableRemoteTrackerProxy -and [string]::IsNullOrWhiteSpace($RemoteTrackerOrigin)) {
  $envOrigin = [Environment]::GetEnvironmentVariable("REMOTE_TRACKER_ORIGIN")
  if (-not [string]::IsNullOrWhiteSpace($envOrigin)) {
    $RemoteTrackerOrigin = $envOrigin.Trim()
  }
}

if (-not $DisableRemoteServerProxy -and [string]::IsNullOrWhiteSpace($RemoteServerOrigin)) {
  $envOrigin = [Environment]::GetEnvironmentVariable("REMOTE_SERVER_ORIGIN")
  if (-not [string]::IsNullOrWhiteSpace($envOrigin)) {
    $RemoteServerOrigin = $envOrigin.Trim()
  }
}

if (-not $DisableRemoteAlteredProxy -and [string]::IsNullOrWhiteSpace($RemoteAlteredOrigin)) {
  $envOrigin = [Environment]::GetEnvironmentVariable("REMOTE_ALTERED_ORIGIN")
  if (-not [string]::IsNullOrWhiteSpace($envOrigin)) {
    $RemoteAlteredOrigin = $envOrigin.Trim()
  }
}

if (-not $DisableRemoteAggregatorProxy -and [string]::IsNullOrWhiteSpace($RemoteAggregatorOrigin)) {
  $envOrigin = [Environment]::GetEnvironmentVariable("REMOTE_AGGREGATOR_ORIGIN")
  if (-not [string]::IsNullOrWhiteSpace($envOrigin)) {
    $RemoteAggregatorOrigin = $envOrigin.Trim()
  }
}

$remoteServerProxyEnabled = (-not $DisableRemoteServerProxy) -and (-not [string]::IsNullOrWhiteSpace($RemoteServerOrigin))
$remoteAlteredProxyEnabled = (-not $DisableRemoteAlteredProxy) -and (-not [string]::IsNullOrWhiteSpace($RemoteAlteredOrigin))
$remoteTrackerProxyEnabled = (-not $DisableRemoteTrackerProxy) -and (-not [string]::IsNullOrWhiteSpace($RemoteTrackerOrigin))
$remoteAggregatorProxyEnabled = (-not $DisableRemoteAggregatorProxy) -and (-not [string]::IsNullOrWhiteSpace($RemoteAggregatorOrigin))

$requiredPorts = @($localStackConfiguration.RequiredPorts)

if (-not $ValidateBackendConfigOnly) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  if (Test-Path $pidFile) {
    & (Join-Path $scriptDir "stop-local.ps1") -Quiet
  }

  Assert-PortsAvailable -Ports $requiredPorts -StackName "the xjk local dev stack"
  New-Item -ItemType Directory -Force -Path $alteredDataDir | Out-Null

  if ($usingMirrorData) {
    Write-Host "Local data mode: using alternate snapshot at $alteredDataDir"
  } else {
    Write-Host "Local data mode: using local data at $alteredDataDir"
    Write-Host "Tip: run this script with -UseMirrorData to use the alternate data_server snapshot"
  }
}


$backends = @(
  New-XjkLocalBackendSkeletons `
    -Manifest $platformManifest `
    -ServicePorts $localStackConfiguration.ServicePorts `
    -RepoRoot $repoRoot
)
if ($ValidateBackendConfigOnly) {
  [array]::Reverse($backends)
}
$backendsByName = New-BackendIndex -Backends $backends
Initialize-XjkLocalBackendEnvironment `
  -BackendsByName $backendsByName `
  -PlatformManifest $platformManifest `
  -LocalStackConfiguration $localStackConfiguration `
  -RepoRoot $repoRoot `
  -AlteredDataDir $alteredDataDir `
  -LogDir $logDir `
  -GatewayPort $GatewayPort `
  -RemoteTrackerProxyEnabled $remoteTrackerProxyEnabled `
  -RemoteAggregatorProxyEnabled $remoteAggregatorProxyEnabled

if ($ValidateBackendConfigOnly) {
  Write-Output "Local backend configuration valid: $($backendsByName.Count) named backends."
  return
}

if (-not $SkipInstall) {
  $installedCwds = @{}
  foreach ($svc in $backends) {
    if ($installedCwds.ContainsKey($svc.Cwd)) { continue }
    $installedCwds[$svc.Cwd] = $true
    $runtime = if ($svc.ContainsKey("Runtime") -and $svc.Runtime) { [string]$svc.Runtime } else { "node" }
    Write-Host "Installing backend deps for $($svc.Name)"
    if ($runtime -eq "python") {
      $executablePath = if ($svc.ContainsKey("Executable") -and $svc.Executable) { [string]$svc.Executable } else { "" }
      if ($executablePath) {
        $venvRoot = Split-Path -Parent (Split-Path -Parent $executablePath)
        if (-not (Test-Path $executablePath)) {
          python -m venv $venvRoot
        }
        & $executablePath -m pip install -r (Join-Path $svc.Cwd "requirements.txt")
        continue
      }
      python -m pip install -r (Join-Path $svc.Cwd "requirements.txt")
    } else {
      if (-not (Test-Path -LiteralPath (Join-Path $svc.Cwd "package-lock.json") -PathType Leaf)) {
        throw "Managed Node service is missing package-lock.json: $($svc.Name) ($($svc.Cwd))"
      }
      npm ci --prefix $svc.Cwd
    }
  }
}

$started = @()
$gatewayLaunch = $null
$stackStartedAt = (Get-Date).ToUniversalTime().ToString("o")

try {
foreach ($svc in $backends) {
  $name = $svc.Name
  $cwd = $svc.Cwd
  $envMap = $svc.Env
  $runtime = if ($svc.ContainsKey("Runtime") -and $svc.Runtime) { [string]$svc.Runtime } else { "node" }
  $executablePath = if ($svc.ContainsKey("Executable") -and $svc.Executable) { [string]$svc.Executable } else { "" }
  $entryPoint = if ($svc.ContainsKey("EntryPoint") -and $svc.EntryPoint) { [string]$svc.EntryPoint } else { if ($runtime -eq "python") { "app.py" } else { "server.js" } }
  $logPath = Join-Path $logDir "$name-$runStamp.log"
  $errorLogPath = Join-Path $logDir "$name-$runStamp.error.log"
  $launch = Start-XjkRuntimeProcess `
    -Name $name `
    -Runtime $runtime `
    -ExecutablePath $executablePath `
    -EntryPoint $entryPoint `
    -WorkingDirectory $cwd `
    -Environment $envMap `
    -LogPath $logPath `
    -ErrorLogPath $errorLogPath
  $started += $launch
  Write-XjkLocalProcessState `
    -Path $pidFile `
    -RepoRoot $repoRoot `
    -StartedAt $stackStartedAt `
    -Processes $started
  Start-Sleep -Milliseconds 450
}

$gatewayLog = Join-Path $logDir "gateway-$runStamp.log"
$gatewayErrorLog = Join-Path $logDir "gateway-$runStamp.error.log"

$gatewayScript = Join-Path $scriptDir "local-gateway.js"
$gatewayEnvironment = @{
  LOCAL_GATEWAY_PORT = "$GatewayPort"
  PREFER_LOCAL_SUBDOMAIN_REDIRECTS = if ($DisableSubdomainRedirects) { "0" } else { "1" }
  XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
}
foreach ($service in $platformManifest.services) {
  $environmentVariable = [string]$service.ports.localEnvironmentVariable
  $servicePort = [int]$localStackConfiguration.ServicePorts[[string]$service.id]
  $gatewayEnvironment[$environmentVariable] = "$servicePort"
}

if ($remoteTrackerProxyEnabled) {
  $gatewayEnvironment["REMOTE_TRACKER_ORIGIN"] = $RemoteTrackerOrigin
  if (-not [string]::IsNullOrWhiteSpace($RemoteTrackerHostHeader)) {
    $gatewayEnvironment["REMOTE_TRACKER_HOST_HEADER"] = $RemoteTrackerHostHeader
  }
}

if ($remoteServerProxyEnabled) {
  $gatewayEnvironment["REMOTE_SERVER_ORIGIN"] = $RemoteServerOrigin
}

if ($remoteAlteredProxyEnabled) {
  $gatewayEnvironment["REMOTE_ALTERED_ORIGIN"] = $RemoteAlteredOrigin
  if (-not [string]::IsNullOrWhiteSpace($RemoteAlteredHostHeader)) {
    $gatewayEnvironment["REMOTE_ALTERED_HOST_HEADER"] = $RemoteAlteredHostHeader
  }
}

if ($remoteAggregatorProxyEnabled) {
  $gatewayEnvironment["REMOTE_AGGREGATOR_ORIGIN"] = $RemoteAggregatorOrigin
  if (-not [string]::IsNullOrWhiteSpace($RemoteAggregatorHostHeader)) {
    $gatewayEnvironment["REMOTE_AGGREGATOR_HOST_HEADER"] = $RemoteAggregatorHostHeader
  }
}

$gatewayLaunch = Start-XjkRuntimeProcess `
  -Name "gateway" `
  -Runtime "node" `
  -EntryPoint $gatewayScript `
  -WorkingDirectory $repoRoot `
  -Environment $gatewayEnvironment `
  -LogPath $gatewayLog `
  -ErrorLogPath $gatewayErrorLog
$gatewayLaunch["port"] = $GatewayPort
Write-XjkLocalProcessState `
  -Path $pidFile `
  -RepoRoot $repoRoot `
  -StartedAt $stackStartedAt `
  -Gateway $gatewayLaunch `
  -Processes $started
Start-Sleep -Milliseconds 500
} catch {
  $startupError = $_
  $rollbackEntries = @($started)
  if ($gatewayLaunch) { $rollbackEntries += $gatewayLaunch }
  $rollbackResult = Stop-XjkOwnedRuntimeProcesses -Entries $rollbackEntries -RepoRoot $repoRoot -Quiet
  $unresolvedRollbackEntries = @($rollbackResult.UnresolvedEntries)
  if ($unresolvedRollbackEntries.Count) {
    Write-XjkLocalProcessState `
      -Path $pidFile `
      -RepoRoot $repoRoot `
      -StartedAt $stackStartedAt `
      -Processes $unresolvedRollbackEntries
  } else {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
  throw $startupError
}

Write-Host ""
Write-Host "Local stack started."
if ($remoteServerProxyEnabled) {
  Write-Host "Remote full proxy: enabled ($RemoteServerOrigin)"
} else {
  Write-Host "Remote full proxy: disabled (using local site frontends unless service-specific proxy overrides are enabled)"
}
if ($remoteAlteredProxyEnabled) {
  Write-Host "Remote altered proxy: enabled ($RemoteAlteredOrigin, host header $RemoteAlteredHostHeader)"
} else {
  Write-Host "Remote altered proxy: disabled (using local altered service)"
}
if ($remoteTrackerProxyEnabled) {
  Write-Host "Remote tracker proxy: enabled ($RemoteTrackerOrigin, host header $RemoteTrackerHostHeader)"
} else {
  Write-Host "Remote tracker proxy: disabled (using local tracker services)"
}
if ($remoteAggregatorProxyEnabled) {
  Write-Host "Remote aggregator proxy: enabled ($RemoteAggregatorOrigin, host header $RemoteAggregatorHostHeader)"
} else {
  Write-Host "Remote aggregator proxy: disabled (using local aggregator service)"
}
Write-XjkLocalSiteUrls -GatewayPort $GatewayPort -RepoRoot $repoRoot
Write-Host "Nested routes:"
Write-Host "  Altered banner builder: http://altered.localhost:$GatewayPort/bannerbuilder/"
Write-Host "  Altered admin:           http://altered.localhost:$GatewayPort/admin/"
Write-Host "    WR:          http://trackers.localhost:$GatewayPort/wr/"
Write-Host "    Leaderboard: http://trackers.localhost:$GatewayPort/leaderboard/"
Write-Host "    Displayname: http://trackers.localhost:$GatewayPort/displayname/"
Write-Host "    Club ingest: http://trackers.localhost:$GatewayPort/club/"
Write-Host "Legacy subdomain aliases:"
Write-Host "  http://alterednadeo.localhost:$GatewayPort/ -> altered"
Write-Host "  http://tracker.localhost:$GatewayPort/ -> trackers/wr"
Write-Host "  Legacy displayname host: http://tracker-displayname.localhost:$GatewayPort/ (redirects to /displayname)"
Write-Host "  Legacy club host: http://tracker-club.localhost:$GatewayPort/ (redirects to /club)"
Write-Host ""
if ($remoteServerProxyEnabled) {
  Write-Host "Path aliases (explicit remote-origin routes):"
} elseif ($DisableSubdomainRedirects) {
  Write-Host "Path aliases (served directly without subdomain redirects):"
} else {
  Write-Host "Path aliases (auto-redirect to subdomains):"
}
Write-XjkLocalPathUrls -GatewayPort $GatewayPort -RepoRoot $repoRoot
Write-Host "Nested path routes:"
Write-Host "  http://localhost:$GatewayPort/altered/admin/"
Write-Host "  http://localhost:$GatewayPort/trackers/wr/"
Write-Host "  http://localhost:$GatewayPort/trackers/leaderboard/"
Write-Host "  http://localhost:$GatewayPort/trackers/displayname/"
Write-Host "  http://localhost:$GatewayPort/trackers/club/"
Write-Host "  Legacy aliases:"
Write-Host "  http://localhost:$GatewayPort/tracker/"
Write-Host "  http://localhost:$GatewayPort/tracker-displayname/"
Write-Host "  http://localhost:$GatewayPort/tracker-club/"
Write-Host ""
Write-Host "Stop command:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\deploy\local\stop-local.ps1"
