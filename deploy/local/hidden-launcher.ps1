function Start-XjkHiddenPowerShellScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptPath,
    [Parameter(Mandatory = $true)]
    [hashtable]$BoundParameters,
    [string[]]$ExcludedParameters = @("ShowConsole", "HiddenLauncher")
  )

  $arguments = @("-ExecutionPolicy", "Bypass", "-File", $ScriptPath, "-HiddenLauncher")
  foreach ($entry in $BoundParameters.GetEnumerator()) {
    $key = [string]$entry.Key
    if ($key -in $ExcludedParameters) { continue }
    $value = $entry.Value
    if ($value -is [switch]) {
      if ($value.IsPresent) { $arguments += "-$key" }
      continue
    }
    $arguments += "-$key"
    $arguments += [string]$value
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}
