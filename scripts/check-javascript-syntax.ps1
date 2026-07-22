$ErrorActionPreference = "Stop"

$patterns = @("*.js", "*.mjs", "*.cjs")
$tracked = & git ls-files -- $patterns
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate tracked JavaScript sources."
}

$untracked = & git ls-files --others --exclude-standard -- $patterns
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate untracked JavaScript sources."
}

$files = @($tracked; $untracked) |
  Where-Object { $_ -and $_ -notmatch '(^|/)(node_modules|\.runtime|data|data_server|tmp[^/]*)(/|$)' } |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Sort-Object -Unique

$failures = @()
foreach ($file in $files) {
  $output = & node --check $file 2>&1
  if ($LASTEXITCODE -ne 0) {
    $failures += [pscustomobject]@{
      File = $file
      Output = ($output -join [Environment]::NewLine)
    }
  }
}

if ($failures.Count -gt 0) {
  foreach ($failure in $failures) {
    Write-Error ("JavaScript syntax failed for {0}:{1}{2}" -f $failure.File, [Environment]::NewLine, $failure.Output)
  }
  exit 1
}

Write-Host ("JavaScript syntax passed for {0} source files." -f $files.Count)
