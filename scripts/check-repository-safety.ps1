$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

$tracked = & git ls-files
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate tracked repository files."
}
$untracked = & git ls-files --others --exclude-standard
if ($LASTEXITCODE -ne 0) {
  throw "Could not enumerate untracked repository files."
}
$files = @($tracked; $untracked) |
  Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $repoRoot $_) -PathType Leaf) } |
  Sort-Object -Unique

$violations = @()
foreach ($file in $files) {
  $normalized = $file.Replace("\", "/")
  $isEnvironmentFile = $normalized -match '(^|/)\.env($|\.)' -and $normalized -notmatch '\.example$'
  $isSecretArtifact = $normalized -match '(^|/)secrets(/|$)' -or $normalized -match '\.(key|pem|pfx|p12)$'
  $isRuntimeData = $normalized -match '\.(sqlite|sqlite-shm|sqlite-wal|db|db-shm|db-wal|log)$'
  if ($isEnvironmentFile -or $isSecretArtifact -or $isRuntimeData) {
    $violations += "${normalized}: forbidden sensitive or runtime artifact is included"
  }
}

$textExtensions = @(".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ps1", ".py", ".svg", ".yaml", ".yml")
$windowsUserPathPattern = '[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9._-]+[\\/]'
$macUserPathPattern = '/Users/[A-Za-z0-9._-]+/'
$privateKeyPattern = '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
$terminalTruncationPattern = '(?:\u2026|\.{3})\d+\s+(?:tokens?|chars?)\s+truncated(?:\u2026|\.{3})'
$operatorTransportPattern = '(?i)(Resolve-[A-Za-z0-9-]*CommandPath\s+-Name\s+"(?:ssh|scp)"|Invoke-Command\s+-ComputerName)'
$operatorPublicationPattern = '(?i)\bgit\s+(?:push|subtree)\b'
$credentialPatterns = @(
  'AKIA[0-9A-Z]{16}',
  'gh[pousr]_[A-Za-z0-9_]{32,}',
  'xox[baprs]-[A-Za-z0-9-]{20,}',
  'AIza[0-9A-Za-z_-]{35}'
)

foreach ($file in $files) {
  $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
  $isCaddyfile = [System.IO.Path]::GetFileName($file).StartsWith("Caddyfile", [System.StringComparison]::OrdinalIgnoreCase)
  if ($extension -notin $textExtensions -and -not $file.EndsWith(".env.example") -and -not $isCaddyfile) {
    continue
  }
  try {
    $content = [System.IO.File]::ReadAllText((Join-Path $repoRoot $file))
  } catch {
    $violations += "${file}: could not inspect text content ($($_.Exception.Message))"
    continue
  }
  if ($content -match $windowsUserPathPattern -or $content -match $macUserPathPattern) {
    $violations += "${file}: contains a machine-specific user path"
  }
  if ($content -match $privateKeyPattern) {
    $violations += "${file}: contains private-key material"
  }
  if ($content -match $terminalTruncationPattern) {
    $violations += "${file}: contains a terminal-output truncation artifact"
  }
  if ($content -match $operatorTransportPattern) {
    $violations += "${file}: contains operator-to-server transport automation"
  }
  if ($content -match $operatorPublicationPattern) {
    $violations += "${file}: contains repository publication automation"
  }
  foreach ($pattern in $credentialPatterns) {
    if ($content -match $pattern) {
      $violations += "${file}: contains a credential-shaped token"
      break
    }
  }
}

if ($violations.Count -gt 0) {
  $violations | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host ("Repository safety passed for {0} files." -f $files.Count)
