[CmdletBinding()]
param(
    [switch]$Write,
    [switch]$All,
    [string]$BaseRef = ""
)

$ErrorActionPreference = "Stop"

function Invoke-XjkPrettierBatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string[]]$Paths,
        [int]$MaximumAttempts = 3
    )

    for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt++) {
        & $Command @Arguments @Paths | Out-Host
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) { return 0 }
        if ($attempt -eq $MaximumAttempts) { return $exitCode }

        Write-Warning "Prettier batch failed on attempt $attempt; retrying after a transient file-write delay."
        Start-Sleep -Milliseconds (250 * $attempt)
    }
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$supportedExtensions = @(
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml"
)

$trackedPaths = if ($All) {
    if (-not [string]::IsNullOrWhiteSpace($BaseRef)) {
        throw "-All and -BaseRef cannot be used together."
    }
    @(& git -C $repoRoot ls-files)
} elseif ([string]::IsNullOrWhiteSpace($BaseRef)) {
    @(& git -C $repoRoot diff --name-only --diff-filter=ACMR HEAD --)
} else {
    & git -C $repoRoot rev-parse --verify "$BaseRef^{commit}" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Formatting base ref does not resolve to a commit: $BaseRef"
    }
    @(& git -C $repoRoot diff --name-only --diff-filter=ACMR $BaseRef HEAD --)
}
if ($LASTEXITCODE -ne 0) {
    throw "Could not list changed tracked files."
}

$untrackedPaths = if ([string]::IsNullOrWhiteSpace($BaseRef)) {
    @(& git -C $repoRoot ls-files --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not list untracked files."
    }
} else {
    @()
}

$files = @(
    $trackedPaths + $untrackedPaths |
        Sort-Object -Unique |
        Where-Object {
            $supportedExtensions -contains [IO.Path]::GetExtension($_).ToLowerInvariant()
        } |
        ForEach-Object {
            $absolutePath = Join-Path $repoRoot $_
            if (Test-Path -LiteralPath $absolutePath -PathType Leaf) {
                $absolutePath
            }
        }
)

if ($files.Count -eq 0) {
    Write-Host "No changed files are supported by Prettier."
    exit 0
}

$npxCommand = Get-Command npx -ErrorAction Stop
$mode = if ($Write) { "--write" } else { "--check" }
$maximumAttempts = if ($Write) { 3 } else { 1 }
$prettierArguments = @(
    "--no-install",
    "prettier",
    $mode,
    "--config",
    (Join-Path $repoRoot ".prettierrc.json"),
    "--ignore-path",
    (Join-Path $repoRoot ".prettierignore")
)

Push-Location $repoRoot
try {
    for ($offset = 0; $offset -lt $files.Count; $offset += 30) {
        $end = [Math]::Min($offset + 29, $files.Count - 1)
        $batch = $files[$offset..$end]
        $exitCode = Invoke-XjkPrettierBatch `
            -Command $npxCommand.Source `
            -Arguments $prettierArguments `
            -Paths $batch `
            -MaximumAttempts $maximumAttempts
        if ($exitCode -ne 0) { exit $exitCode }
    }
}
finally {
    Pop-Location
}
