function Resolve-XjkCommandPath {
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
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    try {
      if (Test-Path -LiteralPath $candidate -ErrorAction Stop) {
        return [string]$candidate
      }
    } catch [System.UnauthorizedAccessException] {
      continue
    }
  }
  return $null
}

function Invoke-XjkNative {
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
