function Resolve-FirstExistingPath {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }
  return ""
}

function Set-XjkOptionalEnvironmentPath {
  param(
    [hashtable]$Environment,
    [string]$Key,
    [string[]]$Candidates
  )

  $resolved = Resolve-FirstExistingPath -Candidates $Candidates
  if ($resolved) {
    $Environment[$Key] = $resolved
  }
}

function Read-XjkDotEnvFile {
  param([string]$Path)

  $environment = @{}
  if (-not (Test-Path $Path)) { return $environment }

  foreach ($line in Get-Content -Path $Path -ErrorAction SilentlyContinue) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) { continue }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -le 0) { continue }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()
    $quoted = ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    if ($quoted -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if (-not [string]::IsNullOrWhiteSpace($key) -and -not [string]::IsNullOrWhiteSpace($value)) {
      $environment[$key] = $value
    }
  }
  return $environment
}

function Get-EnvOrMapValue {
  param(
    [hashtable]$SourceMap,
    [string]$Key,
    [string]$DefaultValue = ""
  )

  $environmentValue = [Environment]::GetEnvironmentVariable($Key)
  if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
    return $environmentValue
  }
  if ($null -ne $SourceMap -and $SourceMap.ContainsKey($Key)) {
    $mapValue = [string]$SourceMap[$Key]
    if (-not [string]::IsNullOrWhiteSpace($mapValue)) {
      return $mapValue
    }
  }
  return $DefaultValue
}

function Set-XjkEnvironmentBindings {
  param(
    [hashtable]$Environment,
    [object[]]$Bindings,
    [hashtable]$SourceMap,
    [switch]$FromProcessEnvironment
  )

  foreach ($binding in $Bindings) {
    $targetKey = if ($binding -is [string]) { [string]$binding } else { [string]$binding.Key }
    $sourceKey = if ($binding -is [string] -or -not $binding.SourceKey) {
      $targetKey
    } else {
      [string]$binding.SourceKey
    }
    $value = if ($FromProcessEnvironment) {
      [Environment]::GetEnvironmentVariable($sourceKey)
    } elseif ($null -ne $SourceMap -and $SourceMap.ContainsKey($sourceKey)) {
      [string]$SourceMap[$sourceKey]
    } else {
      ""
    }
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $Environment[$targetKey] = $value
    }
  }
}

function Set-XjkResolvedEnvironmentValues {
  param(
    [hashtable]$Environment,
    [hashtable]$SourceMap,
    [object[]]$ValueCatalog
  )

  foreach ($entry in $ValueCatalog) {
    $key = if ($entry -is [string]) { [string]$entry } else { [string]$entry.Key }
    $defaultValue = if ($entry -is [System.Collections.IDictionary] -and $entry.ContainsKey("DefaultValue")) {
      [string]$entry.DefaultValue
    } else {
      ""
    }
    $Environment[$key] = Get-EnvOrMapValue `
      -SourceMap $SourceMap `
      -Key $key `
      -DefaultValue $defaultValue
  }
}
