param(
  [string]$RepoPath = "C:\srv\xjk",
  [string]$Branch = "main",
  [switch]$SkipGit,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "deploy/Caddyfile"
)

$ErrorActionPreference = "Stop"

Write-Host "RepoPath: $RepoPath"
Write-Host "Branch:   $Branch"
Write-Host "SkipGit:  $SkipGit"
Write-Host "SkipInstall: $SkipInstall"
Write-Host "ForceInstall: $ForceInstall"

if (!(Test-Path $RepoPath)) {
  throw "Repo path does not exist: $RepoPath"
}

Set-Location $RepoPath

$beforeHead = ""
$afterHead = ""
$changedFiles = @()

if (-not $SkipGit) {
  $beforeHead = (git rev-parse HEAD).Trim()
  git fetch origin
  git checkout $Branch
  git pull --ff-only origin $Branch
  $afterHead = (git rev-parse HEAD).Trim()

  if ($beforeHead -and $afterHead -and ($beforeHead -ne $afterHead)) {
    $changedFiles = git diff --name-only "$beforeHead..$afterHead" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }
}

$normalizedChangedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($file in $changedFiles) {
  [void]$normalizedChangedFiles.Add(($file -replace "\\", "/"))
}

if ($beforeHead -and $afterHead) {
  Write-Host "Previous HEAD: $beforeHead"
  Write-Host "Current  HEAD: $afterHead"
}

if ($changedFiles.Count -gt 0) {
  Write-Host "Detected $($changedFiles.Count) changed file(s) in pulled range."
}

function Should-InstallDependencies {
  param(
    [string]$BackendDir,
    [string]$BackendPath
  )

  if ($ForceInstall) {
    return $true
  }

  if ($SkipInstall) {
    return $false
  }

  $nodeModulesPath = Join-Path $BackendPath "node_modules"
  if (!(Test-Path $nodeModulesPath)) {
    return $true
  }

  if ($SkipGit) {
    return $true
  }

  if ($normalizedChangedFiles.Count -eq 0) {
    return $false
  }

  $normalizedBackendDir = $BackendDir -replace "\\", "/"
  $packageJson = "$normalizedBackendDir/package.json"
  $packageLock = "$normalizedBackendDir/package-lock.json"

  return $normalizedChangedFiles.Contains($packageJson) -or $normalizedChangedFiles.Contains($packageLock)
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

function Invoke-NativeWithOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [string]$Label = "command"
  )

  $tempOut = [System.IO.Path]::GetTempFileName()
  $tempErr = [System.IO.Path]::GetTempFileName()
  try {
    $proc = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $ArgumentList `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $tempOut `
      -RedirectStandardError $tempErr

    if (Test-Path $tempOut) {
      Get-Content -Path $tempOut -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    }
    if (Test-Path $tempErr) {
      Get-Content -Path $tempErr -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    }

    if ($proc.ExitCode -ne 0) {
      throw "$Label failed with exit code $($proc.ExitCode)"
    }
  } finally {
    Remove-Item -Path $tempOut -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempErr -Force -ErrorAction SilentlyContinue
  }
}

$backendDirs = @(
  "services/altered",
  "services/tracker",
  "services/aggregator",
  "services/tracker-displayname",
  "services/tracker-club",
  "sites/plugins.xjk.yt/Plugins-Hub/backend",
  "sites/tools.xjk.yt/Tools-Hub/backend",
  "sites/tools.xjk.yt/Strip-RaceValidationGhost/backend",
  "sites/tools.xjk.yt/Embed-RaceValidationGhost/backend",
  "sites/tools.xjk.yt/Embedded-Blocks-And-Items-Checker/backend",
  "sites/tools.xjk.yt/Extract-Replay-Data/backend",
  "sites/tools.xjk.yt/Gbx-Medal-Time-Modifier/backend",
  "sites/tools.xjk.yt/Map-Validation-Checker/backend"
)

foreach ($dir in $backendDirs) {
  $full = Join-Path $RepoPath $dir
  if (!(Test-Path $full)) {
    throw "Missing backend directory: $full"
  }

  if (Should-InstallDependencies -BackendDir $dir -BackendPath $full) {
    Write-Host "Installing dependencies in $full"
    npm ci --prefix $full
  } else {
    Write-Host "Skipping dependency install in $full (no lockfile changes detected)."
  }
}

if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
  $env:APPDATA = Join-Path $env:USERPROFILE "AppData\Roaming"
}

$pm2HomeCandidates = @(
  $env:PM2_HOME,
  "C:\Users\Admin\.pm2",
  "C:\Users\Administrator\.pm2",
  $(if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) { Join-Path $env:USERPROFILE ".pm2" } else { "" })
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

$pm2Home = $null
foreach ($candidate in $pm2HomeCandidates) {
  if (Test-Path $candidate) {
    $pm2Home = $candidate
    break
  }
}
if (-not $pm2Home -and $pm2HomeCandidates.Count -gt 0) {
  $pm2Home = $pm2HomeCandidates[0]
}

if ($pm2Home) {
  $env:PM2_HOME = $pm2Home
  $pm2UserHome = Split-Path -Path $pm2Home -Parent
  if ($pm2UserHome) {
    if ([string]::IsNullOrWhiteSpace($env:HOME)) {
      $env:HOME = $pm2UserHome
    }
    if ([string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
      $env:USERPROFILE = $pm2UserHome
    }
    if ([string]::IsNullOrWhiteSpace($env:HOMEPATH) -or [string]::IsNullOrWhiteSpace($env:HOMEDRIVE)) {
      $homeRoot = [System.IO.Path]::GetPathRoot($pm2UserHome)
      if ($homeRoot) {
        $env:HOMEDRIVE = $homeRoot.TrimEnd("\")
        $env:HOMEPATH = $pm2UserHome.Substring($homeRoot.Length - 1)
      }
    }
  }
}

$pm2Path = Resolve-CommandPath -Name "pm2" -FallbackPaths @(
  (Join-Path $env:APPDATA "npm\pm2.cmd"),
  (Join-Path $env:APPDATA "npm\pm2.ps1"),
  "C:\Users\Admin\AppData\Roaming\npm\pm2.cmd",
  "C:\Users\Admin\AppData\Roaming\npm\pm2.ps1",
  "C:\Program Files\nodejs\pm2.cmd"
)

if (-not $pm2Path) {
  throw "pm2 is not installed or not in PATH."
}

function Test-LocalHttpHealth {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -TimeoutSec 5 -ErrorAction Stop
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Ensure-Pm2AppHealthyOnPort {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Pm2Exe,
    [Parameter(Mandatory = $true)]
    [string]$AppName,
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [string]$HealthPath = "/",
    [switch]$ForceRestart
  )

  $healthUrl = "http://127.0.0.1:$Port$HealthPath"
  $hasHealthyListener = Test-LocalHttpHealth -Url $healthUrl
  $pm2Status = $null
  try {
    $pm2ListRaw = & $Pm2Exe jlist
    if ($LASTEXITCODE -eq 0 -and $pm2ListRaw) {
      $pm2Apps = $pm2ListRaw | ConvertFrom-Json
      $pm2App = $pm2Apps | Where-Object { $_.name -eq $AppName } | Select-Object -First 1
      if ($pm2App) {
        $pm2Status = [string]$pm2App.pm2_env.status
      }
    }
  } catch {
    $pm2Status = $null
  }

  if ((-not $ForceRestart) -and $hasHealthyListener -and ($pm2Status -eq "online" -or [string]::IsNullOrWhiteSpace($pm2Status))) {
    return
  }

  if ($ForceRestart) {
    Write-Host "Force restarting PM2 app '$AppName' on port $Port"
  } elseif ($hasHealthyListener -and -not [string]::IsNullOrWhiteSpace($pm2Status) -and $pm2Status -ne "online") {
    Write-Host "PM2 app '$AppName' is '$pm2Status' while port $Port is still responding; replacing stale listener."
  }

  $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener -and $listener.OwningProcess) {
    $listenerPid = [int]$listener.OwningProcess
    if ($listenerPid -gt 0) {
      try {
        $proc = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
        if ($proc) {
          $procPath = if ($proc.Path) { $proc.Path } else { "<unknown>" }
          Write-Host "Clearing port conflict for $AppName on $Port by stopping PID $listenerPid ($($proc.ProcessName)) [$procPath]"
        } else {
          Write-Host "Clearing port conflict for $AppName on $Port by stopping PID $listenerPid"
        }
      } catch {}

      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
  }

  Write-Host "Restarting PM2 app '$AppName' to recover health on port $Port"
  & $Pm2Exe restart $AppName --update-env
  Start-Sleep -Seconds 2

  if (-not (Test-LocalHttpHealth -Url $healthUrl)) {
    Write-Warning "Health check still failing for '$AppName' at $healthUrl"
  }
}

Write-Host "Using PM2: $pm2Path"
Write-Host "Reloading PM2 apps"
& $pm2Path startOrReload (Join-Path $RepoPath "deploy/server/ecosystem.config.cjs") --update-env

# Guard against stale/orphan listeners that leave critical apps stopped.
Ensure-Pm2AppHealthyOnPort -Pm2Exe $pm2Path -AppName "xjk-tracker-hub" -Port 3031 -HealthPath "/api/v1/tracker/status"
Ensure-Pm2AppHealthyOnPort -Pm2Exe $pm2Path -AppName "xjk-aggregator-hub" -Port 3040 -HealthPath "/health" -ForceRestart

& $pm2Path save

$caddyServiceExe = $null
try {
  $caddyService = Get-CimInstance Win32_Service -Filter "Name='xjk-caddy'" -ErrorAction SilentlyContinue
  if ($caddyService -and $caddyService.PathName) {
    $pathName = [string]$caddyService.PathName
    if ($pathName -match '^\s*"([^"]+)"') {
      $caddyServiceExe = $matches[1]
    } else {
      $caddyServiceExe = ($pathName -split "\s+")[0]
    }
  }
} catch {
  $caddyServiceExe = $null
}

$caddyPath = Resolve-CommandPath -Name "caddy" -FallbackPaths @(
  $caddyServiceExe,
  "C:\Program Files\Caddy\caddy.exe",
  "C:\Program Files\caddy\caddy.exe",
  "C:\caddy\caddy.exe"
)

if (-not $caddyPath) {
  throw "caddy is not installed or not in PATH."
}
Write-Host "Using Caddy: $caddyPath"

$resolvedCaddyConfig = if ([System.IO.Path]::IsPathRooted($CaddyConfigPath)) {
  $CaddyConfigPath
} else {
  Join-Path $RepoPath $CaddyConfigPath
}

if (!(Test-Path $resolvedCaddyConfig)) {
  throw "Caddy config file not found: $resolvedCaddyConfig"
}

Write-Host "Validating Caddy config"
Invoke-NativeWithOutput -FilePath $caddyPath -ArgumentList @("validate", "--config", $resolvedCaddyConfig) -Label "caddy validate"

Write-Host "Reloading Caddy config"
Invoke-NativeWithOutput -FilePath $caddyPath -ArgumentList @("reload", "--config", $resolvedCaddyConfig) -Label "caddy reload"

Write-Host "Deployment complete."
