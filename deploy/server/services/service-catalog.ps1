$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\..\powershell-runtime.ps1")

function Resolve-XjkRepoPath {
  param(
    [string]$RepoPath = ""
  )

  if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    $RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
  }

  if (-not (Test-Path -LiteralPath $RepoPath)) {
    throw "Repo path does not exist: $RepoPath"
  }

  return (Resolve-Path -LiteralPath $RepoPath).Path
}

function Assert-XjkProductionCredentials {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath,
    [string[]]$ServiceName = @()
  )

  $repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
  $preflightPath = Join-Path $repoRoot "deploy\server\check-production-credentials.cjs"
  if (-not (Test-Path -LiteralPath $preflightPath -PathType Leaf)) {
    throw "Missing production credential preflight: $preflightPath"
  }
  $nodeExe = Resolve-XjkCommandPath -Name "node" -FallbackPaths @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
  )
  if (-not $nodeExe) {
    throw "node.exe is required to validate production credentials."
  }

  $arguments = @($preflightPath)
  foreach ($name in $ServiceName) {
    if (-not [string]::IsNullOrWhiteSpace($name)) {
      $arguments += @("--service", $name)
    }
  }
  Invoke-XjkNative -FilePath $nodeExe -ArgumentList $arguments -Label "production credential preflight"
}

function ConvertTo-XjkString {
  param($Value)

  if ($null -eq $Value) {
    return ""
  }

  if ($Value -is [System.Array]) {
    return (($Value | ForEach-Object { [string]$_ }) -join " ")
  }

  return [string]$Value
}

function Join-XjkArguments {
  param(
    [string[]]$Arguments = @()
  )

  $parts = @()
  foreach ($argument in $Arguments) {
    if ([string]::IsNullOrWhiteSpace($argument)) {
      continue
    }

    if ($argument -match '[\s"]') {
      $escaped = $argument.Replace('"', '\"')
      $parts += '"' + $escaped + '"'
    } else {
      $parts += $argument
    }
  }

  return ($parts -join " ")
}

function Get-XjkSourceApps {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $ecosystemPath = Join-Path $RepoPath "deploy\server\ecosystem.config.cjs"
  if (-not (Test-Path -LiteralPath $ecosystemPath)) {
    throw "Missing service source catalog: $ecosystemPath"
  }

  $nodeExe = Resolve-XjkCommandPath -Name "node" -FallbackPaths @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
  )
  if (-not $nodeExe) {
    throw "node.exe is required to load $ecosystemPath."
  }

  $loader = @'
const configPath = process.argv[1];
const config = require(configPath);
const apps = Array.isArray(config.apps) ? config.apps : [];
process.stdout.write(JSON.stringify(apps));
'@

  $json = & $nodeExe -e $loader $ecosystemPath
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to load service catalog from $ecosystemPath."
  }

  if ([string]::IsNullOrWhiteSpace($json)) {
    return @()
  }

  return @($json | ConvertFrom-Json)
}

function Get-XjkHealthMap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  $manifestPath = Join-Path $RepoPath "config\platform-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Missing platform manifest: $manifestPath"
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $healthMap = @{}
  foreach ($service in $manifest.services) {
    if (-not $service.health) {
      continue
    }
    $healthMap[[string]$service.processName] = @{
      Url = "http://127.0.0.1:$([int]$service.ports.production)$([string]$service.health.path)"
      Required = [bool]$service.health.required
    }
  }

  return $healthMap
}

function ConvertTo-XjkWinSwStartMode {
  param(
    [string]$StartMode = ""
  )

  switch -Regex ($StartMode) {
    "^(Auto|Automatic)$" { return "Automatic" }
    "^Manual$" { return "Manual" }
    "^Disabled$" { return "Disabled" }
    default { return "Automatic" }
  }
}

function Get-XjkServiceCatalog {
  param(
    [string]$RepoPath = ""
  )

  $repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
  $nodeExe = Resolve-XjkCommandPath -Name "node" -FallbackPaths @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
  )
  if (-not $nodeExe) {
    throw "node.exe was not found."
  }

  $healthMap = Get-XjkHealthMap -RepoPath $repoRoot
  $apps = Get-XjkSourceApps -RepoPath $repoRoot
  $services = @()

  foreach ($app in $apps) {
    if (-not $app.name) {
      continue
    }

    $env = @{}
    if ($app.env) {
      foreach ($property in $app.env.PSObject.Properties) {
        $env[$property.Name] = ConvertTo-XjkString $property.Value
      }
    }

    $executable = ""
    $arguments = @()
    $interpreter = ConvertTo-XjkString $app.interpreter
    $script = ConvertTo-XjkString $app.script
    $argsText = ConvertTo-XjkString $app.args

    if ($interpreter -eq "none") {
      $executable = $script
      if (-not [string]::IsNullOrWhiteSpace($argsText)) {
        $arguments += $argsText
      }
    } else {
      $executable = $nodeExe
      if (-not [string]::IsNullOrWhiteSpace($script)) {
        $arguments += $script
      }
      if (-not [string]::IsNullOrWhiteSpace($argsText)) {
        $arguments += $argsText
      }
    }

    $healthUrl = $null
    $requiredHealth = $false
    if ($healthMap.ContainsKey([string]$app.name)) {
      $health = $healthMap[[string]$app.name]
      $healthUrl = [string]$health.Url
      $requiredHealth = [bool]$health.Required
    }

    $services += [pscustomobject]@{
      Name = [string]$app.name
      DisplayName = "xjk " + ([string]$app.name).Substring(4)
      Description = "xjk backend service managed by WinSW."
      WorkingDirectory = ConvertTo-XjkString $app.cwd
      Executable = $executable
      Arguments = $arguments
      ArgumentString = Join-XjkArguments -Arguments $arguments
      Environment = $env
      Port = if ($env.ContainsKey("PORT")) { [string]$env["PORT"] } else { "" }
      LogDirectory = Join-Path $repoRoot ("logs\services\" + [string]$app.name)
      HealthUrl = $healthUrl
      RequiredHealth = $requiredHealth
      StartMode = "Automatic"
    }
  }

  return $services
}

function Get-XjkInfrastructureServiceCatalog {
  param(
    [string]$RepoPath = "",
    [string]$CaddyConfigPath = "deploy\Caddyfile.tunnel",
    [string]$CloudflaredTokenFile = "C:\ProgramData\xjk\Cloudflared-token.txt",
    [string[]]$ServiceName = @()
  )

  $repoRoot = Resolve-XjkRepoPath -RepoPath $RepoPath
  $includeAll = $ServiceName.Count -eq 0
  $includeCaddy = $includeAll -or ($ServiceName -contains "xjk-caddy")
  $includeCloudflared = $includeAll -or ($ServiceName -contains "xjk-cloudflared")
  $services = @()

  if ($includeCaddy) {
    $resolvedCaddyConfig = if ([System.IO.Path]::IsPathRooted($CaddyConfigPath)) {
      $CaddyConfigPath
    } else {
      Join-Path $repoRoot $CaddyConfigPath
    }

    if (-not (Test-Path -LiteralPath $resolvedCaddyConfig)) {
      throw "Caddy config file not found: $resolvedCaddyConfig"
    }

    $caddyExe = Resolve-XjkCommandPath -Name "caddy" -FallbackPaths @(
      $env:XJK_CADDY_PATH,
      $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\caddy.exe" }),
      "C:\Program Files\Caddy\caddy.exe",
      "C:\caddy\caddy.exe"
    )
    if (-not $caddyExe) {
      throw "caddy.exe was not found."
    }

    $caddyArguments = @("run", "--config", $resolvedCaddyConfig)
    $services += [pscustomobject]@{
      Name = "xjk-caddy"
      DisplayName = "xjk Caddy"
      Description = "xjk Caddy reverse proxy managed by WinSW."
      WorkingDirectory = $repoRoot
      Executable = $caddyExe
      Arguments = $caddyArguments
      ArgumentString = Join-XjkArguments -Arguments $caddyArguments
      Environment = @{}
      Port = "80"
      LogDirectory = Join-Path $repoRoot "logs\services\xjk-caddy"
      HealthUrl = "http://127.0.0.1:2019/config/"
      RequiredHealth = $false
      StartMode = "Automatic"
    }
  }

  if ($includeCloudflared) {
    $cloudflaredExe = Resolve-XjkCommandPath -Name "cloudflared" -FallbackPaths @(
      $env:XJK_CLOUDFLARED_PATH,
      "C:\Program Files (x86)\cloudflared\cloudflared.exe",
      "C:\Program Files\cloudflared\cloudflared.exe",
      "C:\Program Files\Cloudflare\Cloudflared\cloudflared.exe",
      $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe" })
    )
    if (-not $cloudflaredExe) {
      throw "cloudflared.exe was not found."
    }

    $cloudflaredArguments = @("--no-autoupdate", "tunnel", "run", "--token-file", $CloudflaredTokenFile)
    $services += [pscustomobject]@{
      Name = "xjk-cloudflared"
      DisplayName = "xjk Cloudflared"
      Description = "xjk Cloudflare tunnel managed by WinSW."
      WorkingDirectory = Split-Path -Parent $cloudflaredExe
      Executable = $cloudflaredExe
      Arguments = $cloudflaredArguments
      ArgumentString = Join-XjkArguments -Arguments $cloudflaredArguments
      Environment = @{}
      Port = ""
      LogDirectory = Join-Path $repoRoot "logs\services\xjk-cloudflared"
      HealthUrl = $null
      RequiredHealth = $false
      StartMode = "Automatic"
    }
  }

  return $services
}

function New-XjkWinSwXml {
  param(
    [Parameter(Mandatory = $true)]
    $Service
  )

  $stringWriter = New-Object System.IO.StringWriter
  $settings = New-Object System.Xml.XmlWriterSettings
  $settings.Indent = $true
  $settings.OmitXmlDeclaration = $true
  $writer = [System.Xml.XmlWriter]::Create($stringWriter, $settings)

  try {
    $writer.WriteStartElement("service")

    $writer.WriteElementString("id", [string]$Service.Name)
    $writer.WriteElementString("name", [string]$Service.DisplayName)
    $writer.WriteElementString("description", [string]$Service.Description)
    $writer.WriteElementString("executable", [string]$Service.Executable)
    $writer.WriteElementString("arguments", [string]$Service.ArgumentString)
    $writer.WriteElementString("workingdirectory", [string]$Service.WorkingDirectory)
    $writer.WriteElementString("startmode", (ConvertTo-XjkWinSwStartMode -StartMode ([string]$Service.StartMode)))
    $writer.WriteElementString("stoptimeout", "30 sec")

    $writer.WriteStartElement("onfailure")
    $writer.WriteAttributeString("action", "restart")
    $writer.WriteAttributeString("delay", "10 sec")
    $writer.WriteEndElement()

    $writer.WriteElementString("resetfailure", "1 hour")
    $writer.WriteElementString("logpath", [string]$Service.LogDirectory)

    $writer.WriteStartElement("log")
    $writer.WriteAttributeString("mode", "roll-by-size-time")
    $writer.WriteElementString("sizeThreshold", "10485760")
    $writer.WriteElementString("pattern", "yyyyMMdd")
    $writer.WriteEndElement()

    foreach ($key in ($Service.Environment.Keys | Sort-Object)) {
      $writer.WriteStartElement("env")
      $writer.WriteAttributeString("name", [string]$key)
      $writer.WriteAttributeString("value", [string]$Service.Environment[$key])
      $writer.WriteEndElement()
    }

    $writer.WriteEndElement()
  } finally {
    $writer.Flush()
    $writer.Close()
  }

  return $stringWriter.ToString()
}

function Get-XjkWinSwRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  return Join-Path $RepoPath "deploy\server\winsw"
}

function Get-XjkWinSwTemplatePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  return Join-Path (Get-XjkWinSwRoot -RepoPath $RepoPath) "WinSW.exe"
}

function Get-XjkWinSwServiceRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoPath
  )

  return Join-Path (Get-XjkWinSwRoot -RepoPath $RepoPath) "services"
}
