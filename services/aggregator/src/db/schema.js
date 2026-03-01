export const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    project_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    source_label TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_last_seen_at ON projects(last_seen_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS project_instances (
    project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
    instance_id TEXT NOT NULL,
    instance_name TEXT,
    source_label TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    registered_at TEXT NOT NULL,
    last_heartbeat_at TEXT NOT NULL,
    meta_json TEXT,
    PRIMARY KEY (project_key, instance_id)
  );
  CREATE INDEX IF NOT EXISTS idx_project_instances_heartbeat ON project_instances(last_heartbeat_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS map_registry (
    map_uid TEXT PRIMARY KEY,
    map_name TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_map_registry_last_seen_at ON map_registry(last_seen_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS project_maps (
    project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
    map_uid TEXT NOT NULL REFERENCES map_registry(map_uid) ON DELETE CASCADE,
    latest_checked_at TEXT,
    last_changed_at TEXT,
    wr_ms INTEGER,
    wr_holder TEXT,
    source TEXT,
    note TEXT,
    check_count INTEGER NOT NULL DEFAULT 0,
    change_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(project_key, map_uid)
  );
  CREATE INDEX IF NOT EXISTS idx_project_maps_latest_checked ON project_maps(latest_checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_project_maps_last_changed ON project_maps(last_changed_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS ingest_runs (
    ingest_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
    provider TEXT,
    reason TEXT,
    source_label TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    maps_considered INTEGER NOT NULL DEFAULT 0,
    maps_checked INTEGER NOT NULL DEFAULT 0,
    wr_changes INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ingest_runs_project ON ingest_runs(project_key, finished_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ingest_runs_finished ON ingest_runs(finished_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS map_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingest_id INTEGER REFERENCES ingest_runs(ingest_id) ON DELETE SET NULL,
    project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
    map_uid TEXT NOT NULL REFERENCES map_registry(map_uid) ON DELETE CASCADE,
    map_name TEXT,
    checked_at TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    old_wr_time INTEGER,
    new_wr_time INTEGER,
    old_holder TEXT,
    new_holder TEXT,
    source TEXT,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_map_events_checked ON map_events(checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_map_events_project_checked ON map_events(project_key, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_map_events_map_uid ON map_events(map_uid, checked_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS wr_baseline_queue (
    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL REFERENCES projects(project_key) ON DELETE CASCADE,
    map_uid TEXT NOT NULL REFERENCES map_registry(map_uid) ON DELETE CASCADE,
    map_name TEXT,
    checked_at TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    old_wr_time INTEGER,
    new_wr_time INTEGER,
    old_holder TEXT,
    new_holder TEXT,
    source TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'resolved', 'ignored')),
    resolution_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_wr_baseline_queue_status_created
    ON wr_baseline_queue(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wr_baseline_queue_project_created
    ON wr_baseline_queue(project_key, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wr_baseline_queue_dedupe
    ON wr_baseline_queue(
      project_key,
      map_uid,
      reason_code,
      COALESCE(new_wr_time, 0),
      COALESCE(new_holder, '')
    );
  `,
  `
  CREATE TABLE IF NOT EXISTS aggregator_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT REFERENCES projects(project_key) ON DELETE SET NULL,
    occurred_at TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail_1 TEXT,
    detail_2 TEXT,
    detail_3 TEXT,
    source_label TEXT,
    payload_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_aggregator_events_occurred
    ON aggregator_events(occurred_at DESC, event_id DESC);
  CREATE INDEX IF NOT EXISTS idx_aggregator_events_project_occurred
    ON aggregator_events(project_key, occurred_at DESC, event_id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_last_seen ON accounts(last_seen_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS account_display_name_current (
    account_id TEXT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    source TEXT,
    observed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_account_display_name_current_observed ON account_display_name_current(observed_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS account_display_name_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    source TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    observed_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_account_display_name_history_unique
    ON account_display_name_history(account_id, display_name, valid_from);
  CREATE INDEX IF NOT EXISTS idx_account_display_name_history_account
    ON account_display_name_history(account_id, valid_from DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS clubs (
    club_id INTEGER PRIMARY KEY,
    club_name TEXT,
    source_label TEXT,
    first_seen_at TEXT NOT NULL,
    last_synced_at TEXT NOT NULL,
    payload_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_clubs_last_synced ON clubs(last_synced_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS club_campaigns (
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL,
    activity_id INTEGER,
    name TEXT,
    publication_ts INTEGER,
    creation_ts INTEGER,
    maps_count INTEGER NOT NULL DEFAULT 0,
    source_label TEXT,
    payload_json TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (club_id, campaign_id)
  );
  CREATE INDEX IF NOT EXISTS idx_club_campaigns_last_synced
    ON club_campaigns(club_id, last_synced_at DESC);
  CREATE INDEX IF NOT EXISTS idx_club_campaigns_publication
    ON club_campaigns(club_id, publication_ts DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS club_campaign_maps (
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL,
    map_uid TEXT NOT NULL REFERENCES map_registry(map_uid) ON DELETE CASCADE,
    map_name TEXT,
    position INTEGER,
    author_account_id TEXT,
    players_total INTEGER,
    source_label TEXT,
    payload_json TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (club_id, campaign_id, map_uid)
  );
  CREATE INDEX IF NOT EXISTS idx_club_campaign_maps_club_map
    ON club_campaign_maps(club_id, map_uid);
  CREATE INDEX IF NOT EXISTS idx_club_campaign_maps_last_synced
    ON club_campaign_maps(club_id, last_synced_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS club_uploads (
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    upload_id INTEGER NOT NULL,
    activity_id INTEGER,
    name TEXT,
    publication_ts INTEGER,
    creation_ts INTEGER,
    maps_count INTEGER NOT NULL DEFAULT 0,
    source_label TEXT,
    payload_json TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (club_id, upload_id)
  );
  CREATE INDEX IF NOT EXISTS idx_club_uploads_last_synced
    ON club_uploads(club_id, last_synced_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS club_upload_maps (
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    upload_id INTEGER NOT NULL,
    map_uid TEXT NOT NULL REFERENCES map_registry(map_uid) ON DELETE CASCADE,
    map_name TEXT,
    position INTEGER,
    author_account_id TEXT,
    players_total INTEGER,
    source_label TEXT,
    payload_json TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (club_id, upload_id, map_uid)
  );
  CREATE INDEX IF NOT EXISTS idx_club_upload_maps_club_map
    ON club_upload_maps(club_id, map_uid);
  CREATE INDEX IF NOT EXISTS idx_club_upload_maps_last_synced
    ON club_upload_maps(club_id, last_synced_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS club_members (
    club_id INTEGER NOT NULL REFERENCES clubs(club_id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    role TEXT,
    source_label TEXT,
    payload_json TEXT,
    last_synced_at TEXT NOT NULL,
    PRIMARY KEY (club_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_club_members_last_synced
    ON club_members(club_id, last_synced_at DESC);
  `,
];
