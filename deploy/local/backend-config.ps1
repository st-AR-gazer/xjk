function New-BackendIndex {
  param([object[]]$Backends)

  $index = @{}
  foreach ($backend in $Backends) {
    $name = [string]$backend.Name
    if ([string]::IsNullOrWhiteSpace($name)) {
      throw "Every local backend must have a non-empty name."
    }
    if ($index.ContainsKey($name)) {
      throw "Duplicate local backend name: $name"
    }
    $index[$name] = $backend
  }
  return $index
}

function New-XjkLocalBackendSkeletons {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Manifest,
    [Parameter(Mandatory = $true)]
    [hashtable]$ServicePorts,
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $backends = @()
  foreach ($service in $Manifest.services) {
    $serviceId = [string]$service.id
    if (-not $ServicePorts.ContainsKey($serviceId)) {
      throw "No resolved local port exists for service '$serviceId'."
    }

    $backends += @{
      ServiceId  = $serviceId
      Name       = [string]$service.localName
      Cwd        = Join-Path $RepoRoot ([string]$service.cwd)
      Runtime    = [string]$service.runtime
      EntryPoint = [string]$service.entry
      Env        = @{ PORT = [string]$ServicePorts[$serviceId] }
    }
  }
  return $backends
}

function Add-BackendEnvironmentOverlays {
  param(
    [hashtable]$BackendByName,
    [hashtable]$EnvironmentByName
  )

  foreach ($name in $EnvironmentByName.Keys) {
    if (-not $BackendByName.ContainsKey([string]$name)) {
      throw "Environment overlay references unknown local backend '$name'."
    }
    $backend = $BackendByName[[string]$name]
    foreach ($entry in $EnvironmentByName[$name].GetEnumerator()) {
      $backend.Env[[string]$entry.Key] = $entry.Value
    }
  }
}

function Add-BackendLaunchOverlays {
  param(
    [hashtable]$BackendByName,
    [hashtable]$LaunchByName
  )

  foreach ($name in $LaunchByName.Keys) {
    if (-not $BackendByName.ContainsKey([string]$name)) {
      throw "Launch overlay references unknown local backend '$name'."
    }
    $backend = $BackendByName[[string]$name]
    foreach ($entry in $LaunchByName[$name].GetEnumerator()) {
      $backend[[string]$entry.Key] = $entry.Value
    }
  }
}

function Add-XjkLocalSecurityOverrides {
  param(
    [hashtable]$BackendByName,
    [object]$Manifest
  )

  $serviceNames = @{}
  foreach ($service in $Manifest.services) {
    $serviceNames[[string]$service.id] = [string]$service.localName
  }

  foreach ($override in $Manifest.infrastructure.security.localOnlyOverrides) {
    $serviceId = [string]$override.serviceId
    if (-not $serviceNames.ContainsKey($serviceId)) {
      throw "Local security override references unknown service '$serviceId'."
    }
    $backendName = $serviceNames[$serviceId]
    $BackendByName[$backendName].Env[[string]$override.environmentVariable] = [string]$override.localValue
  }
}

function Assert-BackendConfiguration {
  param(
    [hashtable]$BackendByName,
    [object]$Manifest,
    [hashtable]$ServicePorts,
    [string]$RepoRoot,
    [hashtable]$OptionalPathsByName = @{},
    [object[]]$EnvironmentBindings = @()
  )

  if ($BackendByName.Count -ne @($Manifest.services).Count) {
    throw "Local backend count does not match the platform manifest."
  }

  $expectedNames = @{}
  $serviceNamesById = @{}
  foreach ($service in $Manifest.services) {
    $serviceId = [string]$service.id
    $name = [string]$service.localName
    $expectedNames[$name] = $true
    $serviceNamesById[$serviceId] = $name
    if (-not $BackendByName.ContainsKey($name)) {
      throw "Missing local backend configuration for manifest service '$serviceId'."
    }

    $backend = $BackendByName[$name]
    $expectedCwd = Join-Path $RepoRoot ([string]$service.cwd)
    if ([string]$backend.ServiceId -cne $serviceId) {
      throw "Local backend '$name' is bound to the wrong service identity."
    }
    if ([string]$backend.Name -cne $name) {
      throw "Local backend index mismatch for '$name'."
    }
    if ([string]$backend.Cwd -cne $expectedCwd) {
      throw "Local backend '$name' has the wrong working directory."
    }
    if ([string]$backend.Runtime -cne [string]$service.runtime) {
      throw "Local backend '$name' has the wrong runtime."
    }
    if ([string]$backend.EntryPoint -cne [string]$service.entry) {
      throw "Local backend '$name' has the wrong entry point."
    }
    if ([string]$backend.Env.PORT -cne [string]$ServicePorts[$serviceId]) {
      throw "Local backend '$name' has the wrong resolved port."
    }

    if ($OptionalPathsByName.ContainsKey($name)) {
      foreach ($entry in $OptionalPathsByName[$name].GetEnumerator()) {
        $expectedPath = Resolve-FirstExistingPath -Candidates @($entry.Value)
        if ($expectedPath -and [string]$backend.Env[[string]$entry.Key] -cne $expectedPath) {
          throw "Local backend '$name' did not receive its resolved '$($entry.Key)' path."
        }
      }
    }
  }

  foreach ($name in $BackendByName.Keys) {
    if (-not $expectedNames.ContainsKey([string]$name)) {
      throw "Local backend '$name' is not registered in the platform manifest."
    }
  }

  foreach ($override in $Manifest.infrastructure.security.localOnlyOverrides) {
    $serviceId = [string]$override.serviceId
    $name = [string]$serviceNamesById[$serviceId]
    $key = [string]$override.environmentVariable
    if ([string]$BackendByName[$name].Env[$key] -cne [string]$override.localValue) {
      throw "Local backend '$name' is missing manifest security override '$key'."
    }
  }

  foreach ($binding in $EnvironmentBindings) {
    $sourceValue = [Environment]::GetEnvironmentVariable([string]$binding.SourceKey)
    if ([string]::IsNullOrWhiteSpace($sourceValue)) { continue }
    $name = [string]$binding.Name
    if (-not $BackendByName.ContainsKey($name)) {
      throw "Environment binding references unknown local backend '$name'."
    }
    $backend = $BackendByName[$name]
    if ([string]$backend.Env[[string]$binding.Key] -cne $sourceValue) {
      throw "Local backend '$name' did not receive '$($binding.SourceKey)' as '$($binding.Key)'."
    }
  }
}
