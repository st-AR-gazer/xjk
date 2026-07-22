[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$StagingRoot,
  [string]$ManifestPath = '',
  [string]$OutputArchive = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "path-safety.ps1")

function Get-FileSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-NoMachinePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $patterns = @(
    ':\Users\',
    ':/Users/',
    'website-trackmania_xjk'
  )
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $buffer = New-Object byte[] (4MB)
    $tail = New-Object byte[] 256
    $tailLength = 0
    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $combined = New-Object byte[] ($tailLength + $read)
      if ($tailLength -gt 0) {
        [System.Array]::Copy($tail, 0, $combined, 0, $tailLength)
      }
      [System.Array]::Copy($buffer, 0, $combined, $tailLength, $read)

      $ascii = [System.Text.Encoding]::ASCII.GetString($combined)
      $unicode = [System.Text.Encoding]::Unicode.GetString($combined)
      foreach ($pattern in $patterns) {
        if (
          $ascii.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
          $unicode.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
        ) {
          throw "$Label contains a personal or workspace-specific absolute path marker ('$pattern'). Rebuild it with path-neutral release settings."
        }
      }

      $tailLength = [System.Math]::Min($tail.Length, $combined.Length)
      [System.Array]::Copy($combined, $combined.Length - $tailLength, $tail, 0, $tailLength)
    }
  } finally {
    $stream.Dispose()
  }
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\', '/')
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $PSScriptRoot 'manifest.json'
}
$resolvedManifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
if (-not (Test-Path -LiteralPath $resolvedManifestPath -PathType Leaf)) {
  throw "Tool runtime manifest does not exist: $resolvedManifestPath"
}

$resolvedStagingRoot = [System.IO.Path]::GetFullPath($StagingRoot).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $resolvedStagingRoot -PathType Container)) {
  throw "Tool runtime staging directory does not exist: $resolvedStagingRoot"
}

$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1) {
  throw "Unsupported tool runtime manifest schema: $($manifest.schemaVersion)"
}

foreach ($file in @($manifest.files)) {
  if ([string]$file.kind -ne 'notice') {
    if ($null -eq $file.source) {
      throw "Runtime '$($file.id)' does not record source provenance."
    }
    foreach ($propertyName in @('repository', 'revision', 'project')) {
      $value = [string]$file.source.$propertyName
      if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith('PENDING_', [System.StringComparison]::Ordinal)) {
        throw "Runtime '$($file.id)' has incomplete source provenance: $propertyName"
      }
    }
    if (
      ([string]$file.source.repository).StartsWith('https://github.com/st-AR-gazer/', [System.StringComparison]::OrdinalIgnoreCase) -and
      [string]$file.source.revision -notmatch '^[0-9a-fA-F]{40,64}$'
    ) {
      throw "First-party runtime '$($file.id)' must record a full committed source revision."
    }
    if ($null -ne $file.source.PSObject.Properties['patches']) {
      foreach ($patch in @($file.source.patches)) {
        $patchPath = Get-XjkContainedPath -Root $repoRoot -RelativePath ([string]$patch.path) -Label "Source patch for '$($file.id)'"
        if (-not (Test-Path -LiteralPath $patchPath -PathType Leaf)) {
          throw "Source patch for '$($file.id)' is missing: $($patch.path)"
        }
        if ([string]$patch.sha256 -notmatch '^[0-9a-fA-F]{64}$') {
          throw "Source patch for '$($file.id)' does not have a finalized SHA-256 checksum."
        }
        $actualPatchHash = Get-FileSha256 -Path $patchPath
        if ($actualPatchHash -cne ([string]$patch.sha256).ToLowerInvariant()) {
          throw "Source patch checksum mismatch for '$($file.id)': $($patch.path)"
        }
      }
    }
  }
}

$expectedPaths = @{}
foreach ($file in @($manifest.files)) {
  $deliveryType = if ($null -ne $file.PSObject.Properties['delivery']) {
    [string]$file.delivery.type
  } else {
    'bundle'
  }
  if ($deliveryType -eq 'external-release') {
    if ([string]$file.delivery.downloadUrl -notmatch '^https://') {
      throw "External release for '$($file.id)' must use HTTPS."
    }
    if ([string]$file.sha256 -notmatch '^[0-9a-fA-F]{64}$') {
      throw "External release for '$($file.id)' must have a finalized SHA-256 checksum."
    }
    continue
  }
  if ($deliveryType -ne 'bundle') {
    throw "Unsupported delivery type for '$($file.id)': $deliveryType"
  }
  $relativePath = Get-XjkNormalizedRelativePath -PathValue ([string]$file.archivePath) -Label "Archive path for '$($file.id)'"
  $key = $relativePath.ToLowerInvariant()
  if ($expectedPaths.ContainsKey($key)) {
    throw "Duplicate archive path in manifest: $relativePath"
  }
  $sourcePath = Get-XjkContainedPath -Root $resolvedStagingRoot -RelativePath $relativePath -Label "Staged file '$($file.id)'"
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required staged file is missing: $relativePath"
  }
  if ([string]$file.kind -ne 'notice') {
    Assert-NoMachinePath -Path $sourcePath -Label "Staged runtime '$($file.id)'"
  }
  $file.sha256 = Get-FileSha256 -Path $sourcePath
  $expectedPaths[$key] = [pscustomobject]@{
    RelativePath = $relativePath
    SourcePath = $sourcePath
  }
}

$actualPaths = @(
  Get-ChildItem -LiteralPath $resolvedStagingRoot -File -Recurse | ForEach-Object {
    $_.FullName.Substring($resolvedStagingRoot.Length + 1).Replace('\', '/')
  }
)
$unexpectedPaths = @($actualPaths | Where-Object { -not $expectedPaths.ContainsKey($_.ToLowerInvariant()) })
if ($unexpectedPaths.Count -gt 0) {
  throw "Tool runtime staging directory contains files not declared in the manifest: $($unexpectedPaths -join ', ')"
}
if ($actualPaths.Count -ne $expectedPaths.Count) {
  throw "Tool runtime staging file count mismatch. Expected $($expectedPaths.Count), found $($actualPaths.Count)."
}

$releaseAssetName = [string]$manifest.release.asset
if (
  [string]::IsNullOrWhiteSpace($releaseAssetName) -or
  $releaseAssetName -cne [System.IO.Path]::GetFileName($releaseAssetName) -or
  [System.IO.Path]::GetExtension($releaseAssetName) -cne '.zip'
) {
  throw "Release asset must be a plain .zip file name: $releaseAssetName"
}
if ([string]::IsNullOrWhiteSpace($OutputArchive)) {
  $OutputArchive = Join-Path (Join-Path $repoRoot 'artifacts\tool-runtime') $releaseAssetName
}
$resolvedOutputArchive = [System.IO.Path]::GetFullPath($OutputArchive)
if ([System.IO.Path]::GetExtension($resolvedOutputArchive) -cne '.zip') {
  throw "Tool runtime release archive must use a .zip extension: $resolvedOutputArchive"
}
$stagingPrefix = $resolvedStagingRoot + [System.IO.Path]::DirectorySeparatorChar
if ($resolvedOutputArchive.StartsWith($stagingPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'The output archive cannot be written inside the staging directory.'
}
$outputDirectory = Split-Path -Parent $resolvedOutputArchive
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
if (Test-Path -LiteralPath $resolvedOutputArchive) {
  if (-not $Force) {
    throw "Output archive already exists. Use -Force to replace it: $resolvedOutputArchive"
  }
  Remove-Item -LiteralPath $resolvedOutputArchive -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open(
  $resolvedOutputArchive,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  foreach ($entry in @($expectedPaths.Values | Sort-Object RelativePath)) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $entry.SourcePath,
      $entry.RelativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$manifest.release.sha256 = Get-FileSha256 -Path $resolvedOutputArchive
$manifest.release.generatedAtUtc = [DateTime]::UtcNow.ToString('o')
$serializedManifest = $manifest | ConvertTo-Json -Depth 12
Set-Content -LiteralPath $resolvedManifestPath -Value ($serializedManifest + [Environment]::NewLine) -Encoding UTF8 -NoNewline

Write-Host "Created $resolvedOutputArchive"
Write-Host "Updated $resolvedManifestPath"
Write-Host "Archive SHA-256: $($manifest.release.sha256)"
