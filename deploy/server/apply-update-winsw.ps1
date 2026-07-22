param(
  [string]$RepoPath = "D:\srv\xjk",
  [string]$Branch = "main",
  [string[]]$ServiceName = @(),
  [switch]$SkipGit,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [string]$CaddyConfigPath = "deploy/Caddyfile",
  [switch]$SkipServices,
  [switch]$SkipHealthCheck,
  [switch]$SkipCaddy,
  [switch]$IncludePublicHealthChecks
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\platform-manifest.ps1")
. (Join-Path $PSScriptRoot "..\powershell-runtime.ps1")

function Invoke-NativeAllowingStderr {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [string]$Label = "command"
  )

  $quotedFilePath = '"' + $FilePath.Replace('"', '""') + '"'
  $quotedArguments = @($ArgumentList | ForEach-Object {
      '"' + ([string]$_).Replace('"', '""') + '"'
    }) -join " "
  $commandLine = "$quotedFilePath $quotedArguments 2>&1"

  $output = & cmd.exe /d /c $commandLine
  foreach ($line in @($output)) {
    if ($null -eq $line) {
      continue
    }

    Write-Host ($line.ToString())
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Resolve-RepoPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Repo path does not exist: $Path"
  }

  return (Resolve-Path -LiteralPath $Path).Path
}

function Invoke-GitUpdate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [string]$Branch = "main"
  )

  $gitExe = Resolve-XjkCommandPath -Name "git" -FallbackPaths @(
    "C:\Program Files\Git\cmd\git.exe"
  )
  if (-not $gitExe) {
    throw "git is not installed or not in PATH."
  }

  $gitDir = Join-Path $RepoPath ".git"
  if (-not (Test-Path -LiteralPath $gitDir)) {
    Write-Host "Skipping git update because $RepoPath is not a git checkout."
    return
  }

  Push-Location $RepoPath
  try {
    Invoke-XjkNative -FilePath $gitExe -ArgumentList @("fetch", "origin") -Label "git fetch"
    Invoke-XjkNative -FilePath $gitExe -ArgumentList @("checkout", $Branch) -Label "git checkout"
    Invoke-XjkNative -FilePath $gitExe -ArgumentList @("pull", "--ff-only", "origin", $Branch) -Label "git pull"
  } finally {
    Pop-Location
  }
}

function Install-NodeDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $npm = Resolve-XjkCommandPath -Name "npm" -FallbackPaths @(
    "C:\Program Files\nodejs\npm.cmd",
    "C:\Program Files (x86)\nodejs\npm.cmd"
  )
  if (-not $npm) {
    throw "npm is not installed or not in PATH."
  }

  $backendDirs = Get-XjkNodeServiceDirectories -RepoRoot $RepoPath

  foreach ($dir in $backendDirs) {
    $full = Join-Path $RepoPath $dir
    if (-not (Test-Path -LiteralPath (Join-Path $full "package.json") -PathType Leaf)) {
      throw "Managed Node service is missing package.json: $dir"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $full "package-lock.json") -PathType Leaf)) {
      throw "Managed Node service is missing package-lock.json: $dir"
    }

    Write-Host "Installing Node dependencies: $dir"
    Invoke-XjkNative -FilePath $npm -ArgumentList @("ci", "--prefix", $full) -Label "npm ci $dir"
  }
}

function Install-BannerBuilderDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $bannerBuilderDir = Join-Path $RepoPath "services\bannerbuilder"
  $requirementsPath = Join-Path $bannerBuilderDir "requirements.txt"
  if (-not (Test-Path -LiteralPath $requirementsPath)) {
    Write-Host "Skipping bannerbuilder Python install; requirements.txt not found."
    return
  }

  $python = Resolve-XjkCommandPath -Name "python" -FallbackPaths @(
    $env:XJK_PYTHON_PATH,
    "C:\Program Files\Python312\python.exe",
    "C:\Program Files\Python311\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe" })
  )
  $pythonArgsPrefix = @()
  if (-not $python) {
    $pyLauncher = Resolve-XjkCommandPath -Name "py" -FallbackPaths @("C:\Windows\py.exe")
    if ($pyLauncher) {
      $python = $pyLauncher
      $pythonArgsPrefix = @("-3.12")
    }
  }
  if (-not $python) {
    throw "python is not installed or not in PATH."
  }

  $venvDir = Join-Path $bannerBuilderDir ".venv"
  $venvPython = Join-Path $venvDir "Scripts\python.exe"

  $venvOk = $false
  if (Test-Path -LiteralPath $venvPython) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      & $venvPython --version *> $null
      $venvOk = ($LASTEXITCODE -eq 0)
    } catch {
      $venvOk = $false
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  }

  if (-not $venvOk) {
    if (Test-Path -LiteralPath $venvDir) {
      Write-Host "Removing broken bannerbuilder Python venv"
      Remove-Item -LiteralPath $venvDir -Recurse -Force
    }
    Write-Host "Creating bannerbuilder Python venv"
    Invoke-XjkNative -FilePath $python -ArgumentList ($pythonArgsPrefix + @("-m", "venv", $venvDir)) -Label "python venv"
  }

  & $venvPython --version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Bannerbuilder venv is still unusable after recreation: $venvPython"
  }

  Write-Host "Installing bannerbuilder Python dependencies"
  Invoke-XjkNative -FilePath $venvPython -ArgumentList @("-m", "pip", "install", "-r", $requirementsPath) -Label "bannerbuilder pip install"
}

function Invoke-ServiceDeployment {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [string[]]$ServiceName = @(),
    [switch]$ForceInstall,
    [switch]$SkipHealthCheck
  )

  $installServicesScript = Join-Path $RepoPath "deploy\server\services\install-services.ps1"
  $restartServicesScript = Join-Path $RepoPath "deploy\server\services\restart-services.ps1"
  $healthCheckScript = Join-Path $RepoPath "deploy\server\services\health-check.ps1"

  foreach ($script in @($installServicesScript, $restartServicesScript, $healthCheckScript)) {
    if (-not (Test-Path -LiteralPath $script)) {
      throw "Missing deploy helper: $script"
    }
  }

  $installArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $installServicesScript, "-RepoPath", $RepoPath)
  foreach ($name in $ServiceName) {
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $installArgs += @("-ServiceName", $name)
    }
  }
  if ($ForceInstall) {
    $installArgs += "-Force"
  }

  Invoke-XjkNative -FilePath "powershell" -ArgumentList $installArgs -Label "install-services.ps1"
  $restartArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $restartServicesScript,
    "-RepoPath",
    $RepoPath
  )
  foreach ($name in $ServiceName) {
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $restartArgs += @("-ServiceName", $name)
    }
  }
  Invoke-XjkNative -FilePath "powershell" -ArgumentList $restartArgs -Label "restart-services.ps1"

  if (-not $SkipHealthCheck) {
    $healthArgs = @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $healthCheckScript,
      "-RepoPath",
      $RepoPath
    )
    foreach ($name in $ServiceName) {
      if (-not [string]::IsNullOrWhiteSpace($name)) {
        $healthArgs += @("-ServiceName", $name)
      }
    }
    Invoke-XjkNative -FilePath "powershell" -ArgumentList $healthArgs -Label "health-check.ps1"
  }
}

function Invoke-CaddyReload {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [Parameter(Mandatory = $true)]
    [string]$CaddyConfigPath
  )

  $resolvedCaddyConfig = if ([System.IO.Path]::IsPathRooted($CaddyConfigPath)) {
    $CaddyConfigPath
  } else {
    Join-Path $RepoPath $CaddyConfigPath
  }

  if (-not (Test-Path -LiteralPath $resolvedCaddyConfig)) {
    throw "Caddy config file not found: $resolvedCaddyConfig"
  }

  $caddyExe = Resolve-XjkCommandPath -Name "caddy" -FallbackPaths @(
    $env:XJK_CADDY_PATH,
    "C:\Program Files\Caddy\caddy.exe",
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\caddy.exe" })
  )
  if (-not $caddyExe) {
    throw "caddy is not installed or not in PATH."
  }

  Write-Host "Validating Caddy config"
  Invoke-NativeAllowingStderr -FilePath $caddyExe -ArgumentList @("validate", "--config", $resolvedCaddyConfig) -Label "caddy validate"

  $serviceName = "xjk-caddy"
  $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Host "Installing Caddy WinSW service: $serviceName"
    $installInfraScript = Join-Path $RepoPath "deploy\server\services\install-infrastructure-services.ps1"
    if (-not (Test-Path -LiteralPath $installInfraScript)) {
      throw "Missing infrastructure service installer: $installInfraScript"
    }
    Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $installInfraScript,
      "-RepoPath",
      $RepoPath,
      "-ServiceName",
      $serviceName,
      "-CaddyConfigPath",
      $CaddyConfigPath
    ) -Label "install-infrastructure-services.ps1"
    $svc = Get-Service -Name $serviceName
  }

  if ($svc.Status -eq "Running") {
    Write-Host "Reloading Caddy"
    Invoke-NativeAllowingStderr -FilePath $caddyExe -ArgumentList @("reload", "--config", $resolvedCaddyConfig) -Label "caddy reload"
  } else {
    Write-Host "Starting Caddy service"
    Start-Service -Name $serviceName
  }
}

$repoRoot = Resolve-RepoPath -Path $RepoPath

if (-not $SkipGit) {
  Invoke-GitUpdate -RepoPath $repoRoot -Branch $Branch
} else {
  Write-Host "Skipping git update"
}

if (-not $SkipInstall) {
  Install-NodeDependencies -RepoPath $repoRoot
  Install-BannerBuilderDependencies -RepoPath $repoRoot
} else {
  Write-Host "Skipping dependency install"
}

if (-not $SkipServices) {
  Invoke-ServiceDeployment -RepoPath $repoRoot -ServiceName $ServiceName -ForceInstall:$ForceInstall -SkipHealthCheck:$SkipHealthCheck
} else {
  Write-Host "Skipping WinSW service deployment"
}

if (-not $SkipCaddy) {
  Invoke-CaddyReload -RepoPath $repoRoot -CaddyConfigPath $CaddyConfigPath
} else {
  Write-Host "Skipping Caddy reload"
}

if ($IncludePublicHealthChecks -and -not $SkipHealthCheck) {
  $healthCheckScript = Join-Path $repoRoot "deploy\server\services\health-check.ps1"
  Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $healthCheckScript,
    "-RepoPath",
    $repoRoot,
    "-IncludePublic"
  ) -Label "public health-check.ps1"
}

$runValidifierSmoke = @("1", "true", "yes", "on") -contains ([string]$env:VALIDIFIER_ENABLE_DEPLOY_SMOKE).Trim().ToLowerInvariant()
if ($runValidifierSmoke -and -not $SkipHealthCheck) {
  $validifierSmokeScript = Join-Path $repoRoot "deploy\server\run-validifier-replay-smoke.ps1"
  if (-not (Test-Path -LiteralPath $validifierSmokeScript)) {
    throw "Missing Validifier deploy smoke script: $validifierSmokeScript"
  }
  Invoke-XjkNative -FilePath "powershell" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $validifierSmokeScript,
    "-RepoPath",
    $repoRoot
  ) -Label "run-validifier-replay-smoke.ps1"
}

Write-Host "Deploy apply complete."
