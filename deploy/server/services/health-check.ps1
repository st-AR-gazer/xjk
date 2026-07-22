param(
  [string]$RepoPath = "D:\srv\xjk",
  [string[]]$ServiceName = @(),
  [switch]$IncludeOptional,
  [switch]$IncludePublic,
  [int]$TimeoutSeconds = 180,
  [int]$IntervalSeconds = 3
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-catalog.ps1")

function Test-XjkHttpHealth {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSeconds = 180,
    [int]$IntervalSeconds = 3
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastError = $null
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue | Select-Object -First 1

  while ([DateTime]::UtcNow -lt $deadline) {
    if ($curl -and $curl.Source) {
      $previousErrorActionPreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = "Continue"
        $output = & $curl.Source --location --silent --show-error --max-time 20 --output NUL --write-out "%{http_code}" $Url 2>&1
        $exitCode = $LASTEXITCODE
      } catch {
        $output = @($_.Exception.Message)
        $exitCode = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
      } finally {
        $ErrorActionPreference = $previousErrorActionPreference
      }

      $statusText = (($output | Select-Object -Last 1) -as [string]).Trim()
      $statusCode = 0
      [void][int]::TryParse($statusText, [ref]$statusCode)

      if ($exitCode -eq 0 -and $statusCode -ge 200 -and $statusCode -lt 400) {
        return [pscustomobject]@{
          Ok = $true
          StatusCode = $statusCode
          Error = $null
        }
      }

      $lastError = if ($exitCode -ne 0) {
        "curl exit ${exitCode}: $($output -join ' ')"
      } else {
        "HTTP $statusCode"
      }
    } else {
      try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 20
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
          return [pscustomobject]@{
            Ok = $true
            StatusCode = [int]$response.StatusCode
            Error = $null
          }
        }
        $lastError = "HTTP $($response.StatusCode)"
      } catch {
        $lastError = $_.Exception.Message
      }
    }

    Start-Sleep -Seconds $IntervalSeconds
  }

  return [pscustomobject]@{
    Ok = $false
    StatusCode = 0
    Error = $lastError
  }
}

$repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
$services = Get-XjkServiceCatalog -RepoPath $repoRoot |
  Where-Object { $_.HealthUrl -and ($_.RequiredHealth -or $IncludeOptional) }

if ($ServiceName.Count -gt 0) {
  $wanted = @{}
  foreach ($name in $ServiceName) {
    $wanted[$name] = $true
  }
  $services = @($services | Where-Object { $wanted.ContainsKey($_.Name) })
}

$failures = @()

foreach ($service in $services) {
  Write-Host "Checking $($service.Name): $($service.HealthUrl)"
  $result = Test-XjkHttpHealth -Url $service.HealthUrl -TimeoutSeconds $TimeoutSeconds -IntervalSeconds $IntervalSeconds
  if ($result.Ok) {
    Write-Host "OK $($service.Name) HTTP $($result.StatusCode)"
  } else {
    $failures += "$($service.Name) failed health check $($service.HealthUrl): $($result.Error)"
    Write-Host "FAIL $($service.Name): $($result.Error)"
  }
}

if ($IncludePublic) {
  $publicChecks = @(
    "https://aggregator.xjk.yt/api/v1/meta",
    "https://aggregator.xjk.yt/api/catalog.json",
    "https://altered.xjk.yt/bannerbuilder/"
  )

  foreach ($url in $publicChecks) {
    Write-Host "Checking public route: $url"
    $result = Test-XjkHttpHealth -Url $url -TimeoutSeconds 30 -IntervalSeconds $IntervalSeconds
    if ($result.Ok) {
      Write-Host "OK public route HTTP $($result.StatusCode): $url"
    } else {
      $failures += "Public route failed ${url}: $($result.Error)"
      Write-Host "FAIL public route: ${url} $($result.Error)"
    }
  }
}

if ($failures.Count -gt 0) {
  throw "Health checks failed: $($failures -join '; ')"
}

Write-Host "Health checks passed."
