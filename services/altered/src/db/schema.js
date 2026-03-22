export const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS altered_hook_config (
    hook_key TEXT PRIMARY KEY,
    club_id INTEGER NOT NULL,
    club_name TEXT NOT NULL,
    source_label TEXT NOT NULL DEFAULT 'altered-monitor',
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_track_new_maps INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_synced_at TEXT,
    last_error TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_project_sources (
    source_key TEXT PRIMARY KEY,
    source_type TEXT NOT NULL DEFAULT 'special',
    display_name TEXT NOT NULL,
    source_label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_synced_at TEXT,
    last_error TEXT,
    summary_json TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_project_sources_type
    ON altered_project_sources(source_type, enabled, updated_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_live_monitor_config (
    config_id INTEGER PRIMARY KEY CHECK (config_id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    schedule_mode TEXT NOT NULL DEFAULT 'interval' CHECK (schedule_mode IN ('interval', 'daily')),
    daily_hour_utc INTEGER NOT NULL DEFAULT 3,
    daily_minute_utc INTEGER NOT NULL DEFAULT 0,
    club_id INTEGER NOT NULL DEFAULT 24231,
    interval_seconds INTEGER NOT NULL DEFAULT 21600,
    discovery_enabled INTEGER NOT NULL DEFAULT 1,
    discovery_interval_seconds INTEGER NOT NULL DEFAULT 3600,
    discovery_campaign_limit INTEGER NOT NULL DEFAULT 25,
    discovery_activity_page_size INTEGER NOT NULL DEFAULT 100,
    activity_page_size INTEGER NOT NULL DEFAULT 250,
    active_only INTEGER NOT NULL DEFAULT 0,
    fetch_map_details INTEGER NOT NULL DEFAULT 1,
    tracker_chunk_size INTEGER NOT NULL DEFAULT 350,
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_campaigns (
    campaign_id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    external_campaign_id INTEGER,
    activity_id INTEGER,
    activity_type TEXT,
    campaign_type TEXT,
    start_timestamp TEXT,
    end_timestamp TEXT,
    published INTEGER NOT NULL DEFAULT 0,
    leaderboard_group_uid TEXT,
    payload_json TEXT,
    monitor_updated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(club_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_campaigns_club ON altered_campaigns(club_id, name);
  CREATE INDEX IF NOT EXISTS idx_altered_campaigns_external_id ON altered_campaigns(club_id, external_campaign_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_maps (
    map_uid TEXT PRIMARY KEY,
    map_id TEXT,
    name TEXT NOT NULL,
    map_type TEXT,
    map_style TEXT,
    map_environment TEXT,
    author TEXT,
    author_display_name TEXT,
    submitter TEXT,
    submitter_display_name TEXT,
    author_time INTEGER NOT NULL DEFAULT 0,
    gold_time INTEGER NOT NULL DEFAULT 0,
    silver_time INTEGER NOT NULL DEFAULT 0,
    bronze_time INTEGER NOT NULL DEFAULT 0,
    nb_laps INTEGER NOT NULL DEFAULT 1,
    thumbnail_url TEXT,
    download_url TEXT,
    player_count INTEGER NOT NULL DEFAULT 0,
    player_count_updated_at TEXT,
    wr_ms INTEGER NOT NULL DEFAULT 0,
    wr_holder TEXT,
    wr_updated_at TEXT,
    tracked INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'paused', 'archived')),
    check_frequency INTEGER NOT NULL DEFAULT 21600,
    last_checked_at TEXT,
    map_created_at TEXT,
    map_updated_at TEXT,
    payload_json TEXT,
    monitor_updated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_synced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_altered_maps_tracked ON altered_maps(tracked, status);
  CREATE INDEX IF NOT EXISTS idx_altered_maps_name ON altered_maps(name);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_mapper_accounts (
    account_id TEXT PRIMARY KEY,
    latest_display_name TEXT,
    latest_source TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_resolved_at TEXT,
    last_resolution_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_mapper_accounts_display_name
    ON altered_mapper_accounts(latest_display_name);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_mapper_name_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL REFERENCES altered_mapper_accounts(account_id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'trackmania-oauth',
    created_at TEXT NOT NULL,
    UNIQUE(account_id, display_name)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_mapper_name_history_account
    ON altered_mapper_name_history(account_id, observed_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_name_candidates (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    sanitized_name TEXT NOT NULL,
    proposed_name TEXT,
    parser_pattern TEXT,
    parser_confidence REAL NOT NULL DEFAULT 0,
    season TEXT,
    year INTEGER,
    map_number INTEGER,
    map_numbers_json TEXT,
    alteration_label TEXT,
    alteration_mix_json TEXT,
    automation_state TEXT NOT NULL DEFAULT 'unmatched' CHECK (automation_state IN ('matched', 'unmatched')),
    review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'approved', 'ignored')),
    manual_name TEXT,
    review_note TEXT,
    requires_regex INTEGER NOT NULL DEFAULT 0,
    source_version TEXT NOT NULL DEFAULT 'sorting-v3-lite',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_processed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_name_candidates_auto
    ON altered_map_name_candidates(automation_state, review_state, parser_confidence DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_map_name_candidates_season
    ON altered_map_name_candidates(season, year, map_number);
  CREATE INDEX IF NOT EXISTS idx_altered_map_name_candidates_regex
    ON altered_map_name_candidates(requires_regex, review_state);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_local_files (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    download_url TEXT,
    file_sha256 TEXT,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    downloaded_at TEXT,
    verified_at TEXT,
    status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('ready', 'missing', 'error')),
    last_error TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_local_files_status
    ON altered_map_local_files(status, updated_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_local_file_fixes (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    source_file_path TEXT,
    file_sha256 TEXT,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT,
    verified_at TEXT,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'missing', 'error')),
    note TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_local_file_fixes_status
    ON altered_map_local_file_fixes(status, updated_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_content_signatures (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    extraction_version TEXT NOT NULL,
    file_sha256 TEXT,
    download_url TEXT,
    printable_token_count INTEGER NOT NULL DEFAULT 0,
    asset_token_count INTEGER NOT NULL DEFAULT 0,
    signature_json TEXT,
    source_status TEXT NOT NULL DEFAULT 'ready' CHECK (source_status IN ('ready', 'missing-download', 'error')),
    source_error TEXT,
    extracted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_content_signatures_status
    ON altered_map_content_signatures(source_status, updated_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_number_similarity (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    family_key TEXT,
    reference_campaign_id INTEGER REFERENCES altered_campaigns(campaign_id) ON DELETE SET NULL,
    reference_campaign_name TEXT,
    primary_reference_map_uid TEXT,
    primary_reference_slot INTEGER,
    assigned_map_numbers_json TEXT NOT NULL DEFAULT '[]',
    top_score REAL NOT NULL DEFAULT 0,
    second_score REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    assignment_method TEXT NOT NULL DEFAULT 'asset-token-jaccard-v1',
    candidate_matches_json TEXT,
    details_json TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_number_similarity_family
    ON altered_map_number_similarity(family_key, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_map_number_similarity_reference
    ON altered_map_number_similarity(reference_campaign_id, primary_reference_slot);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_map_positions (
    map_uid TEXT PRIMARY KEY REFERENCES altered_maps(map_uid) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES altered_campaigns(campaign_id) ON DELETE SET NULL,
    slot INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_map_positions_campaign ON altered_map_positions(campaign_id, slot);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_club_members (
    club_id INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    display_name TEXT,
    role TEXT,
    status TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_vip INTEGER NOT NULL DEFAULT 0,
    is_creator INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT,
    left_at TEXT,
    payload_json TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (club_id, account_id)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_club_members_role
    ON altered_club_members(club_id, role, status);
  CREATE INDEX IF NOT EXISTS idx_altered_club_members_seen
    ON altered_club_members(club_id, last_seen_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_club_activities (
    club_id INTEGER NOT NULL,
    activity_id INTEGER NOT NULL,
    activity_type TEXT,
    item_type TEXT,
    name TEXT,
    campaign_external_id INTEGER,
    bucket_id INTEGER,
    map_uid TEXT,
    author_account_id TEXT,
    active INTEGER NOT NULL DEFAULT 0,
    occurred_at TEXT,
    payload_json TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (club_id, activity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_club_activities_occurred
    ON altered_club_activities(club_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_club_activities_type
    ON altered_club_activities(club_id, activity_type, item_type);
  CREATE INDEX IF NOT EXISTS idx_altered_club_activities_map
    ON altered_club_activities(map_uid);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_upload_buckets (
    club_id INTEGER NOT NULL,
    bucket_id INTEGER NOT NULL,
    bucket_type TEXT NOT NULL DEFAULT 'map',
    name TEXT,
    activity_id INTEGER,
    map_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    payload_json TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (club_id, bucket_id)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_upload_buckets_seen
    ON altered_upload_buckets(club_id, last_seen_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_upload_maps (
    club_id INTEGER NOT NULL,
    bucket_id INTEGER NOT NULL,
    map_uid TEXT NOT NULL,
    slot INTEGER NOT NULL DEFAULT 1,
    map_name TEXT,
    author_account_id TEXT,
    payload_json TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (club_id, bucket_id, map_uid),
    FOREIGN KEY (club_id, bucket_id) REFERENCES altered_upload_buckets(club_id, bucket_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_altered_upload_maps_bucket
    ON altered_upload_maps(club_id, bucket_id, slot);
  CREATE INDEX IF NOT EXISTS idx_altered_upload_maps_map
    ON altered_upload_maps(map_uid);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_sync_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    hook_key TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    campaigns_seen INTEGER NOT NULL DEFAULT 0,
    maps_seen INTEGER NOT NULL DEFAULT 0,
    maps_inserted INTEGER NOT NULL DEFAULT 0,
    maps_updated INTEGER NOT NULL DEFAULT 0,
    maps_linked INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_altered_sync_runs_hook ON altered_sync_runs(hook_key, run_id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_wr_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL,
    map_name TEXT NOT NULL DEFAULT '',
    account_id TEXT,
    holder TEXT NOT NULL DEFAULT '',
    wr_ms INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_wr_events_recorded
    ON altered_wr_events(recorded_at DESC, event_id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_update_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_uid TEXT NOT NULL,
    map_name TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'rejected')),
    requester_ip TEXT,
    requester_user_agent TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_altered_update_requests_created
    ON altered_update_requests(created_at DESC, request_id DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_update_requests_status
    ON altered_update_requests(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_update_requests_map
    ON altered_update_requests(map_uid, created_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_api_requests (
    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_key TEXT NOT NULL,
    request_path TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    map_uid TEXT,
    origin TEXT,
    client_hash TEXT,
    user_agent TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_api_requests_created
    ON altered_api_requests(created_at DESC, request_id DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_api_requests_endpoint
    ON altered_api_requests(endpoint_key, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_api_requests_map
    ON altered_api_requests(map_uid, created_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_admin_users (
    admin_user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    ubisoft_subject TEXT UNIQUE,
    ubisoft_username TEXT,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'manual',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT,
    CHECK (
      (ubisoft_subject IS NOT NULL AND TRIM(ubisoft_subject) <> '')
      OR (ubisoft_username IS NOT NULL AND TRIM(ubisoft_username) <> '')
    )
  );
  CREATE INDEX IF NOT EXISTS idx_altered_admin_users_active ON altered_admin_users(is_active, admin_user_id DESC);
  CREATE INDEX IF NOT EXISTS idx_altered_admin_users_username ON altered_admin_users(ubisoft_username);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_admin_sessions (
    session_token TEXT PRIMARY KEY,
    admin_user_id INTEGER REFERENCES altered_admin_users(admin_user_id) ON DELETE SET NULL,
    ubisoft_subject TEXT,
    ubisoft_username TEXT,
    session_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_altered_admin_sessions_expires ON altered_admin_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_altered_admin_sessions_admin_user ON altered_admin_sessions(admin_user_id, expires_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS user_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_type_id INTEGER REFERENCES user_types(id) ON DELETE SET NULL,
    parse_id TEXT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    logged_in INTEGER NOT NULL DEFAULT 0,
    token_facebook TEXT,
    token_twitter TEXT,
    user_token TEXT,
    token_expiration TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS user_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    schedule_cloud_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_schedules_user ON user_schedules(user_id, id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS user_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id, id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS user_schedule_runtime (
    schedule_id INTEGER PRIMARY KEY REFERENCES user_schedules(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 1,
    interval_hours INTEGER NOT NULL DEFAULT 6,
    last_run_at TEXT,
    next_run_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_schedule_runtime_due ON user_schedule_runtime(enabled, next_run_at);
  `,
  `
  CREATE TABLE IF NOT EXISTS monitored_maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    map_uid TEXT NOT NULL,
    map_name TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    source_label TEXT NOT NULL DEFAULT 'altered-ops',
    last_wr_ms INTEGER,
    last_wr_holder TEXT,
    last_checked_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, map_uid)
  );
  CREATE INDEX IF NOT EXISTS idx_monitored_maps_uid ON monitored_maps(map_uid);
  CREATE INDEX IF NOT EXISTS idx_monitored_maps_user_enabled ON monitored_maps(user_id, enabled);
  `,
  `
  CREATE TABLE IF NOT EXISTS map_poll_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER REFERENCES user_schedules(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    maps_total INTEGER NOT NULL DEFAULT 0,
    maps_checked INTEGER NOT NULL DEFAULT 0,
    maps_changed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'error')),
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_map_poll_runs_schedule ON map_poll_runs(schedule_id, run_id DESC);
  CREATE INDEX IF NOT EXISTS idx_map_poll_runs_user ON map_poll_runs(user_id, run_id DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS map_poll_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES map_poll_runs(run_id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES user_schedules(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    map_uid TEXT NOT NULL,
    map_name TEXT,
    checked_at TEXT NOT NULL,
    changed INTEGER NOT NULL DEFAULT 0,
    old_wr_ms INTEGER,
    new_wr_ms INTEGER,
    old_wr_holder TEXT,
    new_wr_holder TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_map_poll_events_checked ON map_poll_events(checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_map_poll_events_map ON map_poll_events(map_uid, checked_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS discord_bot_config (
    config_id INTEGER PRIMARY KEY CHECK (config_id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    bot_name TEXT NOT NULL DEFAULT 'altered-bot',
    guild_id TEXT,
    channel_id TEXT,
    webhook_url TEXT,
    announce_wr_changes INTEGER NOT NULL DEFAULT 1,
    mention_role_id TEXT,
    footer_text TEXT,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO discord_bot_config (
    config_id,
    enabled,
    bot_name,
    guild_id,
    channel_id,
    webhook_url,
    announce_wr_changes,
    mention_role_id,
    footer_text,
    updated_at
  ) VALUES (
    1,
    0,
    'altered-bot',
    '',
    '',
    '',
    1,
    '',
    '',
    CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_alterations (
    alteration_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_altered_alterations_slug
    ON altered_alterations(slug);
  `,
  `
  CREATE TABLE IF NOT EXISTS altered_campaign_alterations (
    campaign_id INTEGER NOT NULL REFERENCES altered_campaigns(campaign_id) ON DELETE CASCADE,
    alteration_id INTEGER NOT NULL REFERENCES altered_alterations(alteration_id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, alteration_id)
  );
  CREATE INDEX IF NOT EXISTS idx_altered_campaign_alterations_alteration
    ON altered_campaign_alterations(alteration_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS discord_bot_commands (
    command_id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'cancelled')),
    command_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ops-scheduler',
    created_at TEXT NOT NULL,
    processed_at TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_discord_bot_commands_status ON discord_bot_commands(status, command_id ASC);
  `,
];
