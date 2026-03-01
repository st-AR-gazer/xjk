param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("altered", "tracker", "tracker-displayname", "tracker-club", "aggregator")]
  [string]$Service,

  [Parameter(Mandatory = $true)]
  [string]$DestinationRoot,

  [switch]$IncludeNodeModules
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$servicesRoot = Resolve-Path (Join-Path $scriptDir "..")
$sourceDir = Join-Path $servicesRoot $Service
$targetDir = Join-Path $DestinationRoot ("xjk-" + $Service + "-service")

if (-not (Test-Path $sourceDir)) {
  throw "Service source not found: $sourceDir"
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Write-Host "Exporting service '$Service'"
Write-Host "  Source: $sourceDir"
Write-Host "  Target: $targetDir"

if ($IncludeNodeModules) {
  robocopy $sourceDir $targetDir /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /XF *.sqlite *.db *.log | Out-Null
} else {
  robocopy $sourceDir $targetDir /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NC /NS /XD node_modules /XF *.sqlite *.db *.log | Out-Null
}

$splitReadme = Join-Path $scriptDir "README.md"
if (Test-Path $splitReadme) {
  Copy-Item -Path $splitReadme -Destination (Join-Path $targetDir "EXPORT-SERVICE.md") -Force
}

$contractsDir = Join-Path $servicesRoot "contracts"
if (Test-Path $contractsDir) {
  New-Item -ItemType Directory -Force -Path (Join-Path $targetDir "contracts") | Out-Null
  Copy-Item -Path (Join-Path $contractsDir "*") -Destination (Join-Path $targetDir "contracts") -Recurse -Force
}

$envExample = Join-Path $sourceDir ".env.example"
if (Test-Path $envExample) {
  Copy-Item -Path $envExample -Destination (Join-Path $targetDir ".env.example") -Force
}

Write-Host ""
Write-Host "Export complete."
Write-Host "Next:"
Write-Host "  1. cd $targetDir"
Write-Host "  2. npm ci"
Write-Host "  3. copy .env.example .env and adjust URLs/tokens"
