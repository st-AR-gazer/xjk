$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot "config\platform-manifest.json") -Raw | ConvertFrom-Json
$directories = @(
  $manifest.services |
    Where-Object { [string]$_.runtime -ceq "node" } |
    ForEach-Object { [string]$_.cwd } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Sort-Object -Unique
)

$failures = @()
foreach ($directory in $directories) {
  $output = & npm audit --omit=dev --audit-level=low --json --prefix $directory 2>$null
  try {
    $report = ($output -join "`n") | ConvertFrom-Json
  } catch {
    $failures += "${directory}: npm audit returned invalid JSON"
    continue
  }

  if ($report.error) {
    $message = [string]$report.error.summary
    if ([string]::IsNullOrWhiteSpace($message)) { $message = [string]$report.error.code }
    $failures += "${directory}: $message"
    continue
  }

  $total = [int]$report.metadata.vulnerabilities.total
  if ($total -eq 0) { continue }

  $details = @(
    $report.vulnerabilities.PSObject.Properties |
      ForEach-Object {
        $entry = $_.Value
        $direct = if ([bool]$entry.isDirect) { ", direct" } else { "" }
        "$([string]$entry.name) ($([string]$entry.severity)$direct)"
      }
  ) -join ", "
  $failures += "${directory}: $total production vulnerabilities: $details"
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host ("Production dependency audit passed for {0} managed Node service directories." -f $directories.Count)

$bannerPython = Join-Path $repoRoot "services\bannerbuilder\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $bannerPython -PathType Leaf)) {
  $bannerPython = "python"
}
& $bannerPython -m pip check
if ($LASTEXITCODE -ne 0) {
  throw "Bannerbuilder's installed Python dependency graph is inconsistent."
}
