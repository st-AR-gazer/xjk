[CmdletBinding()]
param(
  [string]$RepoPath = "",
  [string]$MapFixturePath = $env:XJK_TOOL_SMOKE_MAP_PATH,
  [string]$ReplayFixturePath = $env:XJK_TOOL_SMOKE_REPLAY_PATH,
  [string]$GhostFixturePath = $env:XJK_TOOL_SMOKE_GHOST_PATH,
  [string]$UnderwaterMapFixturePath = $env:XJK_TOOL_SMOKE_UNDERWATER_MAP_PATH,
  [int]$TimeoutSeconds = 180,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "path-safety.ps1")

function Resolve-XjkSmokeFixture {
  param(
    [string]$PathValue,
    [string]$Label
  )
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return "" }
  $resolved = [System.IO.Path]::GetFullPath($PathValue)
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "$Label fixture does not exist: $resolved"
  }
  return $resolved
}

function ConvertTo-XjkWindowsArgument {
  param([AllowEmptyString()][string]$Value)
  if ($Value -notmatch '[\s"]' -and $Value.Length -gt 0) { return $Value }
  $builder = [System.Text.StringBuilder]::new()
  [void]$builder.Append('"')
  $backslashes = 0
  foreach ($character in $Value.ToCharArray()) {
    if ($character -eq '\') {
      $backslashes++
      continue
    }
    if ($character -eq '"') {
      [void]$builder.Append(('\' * ($backslashes * 2 + 1)))
      [void]$builder.Append('"')
      $backslashes = 0
      continue
    }
    if ($backslashes -gt 0) {
      [void]$builder.Append(('\' * $backslashes))
      $backslashes = 0
    }
    [void]$builder.Append($character)
  }
  if ($backslashes -gt 0) { [void]$builder.Append(('\' * ($backslashes * 2))) }
  [void]$builder.Append('"')
  return $builder.ToString()
}

function Invoke-XjkSmokeProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,
    [string[]]$Arguments = @(),
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,
    [hashtable]$Environment = @{},
    [int]$TimeoutSeconds = 180
  )
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $Executable
  $startInfo.Arguments = (@($Arguments | ForEach-Object { ConvertTo-XjkWindowsArgument -Value ([string]$_) }) -join ' ')
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($entry in $Environment.GetEnumerator()) {
    $startInfo.EnvironmentVariables[[string]$entry.Key] = [string]$entry.Value
  }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) { throw "Failed to start $Executable" }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      try { $process.Kill() } catch {}
      throw "Native smoke process timed out after $TimeoutSeconds seconds: $Executable"
    }
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = $stdout.GetAwaiter().GetResult()
      Stderr = $stderr.GetAwaiter().GetResult()
    }
  } finally {
    $process.Dispose()
  }
}

function Get-XjkRuntimeDestination {
  param(
    [Parameter(Mandatory = $true)]$PlatformManifest,
    [Parameter(Mandatory = $true)]$RuntimeManifest,
    [Parameter(Mandatory = $true)][string]$ServiceId,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )
  $tool = @($PlatformManifest.tools | Where-Object { [string]$_.serviceId -ceq $ServiceId }) | Select-Object -First 1
  if (-not $tool -or [string]::IsNullOrWhiteSpace([string]$tool.runtimeFileId)) { return "" }
  $runtimeFile = @($RuntimeManifest.files | Where-Object { [string]$_.id -ceq [string]$tool.runtimeFileId }) | Select-Object -First 1
  if (-not $runtimeFile) { throw "$ServiceId references unknown runtimeFileId $($tool.runtimeFileId)." }
  $toolPrefix = "sites/tools.xjk.yt/$([string]$tool.path)/tools/"
  $destination = @($runtimeFile.destinations | Where-Object {
      ([string]$_).Replace('\', '/').StartsWith($toolPrefix, [System.StringComparison]::OrdinalIgnoreCase)
    }) | Select-Object -First 1
  if (-not $destination) { throw "$ServiceId runtime has no destination below $toolPrefix" }
  return Get-XjkContainedPath -Root $RepoRoot -RelativePath ([string]$destination) -Label "$ServiceId runtime"
}

function Assert-XjkSmokeOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label was not produced: $Path" }
  if ((Get-Item -LiteralPath $Path).Length -le 0) { throw "$Label is empty: $Path" }
}

function Remove-XjkSmokeTempTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$TempBase
  )

  $baseFull = [System.IO.Path]::GetFullPath($TempBase).TrimEnd('\', '/')
  $candidate = [System.IO.Path]::GetFullPath($Path)
  $expectedPrefix = $baseFull + [System.IO.Path]::DirectorySeparatorChar + "xjk-native-smoke-"
  if (-not $candidate.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected native smoke path: $candidate"
  }
  if (-not (Test-Path -LiteralPath $candidate)) { return }

  $root = Get-Item -LiteralPath $candidate -Force
  if (($root.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to remove a reparse-point native smoke root: $candidate"
  }
  foreach ($descendant in @(Get-ChildItem -LiteralPath $candidate -Recurse -Force)) {
    if (($descendant.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to remove a native smoke tree containing a reparse point: $($descendant.FullName)"
    }
  }

  # The Underwater runtime expands bundled assets deeply enough to exceed the
  # legacy Windows MAX_PATH limit. The extended-length prefix keeps cleanup
  # deterministic without relaxing the containment check above.
  $extendedPath = if ($candidate.StartsWith('\\', [System.StringComparison]::Ordinal)) {
    "\\?\UNC\$($candidate.TrimStart('\'))"
  } else {
    "\\?\$candidate"
  }
  [System.IO.Directory]::Delete($extendedPath, $true)
}

if ([string]::IsNullOrWhiteSpace($RepoPath)) { $RepoPath = Join-Path $PSScriptRoot "..\.." }
$repoRoot = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $repoRoot -PathType Container)) { throw "Repository path does not exist: $repoRoot" }
$mapFixture = Resolve-XjkSmokeFixture -PathValue $MapFixturePath -Label "Map"
$replayFixture = Resolve-XjkSmokeFixture -PathValue $ReplayFixturePath -Label "Replay"
$ghostFixture = Resolve-XjkSmokeFixture -PathValue $GhostFixturePath -Label "Ghost"
$underwaterMapFixture = Resolve-XjkSmokeFixture -PathValue $UnderwaterMapFixturePath -Label "Underwater map"
if (-not $underwaterMapFixture) { $underwaterMapFixture = $mapFixture }
$platformManifest = Get-Content -LiteralPath (Join-Path $repoRoot "config\platform-manifest.json") -Raw | ConvertFrom-Json
$runtimeManifest = Get-Content -LiteralPath (Join-Path $repoRoot "deploy\tool-runtime\manifest.json") -Raw | ConvertFrom-Json
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$tempRoot = Join-Path $tempBase ("xjk-native-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 12))
[System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null
$results = @()

try {
  foreach ($serviceId in @(
      "tools-clip-to-ghost",
      "tools-embed",
      "tools-embedded-checker",
      "tools-extract-replay",
      "tools-medal-modifier",
      "tools-map-validation",
      "tools-strip",
      "tools-underwater"
    )) {
    $runtimePath = Get-XjkRuntimeDestination `
      -PlatformManifest $platformManifest `
      -RuntimeManifest $runtimeManifest `
      -ServiceId $serviceId `
      -RepoRoot $repoRoot
    $requiredFixtures = switch ($serviceId) {
      "tools-embed" { @($mapFixture, $ghostFixture) }
      "tools-extract-replay" { @($replayFixture) }
      "tools-underwater" { @($underwaterMapFixture) }
      default { @($mapFixture) }
    }
    $skipReason = if (-not $runtimePath -or -not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) {
      "runtime is not installed"
    } elseif (@($requiredFixtures | Where-Object { [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
      "required explicit fixture path is not configured"
    } else { "" }
    if ($skipReason) {
      if ($Strict) { throw "$serviceId cannot run: $skipReason" }
      Write-Host "SKIP $serviceId - $skipReason"
      $results += [pscustomobject]@{ ServiceId = $serviceId; Status = "skipped"; Detail = $skipReason }
      continue
    }

    $caseRoot = Join-Path $tempRoot $serviceId
    [System.IO.Directory]::CreateDirectory($caseRoot) | Out-Null
    $mapPath = Join-Path $caseRoot "fixture.Map.Gbx"
    $replayPath = Join-Path $caseRoot "fixture.Replay.Gbx"
    $ghostPath = Join-Path $caseRoot "fixture.Ghost.Gbx"
    $selectedMapFixture = if ($serviceId -eq "tools-underwater") { $underwaterMapFixture } else { $mapFixture }
    if ($selectedMapFixture) { Copy-Item -LiteralPath $selectedMapFixture -Destination $mapPath -Force }
    if ($replayFixture) { Copy-Item -LiteralPath $replayFixture -Destination $replayPath -Force }
    if ($ghostFixture) { Copy-Item -LiteralPath $ghostFixture -Destination $ghostPath -Force }
    $arguments = @()
    $expectedOutput = ""
    $environment = @{}
    switch ($serviceId) {
      "tools-clip-to-ghost" {
        $expectedOutput = Join-Path $caseRoot "clip-manifest.json"
        $arguments = @($mapPath, "--list-only", "--manifest", $expectedOutput)
      }
      "tools-embed" {
        $expectedOutput = Join-Path $caseRoot "embedded.Map.Gbx"
        $arguments = @($mapPath, $ghostPath, $expectedOutput, "--ghost-index", "0")
        $gbxlzo = @($runtimeManifest.files | Where-Object { [string]$_.id -ceq "gbxlzo" })[0]
        if ($gbxlzo) {
          $gbxlzoPath = Get-XjkContainedPath -Root $repoRoot -RelativePath ([string]$gbxlzo.destinations[0]) -Label "gbxlzo runtime"
          if (Test-Path -LiteralPath $gbxlzoPath -PathType Leaf) { $arguments += @("--gbxlzo", $gbxlzoPath) }
        }
      }
      "tools-embedded-checker" {
        $expectedOutput = Join-Path $caseRoot "embedded-check.json"
        $arguments = @($mapPath, $expectedOutput, "--pretty", "--case-insensitive")
      }
      "tools-extract-replay" {
        $expectedOutput = Join-Path $caseRoot "replay-output.json"
        $requestPath = Join-Path $caseRoot "replay-request.json"
        @{
          replayFile = $replayPath
          outputFile = $expectedOutput
          includeNulls = $false
          prettyPrint = $false
          maxDepth = 8
          maxCollectionItems = 1000
          selection = @{ "`$type" = $true; Time = @{ TotalMilliseconds = $true } }
        } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $requestPath -Encoding UTF8
        $arguments = @($requestPath)
      }
      "tools-medal-modifier" {
        $expectedOutput = Join-Path $caseRoot "medals.Map.Gbx"
        $arguments = @($mapPath, $expectedOutput, "1000", "2000", "3000", "4000")
      }
      "tools-map-validation" {
        $expectedOutput = Join-Path $caseRoot "validation.json"
        $arguments = @("--single", $mapPath, "--output", $expectedOutput)
      }
      "tools-strip" {
        $expectedOutput = Join-Path $caseRoot "stripped.Map.Gbx"
        $processedRoot = Join-Path $caseRoot "processed"
        [System.IO.Directory]::CreateDirectory($processedRoot) | Out-Null
        $environment["TM_PROCESSED_ROOT"] = $processedRoot
        $arguments = @($mapPath, $expectedOutput, "--allow-clones", "remove")
      }
      "tools-underwater" {
        $isolatedProfile = Join-Path $tempRoot "underwater-profile"
        $isolatedLocalAppData = Join-Path $isolatedProfile "AppData\Local"
        $isolatedAppData = Join-Path $isolatedProfile "AppData\Roaming"
        [System.IO.Directory]::CreateDirectory($isolatedLocalAppData) | Out-Null
        [System.IO.Directory]::CreateDirectory($isolatedAppData) | Out-Null
        $environment["USERPROFILE"] = $isolatedProfile
        $environment["LOCALAPPDATA"] = $isolatedLocalAppData
        $environment["APPDATA"] = $isolatedAppData
        $arguments = @("make-underwater-map", $mapPath, "Smoke", "--variant", "normal", "--coverage", "one-layer")
      }
    }
    $processResult = Invoke-XjkSmokeProcess `
      -Executable $runtimePath `
      -Arguments $arguments `
      -WorkingDirectory $caseRoot `
      -Environment $environment `
      -TimeoutSeconds $TimeoutSeconds
    if ($processResult.ExitCode -ne 0) {
      $detail = (($processResult.Stderr, $processResult.Stdout) -join "`n").Trim()
      throw "$serviceId exited with $($processResult.ExitCode). $detail"
    }
    if ($serviceId -eq "tools-underwater") {
      $outputs = @(Get-ChildItem -LiteralPath $caseRoot -File | Where-Object {
          $_.Extension -ieq ".gbx" -and $_.FullName -cne $mapPath
        })
      if ($outputs.Count -eq 0) { throw "$serviceId produced no converted GBX file." }
    } else {
      Assert-XjkSmokeOutput -Path $expectedOutput -Label "$serviceId output"
    }
    Write-Host "PASS $serviceId"
    $results += [pscustomobject]@{ ServiceId = $serviceId; Status = "passed"; Detail = "runtime executed" }
  }
} finally {
  Remove-XjkSmokeTempTree -Path $tempRoot -TempBase $tempBase
}

$passed = @($results | Where-Object { $_.Status -eq "passed" }).Count
$skipped = @($results | Where-Object { $_.Status -eq "skipped" }).Count
Write-Host "Native runtime smoke complete: $passed passed, $skipped skipped."
