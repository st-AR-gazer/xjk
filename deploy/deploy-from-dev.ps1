param(
  [string]$Server = "",
  [string]$RemoteRepoPath = "",
  [string]$Branch = "",
  [Alias("SkipPush")]
  [switch]$SkipSync,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "",
  [switch]$DirectApply,
  [int]$RefreshTimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

function Read-DeploymentEnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  $values = @{}
  if (!(Test-Path $FilePath)) {
    return $values
  }

  foreach ($line in Get-Content -Path $FilePath) {
    $trimmed = [string]$line
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      continue
    }
    $trimmed = $trimmed.Trim()
    if ($trimmed.StartsWith("#")) {
      continue
    }
    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }
    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $values[$key] = $value
    }
  }

  return $values
}

function Resolve-CommandPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string[]]$FallbackPaths = @()
  )

  $resolved = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($resolved -and $resolved.Source) {
    return [string]$resolved.Source
  }

  foreach ($candidate in $FallbackPaths) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path $candidate) {
      return [string]$candidate
    }
  }

  return $null
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [string]$Label = "command"
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Invoke-RemotePowerShell {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SshExe,
    [Parameter(Mandatory = $true)]
    [string]$Target,
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
  Invoke-Native -FilePath $SshExe -ArgumentList @(
    $Target,
    "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
  ) -Label "remote powershell"
}

function Invoke-RemoteRefreshQueue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SshExe,
    [Parameter(Mandatory = $true)]
    [string]$Target,
    [Parameter(Mandatory = $true)]
    [string]$RemoteRoot,
    [Parameter(Mandatory = $true)]
    [string]$CaddyConfigPath,
    [int]$TimeoutSeconds = 900
  )

  $requestId = "refresh-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), ([guid]::NewGuid().ToString("N").Substring(0, 8))
  $escapedRemoteRoot = $RemoteRoot.Replace("'", "''")
  $escapedCaddyConfigPath = $CaddyConfigPath.Replace("'", "''")
  $escapedRequestId = $requestId.Replace("'", "''")
  $safeTimeoutSeconds = [Math]::Max(30, $TimeoutSeconds)

  $script = @"
`$ErrorActionPreference = "Stop"
`$remoteRoot = '$escapedRemoteRoot'
`$requestId = '$escapedRequestId'
`$caddyConfigPath = '$escapedCaddyConfigPath'
`$timeoutSeconds = $safeTimeoutSeconds
`$requestsDir = Join-Path `$remoteRoot 'deploy\ops-sync\refresh-requests'
`$resultsDir = Join-Path `$remoteRoot 'deploy\ops-sync\refresh-results'
`$logsDir = Join-Path `$remoteRoot 'deploy\ops-sync\refresh-logs'
New-Item -ItemType Directory -Path `$requestsDir -Force | Out-Null
New-Item -ItemType Directory -Path `$resultsDir -Force | Out-Null
New-Item -ItemType Directory -Path `$logsDir -Force | Out-Null
`$requestPath = Join-Path `$requestsDir (`$requestId + '.json')
`$resultPath = Join-Path `$resultsDir (`$requestId + '.json')
`$logPath = Join-Path `$logsDir (`$requestId + '.log')
if (Test-Path `$resultPath) { Remove-Item -Path `$resultPath -Force -ErrorAction SilentlyContinue }
`$payload = @{
  requestId = `$requestId
  requestedAt = (Get-Date).ToString('o')
  remoteRoot = `$remoteRoot
  caddyConfigPath = `$caddyConfigPath
  tunnelServiceName = 'xjk-cloudflared'
  skipTunnelRestart = `$true
}
`$payload | ConvertTo-Json -Compress | Set-Content -Path `$requestPath -Encoding ASCII
Write-Host "Queued elevated service refresh: `$requestId"
`$deadline = (Get-Date).AddSeconds(`$timeoutSeconds)
while ((Get-Date) -lt `$deadline) {
  if (Test-Path `$resultPath) {
    `$statusRaw = Get-Content -Path `$resultPath -Raw
    `$status = `$statusRaw | ConvertFrom-Json
    if (`$status.ok) {
      Write-Host "Remote service refresh completed. Log: `$logPath"
      exit 0
    }
    `$errorText = if (`$status.error) { [string]`$status.error } else { 'Unknown queue-agent failure.' }
    if (Test-Path `$logPath) {
      Write-Host "---- queue-agent log tail ----"
      Get-Content -Path `$logPath -Tail 80 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host `$_.ToString() }
      Write-Host "---- end queue-agent log tail ----"
    }
    throw "Remote service refresh failed: `$errorText"
  }
  Start-Sleep -Seconds 2
}
throw "Timed out waiting for elevated refresh queue after `$timeoutSeconds seconds. Ensure deploy\server\setup-refresh-queue-agent.ps1 is installed and running on the server."
"@

  Invoke-RemotePowerShell -SshExe $SshExe -Target $Target -Script $script
}

function Should-IncludeRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $normalized = ($RelativePath -replace "\\", "/").TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return $false
  }

  $excludePatterns = @(
    '(^|/)\.git(/|$)',
    '(^|/)\.venv(/|$)',
    '(^|/)node_modules(/|$)',
    '(^|/)deploy/local(/|$)',
    '(^|/)deploy/ops-sync(/|$)',
    '(^|/)deploy/server/apply-update\.ps1$',
    '(^|/)deploy/server/winsw/WinSW\.exe$',
    '(^|/)deploy/server/winsw/services(/|$)',
    '(^|/)docs(/|$)',
    '(^|/)zDeploy(/|$)',
    '(^|/)tmp(/|$)',
    '(^|/)tmp_[^/]+$',
    '(^|/)logs(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Embed-RaceValidationGhost/data(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Embedded-Blocks-And-Items-Checker/data(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Extract-Replay-Data/data(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Gbx-Medal-Time-Modifier/data(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Map-Validation-Checker/data(/|$)',
    '(^|/)sites/tools\.xjk\.yt/Strip-RaceValidationGhost/data(/|$)',
    '(^|/)services/bannerbuilder/static/banners(/|$)',
    '(^|/)sites/altered\.xjk\.yt/data_server(/|$)',
    '(^|/)sites/altered\.xjk\.yt/data(/|$)',
    '(^|/)\.claude(/|$)',
    '(^|/)\.env$',
    '(^|/)\.env\.local$',
    '(^|/)\.env\..+\.local$',
    '\.sqlite$',
    '\.sqlite-shm$',
    '\.sqlite-wal$',
    '\.db$',
    '\.db-shm$',
    '\.db-wal$',
    '\.log$',
    '(^|/)nadeo-token-cache\.json$',
    '(^|/).*token-cache.*\.json$',
    '(^|/)diagnostics.*\.txt$',
    '(^|/)targeted-diagnostics.*\.txt$',
    '(^|/)Thumbs\.db$',
    '(^|/)\.DS_Store$',
    '\.swp$',
    '\.swo$'
  )

  foreach ($pattern in $excludePatterns) {
    if ($normalized -match $pattern) {
      return $false
    }
  }

  return $true
}

function New-DeploymentArchive {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRoot,
    [Parameter(Mandatory = $true)]
    [string]$DestinationArchive
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  if (Test-Path $DestinationArchive) {
    Remove-Item -Path $DestinationArchive -Force
  }

  $resolvedRoot = (Resolve-Path $SourceRoot).Path.TrimEnd("\", "/")
  $rootPrefix = "$resolvedRoot\"
  $compression = [System.IO.Compression.CompressionLevel]::Optimal
  $zip = [System.IO.Compression.ZipFile]::Open(
    $DestinationArchive,
    [System.IO.Compression.ZipArchiveMode]::Create
  )

  try {
    $files = Get-ChildItem -Path $resolvedRoot -Recurse -File -Force
    foreach ($file in $files) {
      $fullName = $file.FullName
      if (-not $fullName.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
      }

      $relativePath = $fullName.Substring($rootPrefix.Length)
      if (-not (Should-IncludeRelativePath -RelativePath $relativePath)) {
        continue
      }

      $entryName = ($relativePath -replace "\\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $fullName,
        $entryName,
        $compression
      ) | Out-Null
    }
  } finally {
    $zip.Dispose()
  }
}

$sshPath = Resolve-CommandPath -Name "ssh" -FallbackPaths @(
  "C:\Windows\System32\OpenSSH\ssh.exe"
)
if (-not $sshPath) {
  throw "ssh is not installed or not in PATH."
}

$scpPath = Resolve-CommandPath -Name "scp" -FallbackPaths @(
  "C:\Windows\System32\OpenSSH\scp.exe"
)
if (-not $scpPath) {
  throw "scp is not installed or not in PATH."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$deployEnvPath = Join-Path $PSScriptRoot ".env"
$deployEnv = Read-DeploymentEnvFile -FilePath $deployEnvPath

if ([string]::IsNullOrWhiteSpace($Server)) {
  $Server = [string]($deployEnv["DEPLOY_SERVER"])
}
if ([string]::IsNullOrWhiteSpace($RemoteRepoPath)) {
  $RemoteRepoPath = [string]($deployEnv["DEPLOY_REMOTE_REPO_PATH"])
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = [string]($deployEnv["DEPLOY_BRANCH"])
}
if ([string]::IsNullOrWhiteSpace($CaddyConfigPath)) {
  $CaddyConfigPath = [string]($deployEnv["DEPLOY_CADDY_CONFIG_PATH"])
}

if ([string]::IsNullOrWhiteSpace($Server)) {
  $Server = "user@your-server"
}
if ([string]::IsNullOrWhiteSpace($RemoteRepoPath)) {
  $RemoteRepoPath = "D:\srv\xjk"
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = "main"
}
if ([string]::IsNullOrWhiteSpace($CaddyConfigPath)) {
  $CaddyConfigPath = "deploy/Caddyfile"
}

if ($Server -eq "user@your-server") {
  throw "Missing deploy server. Set DEPLOY_SERVER in deploy/.env or pass -Server."
}

$remoteArchiveName = "xjk-deploy-workspace.zip"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ("xjk-deploy-" + [guid]::NewGuid().ToString("N") + ".zip")

try {
  if (-not $SkipSync) {
    Write-Host "Creating deployment archive from current workspace"
    New-DeploymentArchive -SourceRoot $repoRoot -DestinationArchive $archivePath

    Write-Host "Uploading workspace archive to $Server"
    Invoke-Native -FilePath $scpPath -ArgumentList @(
      $archivePath,
      "${Server}:$remoteArchiveName"
    ) -Label "scp upload"

    $escapedRepoPath = $RemoteRepoPath.Replace("'", "''")
    $escapedArchiveName = $remoteArchiveName.Replace("'", "''")
    $extractScript = "`$repoPath = '$escapedRepoPath'" + "`n" +
      "`$archivePath = Join-Path `$HOME '$escapedArchiveName'" + "`n" +
      "if (!(Test-Path `$repoPath)) { throw `"Repo path does not exist: `$repoPath`" }" + "`n" +
      "if (!(Test-Path `$archivePath)) { throw `"Uploaded archive not found: `$archivePath`" }" + "`n" +
      "Expand-Archive -Path `$archivePath -DestinationPath `$repoPath -Force" + "`n" +
      "Remove-Item -Path `$archivePath -Force -ErrorAction SilentlyContinue"
    Write-Host "Extracting workspace archive on $Server"
    Invoke-RemotePowerShell -SshExe $sshPath -Target $Server -Script $extractScript
  } else {
    Write-Host "Skipping workspace sync"
  }

  if ($DirectApply) {
    $applyScript = "$RemoteRepoPath\deploy\server\apply-update-winsw.ps1"
    $applyArgs = "-RepoPath '$RemoteRepoPath' -SkipGit -CaddyConfigPath '$CaddyConfigPath'"

    if ($SkipInstall) {
      $applyArgs += " -SkipInstall"
    }

    if ($ForceInstall) {
      $applyArgs += " -ForceInstall"
    }

    $remoteApplyScript = "& '$applyScript' $applyArgs"

    Write-Host "Running remote deployment directly on $Server"
    Invoke-RemotePowerShell -SshExe $sshPath -Target $Server -Script $remoteApplyScript
  } else {
    if ($ForceInstall) {
      throw "-ForceInstall requires -DirectApply or an elevated server session. The refresh queue is for normal service restarts."
    }
    if (-not $SkipInstall) {
      Write-Host "Queue deploys run with SkipInstall semantics. Use -DirectApply from an elevated session for dependency installs."
    }
    Write-Host "Queueing elevated remote service refresh on $Server"
    Invoke-RemoteRefreshQueue `
      -SshExe $sshPath `
      -Target $Server `
      -RemoteRoot $RemoteRepoPath `
      -CaddyConfigPath $CaddyConfigPath `
      -TimeoutSeconds $RefreshTimeoutSeconds
  }
} finally {
  if (Test-Path $archivePath) {
    Remove-Item -Path $archivePath -Force -ErrorAction SilentlyContinue
  }
}
