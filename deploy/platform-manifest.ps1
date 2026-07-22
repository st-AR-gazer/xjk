$ErrorActionPreference = "Stop"

$script:XjkPlatformManifestRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-XjkPlatformManifest {
  param(
    [string]$RepoRoot = ""
  )

  if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = $script:XjkPlatformManifestRepoRoot
  }

  $manifestPath = Join-Path $RepoRoot "config\platform-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Platform manifest does not exist: $manifestPath"
  }

  return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

function Get-XjkNodeServiceDirectories {
  param(
    [string]$RepoRoot = ""
  )

  $manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
  return @(
    $manifest.services |
      Where-Object { [string]$_.runtime -eq "node" } |
      ForEach-Object { [string]$_.cwd } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )
}

function Resolve-XjkLocalStackConfiguration {
  param(
    [object]$Manifest = $null,
    [System.Collections.IDictionary]$BoundParameters = @{},
    [string]$RepoRoot = ""
  )

  if ($null -eq $Manifest) {
    $Manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
  }

  $resolvePort = {
    param(
      [string]$ParameterName,
      [int]$DefaultPort
    )

    $port = $DefaultPort
    if ($BoundParameters.Keys -contains $ParameterName) {
      $candidate = [int]$BoundParameters[$ParameterName]
      if ($candidate -lt 0 -or $candidate -gt 65535) {
        throw "Local port override '$ParameterName' must be between 1 and 65535."
      }
      if ($candidate -gt 0) {
        $port = $candidate
      }
    }
    if ($port -lt 1 -or $port -gt 65535) {
      throw "Platform manifest default for '$ParameterName' must be between 1 and 65535."
    }
    return $port
  }

  $gatewayParameter = [string]$Manifest.infrastructure.localGateway.portParameter
  $gatewayPort = & $resolvePort $gatewayParameter ([int]$Manifest.infrastructure.localGateway.port)
  $servicePorts = @{}
  $parameterPorts = @{ $gatewayParameter = $gatewayPort }
  $portOwners = @{ $gatewayPort = "local gateway" }

  foreach ($service in $Manifest.services) {
    $serviceId = [string]$service.id
    $parameterName = [string]$service.ports.localParameter
    $port = & $resolvePort $parameterName ([int]$service.ports.local)
    if ($servicePorts.ContainsKey($serviceId)) {
      throw "Duplicate service id in platform manifest: $serviceId"
    }
    if ($parameterPorts.ContainsKey($parameterName)) {
      throw "Duplicate local port parameter in platform manifest: $parameterName"
    }
    if ($portOwners.ContainsKey($port)) {
      throw "Local port $port is assigned to both $($portOwners[$port]) and $serviceId."
    }

    $servicePorts[$serviceId] = $port
    $parameterPorts[$parameterName] = $port
    $portOwners[$port] = $serviceId
  }

  return [pscustomobject]@{
    GatewayPort    = $gatewayPort
    ServicePorts   = $servicePorts
    ParameterPorts = $parameterPorts
    RequiredPorts  = @($portOwners.Keys | ForEach-Object { [int]$_ } | Sort-Object)
  }
}

function Get-XjkLocalStackPorts {
  param(
    [string]$RepoRoot = "",
    [int]$GatewayPort = 0
  )

  $overrides = @{}
  if ($GatewayPort -gt 0) {
    $manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
    $overrides[[string]$manifest.infrastructure.localGateway.portParameter] = $GatewayPort
  }
  $configuration = Resolve-XjkLocalStackConfiguration -BoundParameters $overrides -RepoRoot $RepoRoot
  return @($configuration.RequiredPorts)
}

function Get-XjkServicePort {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceId,
    [ValidateSet("local", "production")]
    [string]$Environment = "local",
    [string]$RepoRoot = ""
  )

  $manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
  $service = $manifest.services | Where-Object { [string]$_.id -eq $ServiceId } | Select-Object -First 1
  if (-not $service) {
    throw "Platform manifest has no service with id '$ServiceId'."
  }

  return [int]$service.ports.$Environment
}

function Write-XjkLocalSiteUrls {
  param(
    [Parameter(Mandatory = $true)]
    [int]$GatewayPort,
    [string]$RepoRoot = ""
  )

  $manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
  Write-Host "Preferred local URLs (subdomain mode):"
  foreach ($site in $manifest.sites) {
    Write-Host ("  {0,-12} http://{1}.localhost:{2}/" -f ([string]$site.name + ":"), [string]$site.id, $GatewayPort)
  }
}

function Write-XjkLocalPathUrls {
  param(
    [Parameter(Mandatory = $true)]
    [int]$GatewayPort,
    [string]$RepoRoot = ""
  )

  $manifest = Get-XjkPlatformManifest -RepoRoot $RepoRoot
  $rootSiteId = [string]$manifest.infrastructure.localGateway.rootSiteId
  foreach ($site in $manifest.sites) {
    $sitePath = if ([string]$site.id -eq $rootSiteId) { "/" } else { "/$([string]$site.id)/" }
    Write-Host "  http://localhost:$GatewayPort$sitePath"
  }
}
