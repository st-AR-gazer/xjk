function New-XjkValidifierEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [hashtable]$DotEnv
  )

  $environment = @{
    FRONTEND_DIR = Join-Path $RepoRoot "sites\validifier.xjk.yt\frontend"
  }
  Set-XjkResolvedEnvironmentValues `
    -Environment $environment `
    -SourceMap $DotEnv `
    -ValueCatalog @(
      @{
        Key = "VALIDIFIER_INTERNAL_BASE_URL"
        DefaultValue = Get-EnvOrMapValue -SourceMap $DotEnv -Key "REPLAY_VERIFICATION_API_BASE_URL"
      },
      @{
        Key = "VALIDIFIER_INTERNAL_TOKEN"
        DefaultValue = Get-EnvOrMapValue -SourceMap $DotEnv -Key "REPLAY_VERIFICATION_API_TOKEN"
      },
      @{
        Key = "VALIDIFIER_INTERNAL_TOKEN_HEADER"
        DefaultValue = Get-EnvOrMapValue `
          -SourceMap $DotEnv `
          -Key "REPLAY_VERIFICATION_API_TOKEN_HEADER" `
          -DefaultValue "Authorization"
      },
      @{
        Key = "VALIDIFIER_INTERNAL_TOKEN_PREFIX"
        DefaultValue = Get-EnvOrMapValue `
          -SourceMap $DotEnv `
          -Key "REPLAY_VERIFICATION_API_TOKEN_PREFIX" `
          -DefaultValue "Bearer"
      },
      "VALIDIFIER_INTERNAL_ACCESS_TOKEN",
      "VALIDIFIER_INTERNAL_SUBMISSION_SECRET",
      "VALIDIFIER_REPLAY_BUILD_ID",
      @{
        Key = "VALIDIFIER_PUBLIC_REQUEST_TIMEOUT_MS"
        DefaultValue = Get-EnvOrMapValue `
          -SourceMap $DotEnv `
          -Key "REPLAY_VERIFICATION_REQUEST_TIMEOUT_MS" `
          -DefaultValue "15000"
      },
      @{ Key = "VALIDIFIER_PUBLIC_CACHE_TTL_MS"; DefaultValue = "15000" },
      @{ Key = "VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS"; DefaultValue = "604800000" },
      @{ Key = "VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS"; DefaultValue = "604800000" },
      @{ Key = "VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY"; DefaultValue = "268435456" },
      @{ Key = "VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY"; DefaultValue = "2147483648" },
      @{ Key = "VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT"; DefaultValue = "2" },
      @{ Key = "VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT"; DefaultValue = "8" }
    )
  return @{
    Name = "validifier-public"
    Env = $environment
  }
}

function New-XjkCotdEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [hashtable]$DotEnv
  )

  $environment = @{
    FRONTEND_DIR = Join-Path $RepoRoot "sites\cotd.xjk.yt\frontend"
    COTD_PUBLIC_DATA_DIR = Join-Path $RepoRoot "sites\cotd.xjk.yt\data"
    COTD_PUBLIC_STORAGE_FILE = Join-Path $RepoRoot "sites\cotd.xjk.yt\data\cotd-public.json"
    COTD_PUBLIC_DB_FILE = Join-Path $RepoRoot "sites\cotd.xjk.yt\data\cotd-public.sqlite"
    COTD_MAP_FILES_DIR = Join-Path $RepoRoot "sites\cotd.xjk.yt\data\maps"
  }
  Set-XjkResolvedEnvironmentValues `
    -Environment $environment `
    -SourceMap $DotEnv `
    -ValueCatalog @(
      @{ Key = "COTD_PUBLIC_CACHE_TTL_MS"; DefaultValue = "15000" },
      @{ Key = "COTD_HISTORY_LIMIT"; DefaultValue = "2500" },
      "COTD_ADMIN_TOKEN",
      @{ Key = "COTD_TOTD_FETCH_ENABLED"; DefaultValue = "0" },
      @{ Key = "COTD_TOTD_FETCH_ON_START"; DefaultValue = "1" },
      @{ Key = "COTD_TOTD_FETCH_INTERVAL_MS"; DefaultValue = "300000" },
      "COTD_TOTD_SOURCE_URL",
      "COTD_TOTD_SOURCE_TOKEN",
      @{ Key = "COTD_TOTD_SOURCE_TOKEN_HEADER"; DefaultValue = "Authorization" },
      @{ Key = "COTD_TOTD_SOURCE_TOKEN_PREFIX"; DefaultValue = "Bearer" },
      @{ Key = "COTD_TOTD_SOURCE_TIMEOUT_MS"; DefaultValue = "15000" },
      @{ Key = "COTD_AUTO_CLASSIFY_ENABLED"; DefaultValue = "1" },
      @{ Key = "COTD_TOTD_SYNC_MONTH_LENGTH"; DefaultValue = "1" },
      @{ Key = "COTD_TOTD_SYNC_MONTH_OFFSET"; DefaultValue = "0" },
      @{ Key = "COTD_TOTD_SYNC_ROYAL"; DefaultValue = "0" },
      @{ Key = "COTD_TOTD_DOWNLOAD_MAP_FILES"; DefaultValue = "1" },
      @{ Key = "COTD_NADEO_AUTH_MODE"; DefaultValue = "basic" },
      "COTD_NADEO_DEDI_LOGIN",
      "COTD_NADEO_DEDI_PASSWORD",
      "COTD_NADEO_SERVICES_TOKEN",
      "COTD_NADEO_LIVE_SERVICES_TOKEN",
      @{
        Key = "COTD_NADEO_TOKEN_CACHE_FILE"
        DefaultValue = Join-Path $RepoRoot "sites\cotd.xjk.yt\data\nadeo-token-cache.json"
      },
      @{ Key = "COTD_NADEO_REQUEST_TIMEOUT_MS"; DefaultValue = "15000" },
      @{ Key = "COTD_NADEO_MIN_REQUEST_GAP_MS"; DefaultValue = "1000" },
      @{ Key = "COTD_NADEO_GLOBAL_THROTTLE_FILE"; DefaultValue = $env:NADEO_GLOBAL_THROTTLE_FILE },
      @{ Key = "COTD_NADEO_GLOBAL_MIN_REQUEST_GAP_MS"; DefaultValue = $env:NADEO_GLOBAL_MIN_REQUEST_GAP_MS },
      @{
        Key = "COTD_NADEO_USER_AGENT"
        DefaultValue = "xjk.yt COTD integration (admin@xjk.yt)"
      },
      "COTD_CLASSIFIER_BASE_URL",
      @{ Key = "COTD_CLASSIFIER_PATH"; DefaultValue = "/api/v1/classify" },
      "COTD_CLASSIFIER_TOKEN",
      @{ Key = "COTD_CLASSIFIER_TOKEN_HEADER"; DefaultValue = "Authorization" },
      @{ Key = "COTD_CLASSIFIER_TOKEN_PREFIX"; DefaultValue = "Bearer" },
      @{ Key = "COTD_CLASSIFIER_TIMEOUT_MS"; DefaultValue = "15000" },
      @{ Key = "COTD_ALLOW_DEBUG_RAW"; DefaultValue = "0" }
    )
  return @{
    Name = "cotd-public"
    Env = $environment
  }
}
