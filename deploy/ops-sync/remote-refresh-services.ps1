param(
  [string]$Server = "Serv",
  [string]$User = "Serv\xjk_deploy",
  [string]$RemoteRoot = "D:\srv\xjk",
  [string]$CaddyConfigPath = "deploy/Caddyfile.tunnel",
  [string]$TunnelServiceName = "xjk-cloudflared",
  [switch]$SkipTunnelRestart
)

$ErrorActionPreference = "Stop"

try {
  $cred = Get-Credential -UserName $User -Message "Credentials for $Server"

  Invoke-Command -ComputerName $Server -Credential $cred -Authentication Negotiate -ScriptBlock {
    param($RemoteRoot, $CaddyConfigPath, $TunnelServiceName, $SkipTunnelRestart)

    $applyScript = Join-Path $RemoteRoot "deploy\server\apply-update-winsw.ps1"
    if (-not (Test-Path $applyScript)) {
      throw "Missing apply script: $applyScript"
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File $applyScript `
      -RepoPath $RemoteRoot `
      -SkipGit `
      -SkipInstall `
      -CaddyConfigPath $CaddyConfigPath

    if ($LASTEXITCODE -ne 0) {
      throw "apply-update-winsw.ps1 failed with exit code $LASTEXITCODE"
    }

    if (-not $SkipTunnelRestart) {
      $svc = Get-Service -Name $TunnelServiceName -ErrorAction SilentlyContinue
      if ($svc) {
        if ($svc.Status -eq "Running") {
          Restart-Service -Name $TunnelServiceName -Force
        } else {
          Start-Service -Name $TunnelServiceName
        }
      }
    }

    "OK: services refreshed"
  } -ArgumentList $RemoteRoot, $CaddyConfigPath, $TunnelServiceName, [bool]$SkipTunnelRestart

  exit 0
} catch {
  Write-Error $_
  exit 1
}
