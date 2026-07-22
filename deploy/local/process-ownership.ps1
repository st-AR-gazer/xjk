function Get-XjkLocalProcessSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
  )

  try {
    $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    if ($cimProcess) { return $cimProcess }
  } catch {
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  try {
    return [pscustomobject]@{
      ProcessId = [int]$process.Id
      Name = [IO.Path]::GetFileName([string]$process.Path)
      ExecutablePath = [string]$process.Path
      CommandLine = ""
      CreationDate = $process.StartTime
    }
  } catch {
    return [pscustomobject]@{
      ProcessId = [int]$process.Id
      Name = [string]$process.Name
      ExecutablePath = ""
      CommandLine = ""
      CreationDate = $null
    }
  }
}

function Test-XjkLocalProcessOwnership {
  param(
    [object]$Process,
    [string]$RepoRoot,
    [int]$ExpectedPid,
    [string]$ExecutablePath,
    [string]$EntryPoint,
    [string]$CreatedAt,
    [double]$CreationToleranceSeconds = 1
  )

  if ($null -eq $Process) { return $false }
  if ($ExpectedPid -le 0 -or [int]$Process.ProcessId -ne $ExpectedPid) { return $false }
  if ([string]::IsNullOrWhiteSpace($RepoRoot) -or
      [string]::IsNullOrWhiteSpace($ExecutablePath) -or
      [string]::IsNullOrWhiteSpace($EntryPoint) -or
      [string]::IsNullOrWhiteSpace($CreatedAt)) {
    return $false
  }

  try {
    $resolvedRoot = [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
    $resolvedExecutable = [IO.Path]::GetFullPath($ExecutablePath)
    $resolvedEntryPoint = [IO.Path]::GetFullPath($EntryPoint)
    $rootPrefix = $resolvedRoot + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedEntryPoint.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      return $false
    }

    $actualExecutable = [IO.Path]::GetFullPath([string]$Process.ExecutablePath)
    if ($actualExecutable -ine $resolvedExecutable) { return $false }
    if ([string]$Process.Name -ine [IO.Path]::GetFileName($resolvedExecutable)) { return $false }

    $commandLine = [string]$Process.CommandLine
    if (-not [string]::IsNullOrWhiteSpace($commandLine) -and
        $commandLine.IndexOf($resolvedEntryPoint, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
      return $false
    }

    $expectedCreation = [DateTimeOffset]::Parse($CreatedAt).ToUniversalTime()
    $actualCreation = ([DateTimeOffset]([datetime]$Process.CreationDate)).ToUniversalTime()
    return [Math]::Abs(($actualCreation - $expectedCreation).TotalSeconds) -le [Math]::Max(0, $CreationToleranceSeconds)
  } catch {
    return $false
  }
}

function Stop-XjkOwnedRuntimeProcesses {
  param(
    [object[]]$Entries,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [switch]$Quiet
  )

  $ownedEntries = @($Entries | Where-Object { $null -ne $_ -and [int]$_.pid -gt 0 })
  [array]::Reverse($ownedEntries)
  $visitedPids = @{}
  $unresolvedEntries = @()

  foreach ($entry in $ownedEntries) {
    $processId = [int]$entry.pid
    if ($visitedPids.ContainsKey($processId)) { continue }
    $visitedPids[$processId] = $true

    $process = Get-XjkLocalProcessSnapshot -ProcessId $processId
    if ($null -eq $process) { continue }
    if (-not (Test-XjkLocalProcessOwnership `
        -Process $process `
        -RepoRoot $RepoRoot `
        -ExpectedPid $processId `
        -ExecutablePath ([string]$entry.executable) `
        -EntryPoint ([string]$entry.entrypoint) `
        -CreatedAt ([string]$entry.created_at))) {
      $unresolvedEntries += $entry
      if (-not $Quiet) { Write-Warning "Skipped PID $processId because it is not an owned xjk local-stack process." }
      continue
    }

    $treeStopSucceeded = $false
    try {
      & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
      $treeStopSucceeded = $LASTEXITCODE -eq 0
    } catch {
    }
    $stopRequested = $treeStopSucceeded
    if (-not $treeStopSucceeded) {
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stopRequested = $true
      } catch {
        if (-not $Quiet) {
          Write-Warning "Could not stop owned xjk local-stack PID ${processId}: $($_.Exception.Message)"
        }
      }
    }
    if ($stopRequested) {
      Wait-Process -Id $processId -Timeout 3 -ErrorAction SilentlyContinue
    }
    if ($null -ne (Get-XjkLocalProcessSnapshot -ProcessId $processId)) {
      $unresolvedEntries += $entry
      if (-not $Quiet) { Write-Warning "Owned xjk local-stack PID $processId remains live; its state was retained." }
      continue
    }
    if (-not $Quiet) { Write-Host "Stopped PID $processId" }
  }

  return [pscustomobject]@{ UnresolvedEntries = @($unresolvedEntries) }
}
