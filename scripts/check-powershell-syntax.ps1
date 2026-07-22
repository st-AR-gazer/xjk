$ErrorActionPreference = "Stop"

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$tracked = @(& git -C $repoRoot ls-files -- "*.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate tracked PowerShell sources."
}

$untracked = @(& git -C $repoRoot ls-files --others --exclude-standard -- "*.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate untracked PowerShell sources."
}

$files = @($tracked; $untracked) |
  Where-Object { $_ -and $_ -notmatch '(^|/)(node_modules|\.runtime|tmp[^/]*)(/|$)' } |
  Where-Object { Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf } |
  Sort-Object -Unique

$maximumFunctionLines = 120
$functionSizeExemptions = @{}
$failures = @()
$functionSizes = @{}
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  $syntaxTree = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $repoRoot $file),
    [ref]$tokens,
    [ref]$errors
  )
  foreach ($parseError in @($errors)) {
    $failures += [pscustomobject]@{
      File = $file
      Line = $parseError.Extent.StartLineNumber
      Column = $parseError.Extent.StartColumnNumber
      Message = $parseError.Message
    }
  }
  foreach ($function in $syntaxTree.FindAll({
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
    }, $true)) {
    $identity = "${file}::$($function.Name)"
    $lineCount = $function.Extent.EndLineNumber - $function.Extent.StartLineNumber + 1
    $functionSizes[$identity] = $lineCount
    if ($lineCount -gt $maximumFunctionLines -and -not $functionSizeExemptions.ContainsKey($identity)) {
      $failures += [pscustomobject]@{
        File = $file
        Line = $function.Extent.StartLineNumber
        Column = $function.Extent.StartColumnNumber
        Message = "Function '$($function.Name)' spans $lineCount lines; " +
          "split functions above $maximumFunctionLines lines by responsibility."
      }
    }
  }
}

foreach ($identity in $functionSizeExemptions.Keys) {
  $reason = [string]$functionSizeExemptions[$identity]
  if ($reason.Length -lt 64) {
    throw "PowerShell function-size exemption '$identity' needs a meaningful rationale."
  }
  if (-not $functionSizes.ContainsKey($identity)) {
    throw "Stale PowerShell function-size exemption: $identity"
  }
  if ([int]$functionSizes[$identity] -le $maximumFunctionLines) {
    throw "PowerShell function-size exemption '$identity' is no longer needed."
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object {
    Write-Error ("{0}:{1}:{2}: {3}" -f $_.File, $_.Line, $_.Column, $_.Message)
  }
  exit 1
}

Write-Host ("PowerShell syntax and function architecture passed for {0} source files." -f $files.Count)
