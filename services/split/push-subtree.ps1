param(
  [Parameter(Mandatory = $true)]
  [string]$Prefix,

  [Parameter(Mandatory = $true)]
  [string]$Remote,

  [string]$RemoteBranch = "main",

  [switch]$Force
)

$ErrorActionPreference = "Stop"

git rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Run this script inside a Git working tree."
}

$splitBranch = "split/" + ($Prefix -replace "[\\/]", "-")

Write-Host "Creating subtree split for $Prefix -> $splitBranch"
git subtree split --prefix $Prefix -b $splitBranch
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create subtree split for '$Prefix'."
}

$targetRef = "$splitBranch`:$RemoteBranch"
if ($Force) {
  Write-Host "Pushing (force) to $Remote/$RemoteBranch"
  git push $Remote $targetRef --force
} else {
  Write-Host "Pushing to $Remote/$RemoteBranch"
  git push $Remote $targetRef
}

if ($LASTEXITCODE -ne 0) {
  throw "Failed to push subtree branch '$splitBranch' to '$Remote/$RemoteBranch'."
}

git branch -D $splitBranch | Out-Null
Write-Host "Published '$Prefix' to '$Remote/$RemoteBranch'."
