function Protect-XjkCloudflaredTokenFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  & icacls.exe $Path "/inheritance:r" "/grant:r" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to restrict access to the Cloudflare tunnel token file."
  }
}

function Initialize-XjkCloudflaredTokenFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $resolvedPath = [IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $resolvedPath)) {
    $secureToken = Read-Host "Cloudflare tunnel token" -AsSecureString
    $credential = [PSCredential]::new("tunnel", $secureToken)
    $plainToken = $credential.GetNetworkCredential().Password.Trim().Replace('"', "")
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
      throw "Tunnel token is empty."
    }
    try {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedPath) | Out-Null
      [IO.File]::WriteAllText($resolvedPath, $plainToken, [Text.Encoding]::ASCII)
    } finally {
      $plainToken = $null
    }
  }
  if ((Get-Item -LiteralPath $resolvedPath).Length -eq 0) {
    throw "Tunnel token file is empty: $resolvedPath"
  }
  Protect-XjkCloudflaredTokenFile -Path $resolvedPath
  return $resolvedPath
}
