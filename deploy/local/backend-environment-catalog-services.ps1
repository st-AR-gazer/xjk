function New-XjkToolsHubEnvironmentOverlay {
  param([string]$RepoRoot)

  return @{
    Name = "tools-hub"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\tools.xjk.yt\Tools-Hub\frontend"
      DATA_DIR = Join-Path $RepoRoot "sites\tools.xjk.yt\Tools-Hub\data"
      TOOLS_FILE = Join-Path $RepoRoot "sites\tools.xjk.yt\Tools-Hub\data\tools.json"
    }
  }
}

function New-XjkPluginsHubEnvironmentOverlay {
  param([string]$RepoRoot)

  return @{
    Name = "plugins-hub"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\plugins.xjk.yt\Plugins-Hub\frontend"
      DATA_DIR = Join-Path $RepoRoot "sites\plugins.xjk.yt\Plugins-Hub\data"
      PLUGINS_FILE = Join-Path $RepoRoot "sites\plugins.xjk.yt\Plugins-Hub\data\plugins.json"
    }
  }
}

function New-XjkAlteredEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [string]$AlteredDataDir,
    [int]$GatewayPort,
    [int]$TrackerHubPort,
    [int]$AggregatorHubPort,
    [int]$TrackerDisplaynameHubPort,
    [int]$TrackerClubHubPort,
    [int]$TrackerLeaderboardHubPort
  )

  return @{
    Name = "altered-hub"
    Env = @{
      NODE_OPTIONS = "--max-old-space-size=12288"
      FRONTEND_DIR = Join-Path $RepoRoot "sites\altered.xjk.yt\frontend"
      DATA_DIR = $AlteredDataDir
      DB_FILE = Join-Path $AlteredDataDir "altered-service.sqlite"
      TRACKER_PUBLIC_BASE_URL = "http://127.0.0.1:$TrackerHubPort/api/v1"
      TRACKER_ADMIN_BASE_URL = "http://127.0.0.1:$TrackerHubPort/api/v1/admin"
      TRACKER_LEADERBOARD_PUBLIC_BASE_URL = "http://127.0.0.1:$TrackerLeaderboardHubPort/api/v1"
      TRACKER_LEADERBOARD_ADMIN_BASE_URL = "http://127.0.0.1:$TrackerLeaderboardHubPort/api/v1/admin"
      TRACKER_DISPLAYNAME_BASE_URL = "http://127.0.0.1:$TrackerDisplaynameHubPort/api/v1"
      TRACKER_CLUB_BASE_URL = "http://127.0.0.1:$TrackerClubHubPort/api/v1"
      AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api/v1"
      ALTERED_TRACKER_DISPLAYNAME_ENABLED = "1"
      ALTERED_TRACKER_DISPLAYNAME_FALLBACK_LOCAL = "1"
      ALTERED_TRACKER_CLUB_ENABLED = "1"
      ALTERED_TRACKER_CLUB_FALLBACK_LOCAL = "1"
      TRACKER_PROXY_TIMEOUT_MS = "15000"
      ALTERED_INTERNAL_TOKEN = "local-altered-internal"
      ALTERED_WR_WEBHOOK_SECRET = "local-tracker-wr-webhook"
      ALTERED_LIVE_MONITOR_ENABLED = "0"
      ALTERED_LIVE_MONITOR_INTERVAL_SECONDS = "1800"
      ALTERED_LIVE_CLUB_ID = "24231"
      ALTERED_LIVE_ACTIVITY_PAGE_SIZE = "250"
      ALTERED_LIVE_ACTIVITY_ACTIVE_ONLY = "0"
      ALTERED_LIVE_FETCH_MAP_DETAILS = "1"
      ALTERED_LIVE_AUTH_MODE = "basic"
      ALTERED_LIVE_USER_AGENT = "xjk.yt tracker (admin@xjk.yt)"
      ALTERED_LIVE_REQUEST_TIMEOUT_MS = "15000"
      ALTERED_LIVE_MIN_REQUEST_GAP_MS = "5000"
      ALTERED_OPS_MONITOR_ENABLED = "0"
      ALTERED_OPS_MONITOR_TICK_SECONDS = "120"
      ALTERED_OPS_MONITOR_MAX_MAPS_PER_RUN = "5000"
      ALTERED_MAP_COPY_BACKFILL_ENABLED = "0"
      ALTERED_EVENT_LOOP_WATCHDOG_DISABLED = "1"
      ALTERED_DEV_LOCAL_OPEN = "1"
      XJK_SHARED_AUTH_ENABLED = "1"
      XJK_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_LOCAL_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_AUTH_DB_FILE = Join-Path $RepoRoot "sites\xjk.yt\data\xjk-auth.sqlite"
      XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
    }
  }
}

function New-XjkTrackerEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [string]$AlteredDataDir,
    [int]$AlteredHubPort,
    [int]$AggregatorHubPort
  )

  return @{
    Name = "tracker-hub"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\trackers.xjk.yt\frontend\__runtime\wr"
      DATA_DIR = $AlteredDataDir
      DB_FILE = Join-Path $AlteredDataDir "altered-tracker.sqlite"
      TRACKER_ENABLED = "0"
      TRACKER_MODE = "wr"
      TRACKER_LEADERBOARD_TOP_N = "1"
      TRACKER_PROVIDER = "noop"
      TRACKER_TICK_SECONDS = "5"
      TRACKER_BATCH_SIZE = "6"
      TRACKER_MAX_CHECK_INTERVAL_SECONDS = "30"
      TRACKER_MIN_REQUEST_GAP_MS = "5000"
      TRACKER_USER_AGENT = "xjk.yt tracker (admin@xjk.yt)"
      TRACKER_WR_WEBHOOK_ENABLED = "1"
      TRACKER_WR_WEBHOOK_URL = "http://127.0.0.1:$AlteredHubPort/api/v1/webhook/wr"
      TRACKER_WR_WEBHOOK_SECRET = "local-tracker-wr-webhook"
      TRACKER_AGGREGATOR_ENABLED = "1"
      TRACKER_AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api/v1"
      TRACKER_AGGREGATOR_PROJECT_KEY = "local-tracker-main"
      TRACKER_AGGREGATOR_PROJECT_NAME = "Local Tracker Main"
      TRACKER_AGGREGATOR_SOURCE_LABEL = "local"
      TRACKER_INSTANCE_ID = "local-tracker-main"
      TRACKER_INSTANCE_NAME = "Local Tracker Main"
    }
  }
}

function New-XjkAggregatorEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [string]$AlteredDataDir,
    [string]$LogDir
  )

  return @{
    Name = "tracker-aggregator"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\aggregator.xjk.yt\frontend"
      DASH_FRONTEND_DIR = Join-Path $RepoRoot "sites\dash.xjk.yt\frontend"
      DASH_HOSTNAMES = "dash.localhost,dash.xjk.yt"
      DATA_DIR = $AlteredDataDir
      DB_FILE = Join-Path $AlteredDataDir "tracker-aggregator.sqlite"
      PM2_LOG_DIR = $LogDir
      DASH_ALTERED_INTERNAL_TOKEN = "local-altered-internal"
    }
  }
}

function New-XjkTrackerDisplayNameEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [int]$AggregatorHubPort
  )

  return @{
    Name = "tracker-displayname"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\trackers.xjk.yt\frontend\__runtime\displayname"
      TRACKER_DISPLAYNAME_AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api/v1"
      TRACKER_DISPLAYNAME_PROJECT_KEY = "local-tracker-displayname"
      TRACKER_DISPLAYNAME_PROJECT_NAME = "Local Tracker Displayname"
      TRACKER_DISPLAYNAME_SOURCE_LABEL = "local"
      TRACKER_DISPLAYNAME_ENABLED = "1"
      TRACKER_DISPLAYNAME_SCHEDULER_ENABLED = "0"
      TRACKER_DISPLAYNAME_REQUEST_TIMEOUT_MS = "15000"
      TRACKER_DISPLAYNAME_MIN_REQUEST_GAP_MS = "5000"
    }
  }
}

function New-XjkTrackerClubEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [int]$AggregatorHubPort
  )

  return @{
    Name = "tracker-club"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\trackers.xjk.yt\frontend\__runtime\club"
      TRACKER_CLUB_AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api/v1"
      TRACKER_CLUB_PROJECT_KEY = "local-tracker-club"
      TRACKER_CLUB_PROJECT_NAME = "Local Tracker Club"
      TRACKER_CLUB_SOURCE_LABEL = "local"
      TRACKER_CLUB_ENABLED = "0"
      TRACKER_CLUB_REQUEST_TIMEOUT_MS = "15000"
    }
  }
}

function New-XjkTrackerLeaderboardEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [string]$AlteredDataDir,
    [int]$AggregatorHubPort
  )

  return @{
    Name = "tracker-leaderboard"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\trackers.xjk.yt\frontend\__runtime\leaderboard"
      DATA_DIR = $AlteredDataDir
      DB_FILE = Join-Path $AlteredDataDir "altered-tracker-leaderboard.sqlite"
      TRACKER_ENABLED = "0"
      TRACKER_MODE = "leaderboard"
      TRACKER_LEADERBOARD_TOP_N = "100"
      TRACKER_PROVIDER = "noop"
      TRACKER_TICK_SECONDS = "15"
      TRACKER_BATCH_SIZE = "4"
      TRACKER_MAX_CHECK_INTERVAL_SECONDS = "45"
      TRACKER_REQUEST_TIMEOUT_MS = "15000"
      TRACKER_MIN_REQUEST_GAP_MS = "10000"
      TRACKER_USER_AGENT = "xjk.yt tracker (admin@xjk.yt)"
      TRACKER_WR_WEBHOOK_ENABLED = "0"
      TRACKER_AGGREGATOR_ENABLED = "1"
      TRACKER_AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api/v1"
      TRACKER_AGGREGATOR_PROJECT_KEY = "local-tracker-leaderboard"
      TRACKER_AGGREGATOR_PROJECT_NAME = "Local Tracker Leaderboard"
      TRACKER_AGGREGATOR_SOURCE_LABEL = "local"
      TRACKER_INSTANCE_ID = "local-tracker-leaderboard"
      TRACKER_INSTANCE_NAME = "Local Tracker Leaderboard"
    }
  }
}

function New-XjkBannerBuilderEnvironmentOverlay {
  return @{
    Name = "altered-bannerbuilder"
    Env = @{
      HOST = "127.0.0.1"
      FLASK_DEBUG = "0"
      TRUST_PROXY = "1"
      DASHMAP_USER = ""
    }
  }
}

function New-XjkLearnProfileEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [int]$GatewayPort
  )

  return @{
    Name = "learn-profile"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\learn.xjk.yt\frontend"
      LEARN_CONTENT_DIR = Join-Path $RepoRoot "sites\learn.xjk.yt\frontend\content"
      LEARN_PROFILE_DATA_DIR = Join-Path $RepoRoot "sites\learn.xjk.yt\data"
      LEARN_UBI_OAUTH_ENABLED = "0"
      LEARN_UBI_OAUTH_AUTHORIZE_URL = "https://api.trackmania.com/oauth/authorize"
      LEARN_UBI_OAUTH_TOKEN_URL = "https://api.trackmania.com/api/access_token"
      LEARN_UBI_OAUTH_USERINFO_URL = "https://api.trackmania.com/api/user"
      LEARN_UBI_OAUTH_SCOPE = "clubs"
      LEARN_UBI_OAUTH_CALLBACK_PATH = "/auth/ubisoft/callback"
      LEARN_SESSION_COOKIE_NAME = "learn_profile_session"
      LEARN_SESSION_TTL_SECONDS = "43200"
      LEARN_OAUTH_STATE_TTL_SECONDS = "600"
      LEARN_PROFILE_USER_AGENT = "learn.xjk.yt profile integration"
      LEARN_HEAD_ADMIN_USERNAMES = ""
      XJK_SHARED_AUTH_ENABLED = "1"
      XJK_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_LOCAL_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_AUTH_DB_FILE = Join-Path $RepoRoot "sites\xjk.yt\data\xjk-auth.sqlite"
      XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
    }
  }
}

function New-XjkConsoleEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [int]$GatewayPort,
    [int]$AggregatorHubPort,
    [int]$TrackerDisplaynameHubPort
  )

  return @{
    Name = "console-hub"
    Env = @{
      FRONTEND_DIR = Join-Path $RepoRoot "sites\console.xjk.yt\frontend"
      CONSOLE_HUB_DATA_DIR = Join-Path $RepoRoot "sites\console.xjk.yt\data"
      CONSOLE_HUB_DB_FILE = Join-Path $RepoRoot "sites\console.xjk.yt\data\bingo-bridge.sqlite"
      CONSOLE_HUB_PUBLIC_BASE_PATH = "/bingo"
      CONSOLE_HUB_UBI_OAUTH_CALLBACK_PATH = "/bingo/auth/ubisoft/callback"
      CONSOLE_HUB_CLUB_LABEL = "Bingo On Console"
      CONSOLE_HUB_CLUB_ROOT_NAME = "Rooms"
      CONSOLE_HUB_AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api"
      CONSOLE_HUB_TRACKER_DISPLAYNAME_BASE_URL = "http://127.0.0.1:$TrackerDisplaynameHubPort/api"
      AGGREGATOR_BASE_URL = "http://127.0.0.1:$AggregatorHubPort/api"
      TRACKER_DISPLAYNAME_BASE_URL = "http://127.0.0.1:$TrackerDisplaynameHubPort/api"
      XJK_SHARED_AUTH_ENABLED = "1"
      XJK_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_LOCAL_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_AUTH_DB_FILE = Join-Path $RepoRoot "sites\xjk.yt\data\xjk-auth.sqlite"
      XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
    }
  }
}

function New-XjkAuthEnvironmentOverlay {
  param(
    [string]$RepoRoot,
    [int]$GatewayPort
  )

  return @{
    Name = "xjk-auth"
    Env = @{
      XJK_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_LOCAL_PUBLIC_ORIGIN = "http://localhost:$GatewayPort"
      XJK_AUTH_DB_FILE = Join-Path $RepoRoot "sites\xjk.yt\data\xjk-auth.sqlite"
      XJK_AUTH_SESSION_COOKIE_NAME = "xjk_session"
      XJK_AUTH_SESSION_COOKIE_DOMAIN = ""
      XJK_AUTH_SESSION_TTL_SECONDS = "2592000"
      UBI_OAUTH_CALLBACK_PATH = "/auth/ubisoft/callback"
    }
  }
}
