param(
  [string]$RemoteRoot = "C:\srv\xjk"
)

$ErrorActionPreference = "Stop"

$requestsDir = Join-Path $RemoteRoot "deploy\ops-sync\refresh-requests"
$resultsDir = Join-Path $RemoteRoot "deploy\ops-sync\refresh-results"
$logsDir = Join-Path $RemoteRoot "deploy\ops-sync\refresh-logs"

New-Item -ItemType Directory -Path $requestsDir -Force | Out-Null
New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$requestFiles = Get-ChildItem -Path $requestsDir -Filter "*.json" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc

foreach ($requestFile in $requestFiles) {
  $requestId = [System.IO.Path]::GetFileNameWithoutExtension($requestFile.Name)
  $processingPath = Join-Path $requestsDir "$requestId.processing.json"
  $resultPath = Join-Path $resultsDir "$requestId.json"
  $logPath = Join-Path $logsDir "$requestId.log"

  try {
    Move-Item -Path $requestFile.FullName -Destination $processingPath -Force -ErrorAction Stop
  } catch {
    continue
  }

  $result = @{
    requestId = $requestId
    method = "queue-agent"
    completedAt = (Get-Date).ToString("o")
    ok = $false
    logPath = $logPath
  }

  try {
    $runningUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    if ($runningUser -match "(^|\\)SYSTEM$") {
      throw "Queue worker is running as SYSTEM. Reinstall task to run as Admin: deploy\\server\\setup-refresh-queue-agent.ps1 -TaskUser Admin"
    }

    $requestRaw = Get-Content -Path $processingPath -Raw -ErrorAction Stop
    $request = $requestRaw | ConvertFrom-Json -ErrorAction Stop

    $repoRoot = if ([string]::IsNullOrWhiteSpace($request.remoteRoot)) { $RemoteRoot } else { [string]$request.remoteRoot }
    $caddyConfig = if ([string]::IsNullOrWhiteSpace($request.caddyConfigPath)) { "deploy/Caddyfile.tunnel" } else { [string]$request.caddyConfigPath }
    $tunnelServiceName = if ([string]::IsNullOrWhiteSpace($request.tunnelServiceName)) { "xjk-cloudflared" } else { [string]$request.tunnelServiceName }
    $skipTunnelRestart = [bool]$request.skipTunnelRestart

    $applyScript = Join-Path $repoRoot "deploy\server\apply-update.ps1"
    if (-not (Test-Path $applyScript)) {
      throw "Missing apply script: $applyScript"
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File $applyScript `
      -RepoPath $repoRoot `
      -SkipGit `
      -SkipInstall `
      -CaddyConfigPath $caddyConfig *> $logPath

    if ($LASTEXITCODE -ne 0) {
      throw "apply-update.ps1 failed with exit code $LASTEXITCODE"
    }

    if (-not $skipTunnelRestart) {
      $svc = Get-Service -Name $tunnelServiceName -ErrorAction SilentlyContinue
      if ($svc) {
        if ($svc.Status -eq "Running") {
          Restart-Service -Name $tunnelServiceName -Force
        } else {
          Start-Service -Name $tunnelServiceName
        }
      }
    }

    $result.ok = $true
  } catch {
    $message = ($_.Exception.Message | Out-String).Trim()
    $result.error = $message
    Add-Content -Path $logPath -Value ""
    Add-Content -Path $logPath -Value "[queue-agent] ERROR: $message"
  } finally {
    $result.completedAt = (Get-Date).ToString("o")
    $result | ConvertTo-Json -Compress | Set-Content -Path $resultPath -Encoding ASCII
    Remove-Item -Path $processingPath -Force -ErrorAction SilentlyContinue
  }
}
