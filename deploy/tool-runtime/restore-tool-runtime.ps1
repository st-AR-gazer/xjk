[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$RepoPath = '',
  [string]$ManifestPath = '',
  [string]$ArchivePath = '',
  [string]$DownloadUri = '',
  [string]$ExternalArtifactDirectory = '',
  [string]$SmokeMapFixturePath = $env:XJK_TOOL_SMOKE_MAP_PATH,
  [string]$SmokeReplayFixturePath = $env:XJK_TOOL_SMOKE_REPLAY_PATH,
  [string]$SmokeGhostFixturePath = $env:XJK_TOOL_SMOKE_GHOST_PATH,
  [string]$SmokeUnderwaterMapFixturePath = $env:XJK_TOOL_SMOKE_UNDERWATER_MAP_PATH,
  [int]$SmokeTimeoutSeconds = 180,
  [switch]$SkipSmokeTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "path-safety.ps1")

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if ($Value -notmatch '^[0-9a-fA-F]{64}$' -or $Value -match '^0{64}$') {
    throw "$Label must contain a finalized SHA-256 checksum."
  }
}

function Assert-NoReparsePointInPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$Candidate,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
  $relativePath = $candidateFull.Substring($rootFull.Length).TrimStart('\', '/')
  $current = $rootFull
  foreach ($segment in @($relativePath -split '[\\/]')) {
    if ([string]::IsNullOrWhiteSpace($segment)) {
      continue
    }
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) {
      continue
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Label traverses a reparse point: $current"
    }
  }
}

function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha256.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Expected,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $actual = Get-FileSha256 -Path $Path
  if ($actual -cne $Expected.ToLowerInvariant()) {
    throw "$Label checksum mismatch. Expected $Expected, got $actual."
  }
}

function Remove-ControlledTempTree {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$TempBase
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $baseFull = [System.IO.Path]::GetFullPath($TempBase).TrimEnd('\', '/')
  $candidate = [System.IO.Path]::GetFullPath($Path)
  $basePrefix = $baseFull + [System.IO.Path]::DirectorySeparatorChar
  if (
    -not $candidate.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($candidate)).StartsWith('xjk-tool-runtime-')
  ) {
    throw "Refusing to remove an unexpected temporary path: $candidate"
  }

  $item = Get-Item -LiteralPath $candidate -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to remove a reparse-point temporary path: $candidate"
  }
  foreach ($descendant in @(Get-ChildItem -LiteralPath $candidate -Recurse -Force)) {
    if (($descendant.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to remove a temporary tree containing a reparse point: $($descendant.FullName)"
    }
  }

  [System.IO.Directory]::Delete($candidate, $true)
}

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
  $RepoPath = Join-Path $PSScriptRoot '..\..'
}
$repoRoot = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $repoRoot -PathType Container)) {
  throw "Repository path does not exist: $repoRoot"
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $PSScriptRoot 'manifest.json'
}
$resolvedManifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
if (-not (Test-Path -LiteralPath $resolvedManifestPath -PathType Leaf)) {
  throw "Tool runtime manifest does not exist: $resolvedManifestPath"
}

$manifestText = Get-Content -LiteralPath $resolvedManifestPath -Raw
if ($manifestText -match '"PENDING_[^"]+"') {
  throw 'The tool runtime manifest is not release-ready. Resolve every PENDING_* value before restoring or publishing it.'
}
$manifest = $manifestText | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1) {
  throw "Unsupported tool runtime manifest schema: $($manifest.schemaVersion)"
}
if (@($manifest.files).Count -eq 0) {
  throw 'The tool runtime manifest does not contain any files.'
}

Assert-Sha256 -Value ([string]$manifest.release.sha256) -Label 'Release archive'
$expectedArchiveHash = ([string]$manifest.release.sha256).ToLowerInvariant()
$expectedArchivePaths = @{}
$plannedDestinations = @{}
$restorePlan = @()

foreach ($file in @($manifest.files)) {
  $id = [string]$file.id
  if ($id -notmatch '^[a-z0-9][a-z0-9-]*$') {
    throw "Every tool runtime file requires a safe lowercase id: $id"
  }
  Assert-Sha256 -Value ([string]$file.sha256) -Label "Manifest file '$id'"

  $deliveryType = if ($null -ne $file.PSObject.Properties['delivery']) {
    [string]$file.delivery.type
  } else {
    'bundle'
  }
  $archiveRelativePath = ''
  $externalDownloadUrl = ''
  if ($deliveryType -eq 'bundle') {
    $archiveRelativePath = Get-XjkNormalizedRelativePath -PathValue ([string]$file.archivePath) -Label "Archive path for '$id'"
    $archiveKey = $archiveRelativePath.ToLowerInvariant()
    if ($expectedArchivePaths.ContainsKey($archiveKey)) {
      throw "Duplicate archive path in tool runtime manifest: $archiveRelativePath"
    }
    $expectedArchivePaths[$archiveKey] = $archiveRelativePath
  } elseif ($deliveryType -eq 'external-release') {
    $externalDownloadUrl = [string]$file.delivery.downloadUrl
    if ($externalDownloadUrl -notmatch '^https://') {
      throw "External release for '$id' must use HTTPS: $externalDownloadUrl"
    }
  } else {
    throw "Unsupported delivery type for '$id': $deliveryType"
  }

  if (@($file.destinations).Count -eq 0) {
    throw "Manifest file '$id' does not have a destination."
  }
  foreach ($destinationValue in @($file.destinations)) {
    $destinationRelativePath = Get-XjkNormalizedRelativePath -PathValue ([string]$destinationValue) -Label "Destination for '$id'"
    if (
      $destinationRelativePath -notmatch '^sites/tools\.xjk\.yt/(Clip-To-Ghost|Embed-RaceValidationGhost|Embedded-Blocks-And-Items-Checker|Extract-Replay-Data|Gbx-Medal-Time-Modifier|Map-Validation-Checker|Strip-RaceValidationGhost|Underwater-Map-Converter)/tools/' -and
      $destinationRelativePath -notmatch '^sites/tools\.xjk\.yt/\.runtime-licenses/'
    ) {
      throw "Destination for '$id' is outside the approved tool runtime roots: $destinationRelativePath"
    }
    $destinationKey = $destinationRelativePath.ToLowerInvariant()
    if ($plannedDestinations.ContainsKey($destinationKey)) {
      throw "Duplicate destination in tool runtime manifest: $destinationRelativePath"
    }
    $plannedDestinations[$destinationKey] = $destinationRelativePath
    $restorePlan += [pscustomobject]@{
      Id = $id
      DeliveryType = $deliveryType
      ArchivePath = $archiveRelativePath
      DownloadUrl = $externalDownloadUrl
      DestinationPath = $destinationRelativePath
      Sha256 = ([string]$file.sha256).ToLowerInvariant()
    }
  }
}

$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$tempRoot = Join-Path $tempBase ('xjk-tool-runtime-' + [guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $tempRoot 'extracted'
$releaseAssetName = [string]$manifest.release.asset
if (
  [string]::IsNullOrWhiteSpace($releaseAssetName) -or
  $releaseAssetName -cne [System.IO.Path]::GetFileName($releaseAssetName) -or
  [System.IO.Path]::GetExtension($releaseAssetName) -cne '.zip'
) {
  throw "Release asset must be a plain .zip file name: $releaseAssetName"
}
$downloadedArchivePath = Join-Path $tempRoot $releaseAssetName
[System.IO.Directory]::CreateDirectory($extractRoot) | Out-Null

try {
  if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
    $resolvedDownloadUri = if ([string]::IsNullOrWhiteSpace($DownloadUri)) {
      [string]$manifest.release.downloadUrl
    } else {
      $DownloadUri
    }
    if ($resolvedDownloadUri -notmatch '^https://') {
      throw "Tool runtime download URI must use HTTPS: $resolvedDownloadUri"
    }
    Write-Host "Downloading tool runtime $($manifest.release.tag)..."
    Invoke-WebRequest -Uri $resolvedDownloadUri -OutFile $downloadedArchivePath -UseBasicParsing
    $resolvedArchivePath = $downloadedArchivePath
  } else {
    $resolvedArchivePath = [System.IO.Path]::GetFullPath($ArchivePath)
    if (-not (Test-Path -LiteralPath $resolvedArchivePath -PathType Leaf)) {
      throw "Tool runtime archive does not exist: $resolvedArchivePath"
    }
  }

  Assert-FileSha256 -Path $resolvedArchivePath -Expected $expectedArchiveHash -Label 'Release archive'

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archiveEntries = @{}
  $zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedArchivePath)
  try {
    foreach ($entry in $zip.Entries) {
      $rawEntryPath = $entry.FullName.TrimEnd('/', '\')
      if ([string]::IsNullOrEmpty($rawEntryPath)) {
        continue
      }
      $entryPath = Get-XjkNormalizedRelativePath -PathValue $rawEntryPath -Label 'Archive entry'
      Get-XjkContainedPath -Root $extractRoot -RelativePath $entryPath -Label 'Archive entry' | Out-Null
      if ([string]::IsNullOrEmpty($entry.Name)) {
        continue
      }
      $entryKey = $entryPath.ToLowerInvariant()
      if ($archiveEntries.ContainsKey($entryKey)) {
        throw "Duplicate path in tool runtime archive: $entryPath"
      }
      if (-not $expectedArchivePaths.ContainsKey($entryKey)) {
        throw "Unexpected file in tool runtime archive: $entryPath"
      }
      $archiveEntries[$entryKey] = $entryPath
    }
  } finally {
    $zip.Dispose()
  }

  foreach ($expectedPath in $expectedArchivePaths.Values) {
    if (-not $archiveEntries.ContainsKey($expectedPath.ToLowerInvariant())) {
      throw "Required file is missing from tool runtime archive: $expectedPath"
    }
  }

  [System.IO.Compression.ZipFile]::ExtractToDirectory($resolvedArchivePath, $extractRoot)
  foreach ($file in @($manifest.files)) {
    if ($null -ne $file.PSObject.Properties['delivery'] -and [string]$file.delivery.type -eq 'external-release') {
      continue
    }
    $sourcePath = Get-XjkContainedPath -Root $extractRoot -RelativePath ([string]$file.archivePath) -Label "Extracted file '$($file.id)'"
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Extracted tool runtime file is missing: $($file.archivePath)"
    }
    Assert-FileSha256 -Path $sourcePath -Expected ([string]$file.sha256) -Label "Extracted file '$($file.id)'"
  }

  $externalSources = @{}
  foreach ($plan in @($restorePlan | Where-Object { $_.DeliveryType -eq 'external-release' })) {
    if ($externalSources.ContainsKey($plan.Id)) {
      continue
    }
    $externalPath = Join-Path $tempRoot ('external-' + $plan.Id + [System.IO.Path]::GetExtension($plan.DestinationPath))
    if ([string]::IsNullOrWhiteSpace($ExternalArtifactDirectory)) {
      Write-Host "Downloading canonical external runtime $($plan.Id)..."
      Invoke-WebRequest -Uri $plan.DownloadUrl -OutFile $externalPath -UseBasicParsing
    } else {
      $externalRoot = [System.IO.Path]::GetFullPath($ExternalArtifactDirectory)
      if (-not (Test-Path -LiteralPath $externalRoot -PathType Container)) {
        throw "External artifact directory does not exist: $externalRoot"
      }
      $assetName = [System.IO.Path]::GetFileName(([System.Uri]$plan.DownloadUrl).AbsolutePath)
      $localExternalPath = Get-XjkContainedPath -Root $externalRoot -RelativePath $assetName -Label "Offline external runtime '$($plan.Id)'"
      Assert-NoReparsePointInPath -Root $externalRoot -Candidate $localExternalPath -Label "Offline external runtime '$($plan.Id)'"
      if (-not (Test-Path -LiteralPath $localExternalPath -PathType Leaf)) {
        throw "Offline external runtime is missing: $localExternalPath"
      }
      [System.IO.File]::Copy($localExternalPath, $externalPath, $true)
    }
    Assert-FileSha256 -Path $externalPath -Expected $plan.Sha256 -Label "External runtime '$($plan.Id)'"
    $externalSources[$plan.Id] = $externalPath
  }

  foreach ($plan in $restorePlan) {
    $sourcePath = if ($plan.DeliveryType -eq 'external-release') {
      [string]$externalSources[$plan.Id]
    } else {
      Get-XjkContainedPath -Root $extractRoot -RelativePath $plan.ArchivePath -Label "Source for '$($plan.Id)'"
    }
    $destinationPath = Get-XjkContainedPath -Root $repoRoot -RelativePath $plan.DestinationPath -Label "Destination for '$($plan.Id)'"
    Assert-NoReparsePointInPath -Root $repoRoot -Candidate $destinationPath -Label "Destination for '$($plan.Id)'"
    if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
      $existingHash = Get-FileSha256 -Path $destinationPath
      if ($existingHash -ceq $plan.Sha256) {
        Write-Host "Verified $($plan.DestinationPath)"
        continue
      }
    }

    if ($PSCmdlet.ShouldProcess($destinationPath, "Restore checksum-verified tool runtime '$($plan.Id)'")) {
      $destinationDirectory = Split-Path -Parent $destinationPath
      New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
      $temporaryDestination = Join-Path $destinationDirectory ('.xjk-' + [guid]::NewGuid().ToString('N').Substring(0, 12) + '.tmp')
      try {
        Copy-Item -LiteralPath $sourcePath -Destination $temporaryDestination -Force
        Assert-FileSha256 -Path $temporaryDestination -Expected $plan.Sha256 -Label "Staged destination '$($plan.DestinationPath)'"
        Move-Item -LiteralPath $temporaryDestination -Destination $destinationPath -Force
      } finally {
        if (Test-Path -LiteralPath $temporaryDestination -PathType Leaf) {
          Remove-Item -LiteralPath $temporaryDestination -Force
        }
      }
      Write-Host "Restored $($plan.DestinationPath)"
    }
  }

  if (-not $WhatIfPreference -and -not $SkipSmokeTests) {
    & (Join-Path $PSScriptRoot 'smoke-native-tools.ps1') `
      -RepoPath $repoRoot `
      -MapFixturePath $SmokeMapFixturePath `
      -ReplayFixturePath $SmokeReplayFixturePath `
      -GhostFixturePath $SmokeGhostFixturePath `
      -UnderwaterMapFixturePath $SmokeUnderwaterMapFixturePath `
      -TimeoutSeconds $SmokeTimeoutSeconds `
      -Strict
  }

  Write-Host "Tool runtime $($manifest.release.tag) is ready."
} finally {
  Remove-ControlledTempTree -Path $tempRoot -TempBase $tempBase
}
