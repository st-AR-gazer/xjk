export const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS maps (
    map_uid TEXT PRIMARY KEY,
    map_id TEXT,
    name TEXT NOT NULL,
    author TEXT,
    submitter TEXT,
    author_time INTEGER,
    gold_time INTEGER,
    silver_time INTEGER,
    bronze_time INTEGER,
    nb_laps INTEGER NOT NULL DEFAULT 1,
    thumbnail_url TEXT,
    download_url TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    added_to_bot_at TEXT,
    check_frequency INTEGER NOT NULL DEFAULT 21600,
    last_checked_at TEXT,
    wr_account_id TEXT,
    wr_display_name TEXT,
    wr_time INTEGER,
    wr_updated_at TEXT,
    is_tracked INTEGER NOT NULL DEFAULT 1,
    tracking_status TEXT NOT NULL DEFAULT 'live' CHECK (tracking_status IN ('live', 'paused', 'archived'))
  );
  CREATE INDEX IF NOT EXISTS idx_maps_name ON maps(name);
  CREATE INDEX IF NOT EXISTS idx_maps_wr_updated_at ON maps(wr_updated_at);
  CREATE INDEX IF NOT EXISTS idx_maps_tracked_status ON maps(is_tracked, tracking_status);
  CREATE INDEX IF NOT EXISTS idx_maps_last_checked ON maps(last_checked_at);
  `,
  `
  CREATE TABLE IF NOT EXISTS wr_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    account_id TEXT,
    display_name TEXT,
    record_time INTEGER NOT NULL,
    medal INTEGER,
    replay_url TEXT,
    replay_local_path TEXT,
    timestamp TEXT NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0,
    zone_id TEXT,
    zone_name TEXT,
    position INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_wr_history_map_uid_ts ON wr_history(map_uid, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_wr_history_ts ON wr_history(timestamp DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS leaderboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    account_id TEXT,
    display_name TEXT,
    score INTEGER,
    ranking INTEGER,
    timestamp TEXT NOT NULL,
    zone_id TEXT,
    zone_name TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_leaderboards_map_uid_ts ON leaderboards(map_uid, timestamp DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS clubs (
    club_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    author_account_id TEXT,
    icon_url TEXT,
    decal_url TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS campaigns (
    campaign_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_timestamp TEXT,
    end_timestamp TEXT,
    club_id INTEGER REFERENCES clubs(club_id) ON DELETE SET NULL,
    leaderboard_group_uid TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_unique_name_per_club ON campaigns(club_id, name);
  `,
  `
  CREATE TABLE IF NOT EXISTS map_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    slot INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE INDEX IF NOT EXISTS idx_map_campaigns_map_uid ON map_campaigns(map_uid);
  CREATE INDEX IF NOT EXISTS idx_map_campaigns_campaign_id ON map_campaigns(campaign_id, slot);
  `,
  `
  CREATE TABLE IF NOT EXISTS guilds (
    guild_id TEXT PRIMARY KEY,
    token TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS trackers (
    tracker_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discord_channel TEXT,
    guild_id TEXT REFERENCES guilds(guild_id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE INDEX IF NOT EXISTS idx_trackers_guild_id ON trackers(guild_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS mapuploads (
    mapuploads_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_timestamp TEXT,
    end_timestamp TEXT,
    club_id INTEGER REFERENCES clubs(club_id) ON DELETE SET NULL,
    leaderboard_group_uid TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS map_mapuploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    mapuploads_id INTEGER NOT NULL REFERENCES mapuploads(mapuploads_id) ON DELETE CASCADE,
    UNIQUE(map_uid, mapuploads_id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS tracker_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id INTEGER NOT NULL REFERENCES trackers(tracker_id) ON DELETE CASCADE,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(tracker_id, map_uid)
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_maps_tracker_id ON tracker_maps(tracker_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS tracker_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id INTEGER NOT NULL REFERENCES trackers(tracker_id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(tracker_id, campaign_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_campaigns_tracker_id ON tracker_campaigns(tracker_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS tracker_clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracker_id INTEGER NOT NULL REFERENCES trackers(tracker_id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(tracker_id, club_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_clubs_tracker_id ON tracker_clubs(tracker_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS tracker_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    maps_considered INTEGER NOT NULL DEFAULT 0,
    maps_checked INTEGER NOT NULL DEFAULT 0,
    wr_changes INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_runs_finished_at ON tracker_runs(finished_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS tracker_map_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES tracker_runs(run_id) ON DELETE SET NULL,
    map_uid TEXT NOT NULL REFERENCES maps(map_uid) ON DELETE CASCADE,
    checked_at TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    old_wr_time INTEGER,
    new_wr_time INTEGER,
    old_holder TEXT,
    new_holder TEXT,
    source TEXT,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tracker_map_checks_checked_at ON tracker_map_checks(checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tracker_map_checks_map_uid ON tracker_map_checks(map_uid, checked_at DESC);
  `,
];
