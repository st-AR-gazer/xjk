function Get-XjkNormalizedRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $normalized = $PathValue.Replace('\', '/').Trim()
  if ([string]::IsNullOrWhiteSpace($normalized) -or [System.IO.Path]::IsPathRooted($normalized) -or $normalized.StartsWith('/')) {
    throw "$Label must be a non-empty relative path: $PathValue"
  }
  $segments = @($normalized.Split('/'))
  if ($segments.Count -eq 0 -or @($segments | Where-Object { $_ -in @('', '.', '..') }).Count -gt 0) {
    throw "$Label is not a safe relative path: $PathValue"
  }
  return $segments -join '/'
}

function Get-XjkContainedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $normalized = Get-XjkNormalizedRelativePath -PathValue $RelativePath -Label $Label
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $rootFull $normalized))
  $rootPrefix = $rootFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label escapes its allowed root: $RelativePath"
  }
  return $candidate
}
