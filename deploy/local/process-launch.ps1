function Invoke-WithXjkProcessEnvironment {
  param(
    [hashtable]$Environment = @{},
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  $previousValues = @{}
  try {
    foreach ($entry in $Environment.GetEnumerator()) {
      $name = [string]$entry.Key
      if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Invalid process environment variable name: $name"
      }
      $previousValues[$name] = @{
        Exists = Test-Path -LiteralPath "Env:$name"
        Value  = [Environment]::GetEnvironmentVariable($name, "Process")
      }
      [Environment]::SetEnvironmentVariable($name, [string]$entry.Value, "Process")
    }

    return & $Action
  } finally {
    foreach ($entry in $previousValues.GetEnumerator()) {
      $name = [string]$entry.Key
      $previous = $entry.Value
      $value = if ($previous.Exists) { [string]$previous.Value } else { $null }
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Resolve-XjkRuntimeExecutable {
  param(
    [ValidateSet("node", "python")]
    [string]$Runtime,
    [string]$ExecutablePath = ""
  )

  if (-not [string]::IsNullOrWhiteSpace($ExecutablePath) -and (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
    return [IO.Path]::GetFullPath($ExecutablePath)
  }

  $command = Get-Command $Runtime -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $resolved = if ($command.Path) { [string]$command.Path } else { [string]$command.Source }
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    throw "Could not resolve the $Runtime runtime executable."
  }
  return [IO.Path]::GetFullPath($resolved)
}

function Start-XjkRuntimeProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [ValidateSet("node", "python")]
    [string]$Runtime,
    [string]$ExecutablePath = "",
    [Parameter(Mandatory = $true)]
    [string]$EntryPoint,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [hashtable]$Environment = @{},
    [Parameter(Mandatory = $true)]
    [string]$LogPath,
    [Parameter(Mandatory = $true)]
    [string]$ErrorLogPath
  )

  $resolvedWorkingDirectory = [IO.Path]::GetFullPath($WorkingDirectory)
  $resolvedEntryPoint = if ([IO.Path]::IsPathRooted($EntryPoint)) {
    [IO.Path]::GetFullPath($EntryPoint)
  } else {
    [IO.Path]::GetFullPath((Join-Path $resolvedWorkingDirectory $EntryPoint))
  }
  if (-not (Test-Path -LiteralPath $resolvedEntryPoint -PathType Leaf)) {
    throw "Runtime entry point does not exist: $resolvedEntryPoint"
  }

  $resolvedExecutable = Resolve-XjkRuntimeExecutable -Runtime $Runtime -ExecutablePath $ExecutablePath
  $resolvedLogPath = [IO.Path]::GetFullPath($LogPath)
  $resolvedErrorLogPath = [IO.Path]::GetFullPath($ErrorLogPath)
  if ($resolvedLogPath -ieq $resolvedErrorLogPath) {
    throw "Standard output and error logs must use different paths."
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedLogPath) | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedErrorLogPath) | Out-Null

  $process = Invoke-WithXjkProcessEnvironment -Environment $Environment -Action {
    Start-Process `
      -FilePath $resolvedExecutable `
      -ArgumentList @("`"$resolvedEntryPoint`"") `
      -WorkingDirectory $resolvedWorkingDirectory `
      -RedirectStandardOutput $resolvedLogPath `
      -RedirectStandardError $resolvedErrorLogPath `
      -PassThru `
      -WindowStyle Hidden
  }

  try {
    $createdAt = $process.StartTime.ToUniversalTime().ToString("o")
  } catch {
    $createdAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  return @{
    name       = $Name
    pid        = [int]$process.Id
    executable = $resolvedExecutable
    entrypoint = $resolvedEntryPoint
    created_at = $createdAt
    log        = $resolvedLogPath
    error_log  = $resolvedErrorLogPath
  }
}

function Write-XjkLocalProcessState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string]$StartedAt,
    [object]$Gateway = $null,
    [object[]]$Processes = @()
  )

  $payload = @{
    repo_root = [IO.Path]::GetFullPath($RepoRoot)
    started_at = $StartedAt
    gateway = $Gateway
    processes = @($Processes)
  }
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  $temporaryPath = "$resolvedPath.$PID.tmp"
  try {
    $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $resolvedPath -Force
  } finally {
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  }
}
