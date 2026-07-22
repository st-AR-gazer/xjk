function prepareCoreStatements(db) {
  return {
    upsertClub: db.prepare(`
      INSERT INTO clubs (
        club_id, club_name, source_label, first_seen_at, last_synced_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id) DO UPDATE SET
        club_name = COALESCE(excluded.club_name, clubs.club_name),
        source_label = COALESCE(excluded.source_label, clubs.source_label),
        last_synced_at = excluded.last_synced_at,
        payload_json = COALESCE(excluded.payload_json, clubs.payload_json)
    `),
    upsertMapRegistry: db.prepare(`
      INSERT INTO map_registry (
        map_uid, map_name, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(map_uid) DO UPDATE SET
        map_name = CASE
          WHEN excluded.map_name IS NOT NULL AND excluded.map_name <> '' THEN excluded.map_name
          ELSE map_registry.map_name
        END,
        last_seen_at = excluded.last_seen_at
    `),
    upsertAccount: db.prepare(`
      INSERT INTO accounts (
        account_id, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
    `),
  };
}

function prepareCampaignStatements(db) {
  return {
    upsertCollection: db.prepare(`
      INSERT INTO club_campaigns (
        club_id, campaign_id, activity_id, name, publication_ts, creation_ts,
        maps_count, source_label, payload_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, campaign_id) DO UPDATE SET
        activity_id = COALESCE(excluded.activity_id, club_campaigns.activity_id),
        name = COALESCE(excluded.name, club_campaigns.name),
        publication_ts = COALESCE(excluded.publication_ts, club_campaigns.publication_ts),
        creation_ts = COALESCE(excluded.creation_ts, club_campaigns.creation_ts),
        maps_count = excluded.maps_count,
        source_label = COALESCE(excluded.source_label, club_campaigns.source_label),
        payload_json = COALESCE(excluded.payload_json, club_campaigns.payload_json),
        last_synced_at = excluded.last_synced_at
    `),
    upsertMap: db.prepare(`
      INSERT INTO club_campaign_maps (
        club_id, campaign_id, map_uid, map_name, position, author_account_id,
        players_total, source_label, payload_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, campaign_id, map_uid) DO UPDATE SET
        map_name = COALESCE(excluded.map_name, club_campaign_maps.map_name),
        position = COALESCE(excluded.position, club_campaign_maps.position),
        author_account_id = COALESCE(excluded.author_account_id, club_campaign_maps.author_account_id),
        players_total = COALESCE(excluded.players_total, club_campaign_maps.players_total),
        source_label = COALESCE(excluded.source_label, club_campaign_maps.source_label),
        payload_json = COALESCE(excluded.payload_json, club_campaign_maps.payload_json),
        last_synced_at = excluded.last_synced_at
    `),
  };
}

function prepareUploadStatements(db) {
  return {
    upsertCollection: db.prepare(`
      INSERT INTO club_uploads (
        club_id, upload_id, activity_id, name, publication_ts, creation_ts,
        maps_count, source_label, payload_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, upload_id) DO UPDATE SET
        activity_id = COALESCE(excluded.activity_id, club_uploads.activity_id),
        name = COALESCE(excluded.name, club_uploads.name),
        publication_ts = COALESCE(excluded.publication_ts, club_uploads.publication_ts),
        creation_ts = COALESCE(excluded.creation_ts, club_uploads.creation_ts),
        maps_count = excluded.maps_count,
        source_label = COALESCE(excluded.source_label, club_uploads.source_label),
        payload_json = COALESCE(excluded.payload_json, club_uploads.payload_json),
        last_synced_at = excluded.last_synced_at
    `),
    upsertMap: db.prepare(`
      INSERT INTO club_upload_maps (
        club_id, upload_id, map_uid, map_name, position, author_account_id,
        players_total, source_label, payload_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, upload_id, map_uid) DO UPDATE SET
        map_name = COALESCE(excluded.map_name, club_upload_maps.map_name),
        position = COALESCE(excluded.position, club_upload_maps.position),
        author_account_id = COALESCE(excluded.author_account_id, club_upload_maps.author_account_id),
        players_total = COALESCE(excluded.players_total, club_upload_maps.players_total),
        source_label = COALESCE(excluded.source_label, club_upload_maps.source_label),
        payload_json = COALESCE(excluded.payload_json, club_upload_maps.payload_json),
        last_synced_at = excluded.last_synced_at
    `),
  };
}

function prepareMemberStatements(db) {
  return {
    upsertMember: db.prepare(`
      INSERT INTO club_members (
        club_id, account_id, role, source_label, payload_json, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id, account_id) DO UPDATE SET
        role = COALESCE(excluded.role, club_members.role),
        source_label = COALESCE(excluded.source_label, club_members.source_label),
        payload_json = COALESCE(excluded.payload_json, club_members.payload_json),
        last_synced_at = excluded.last_synced_at
    `),
    getCurrentName: db.prepare(`
      SELECT display_name AS displayName
      FROM account_display_name_current
      WHERE account_id = ?
      LIMIT 1
    `),
    closeHistoryName: db.prepare(`
      UPDATE account_display_name_history
      SET valid_to = ?
      WHERE account_id = ? AND valid_to IS NULL
    `),
    upsertHistoryName: db.prepare(`
      INSERT OR IGNORE INTO account_display_name_history (
        account_id, display_name, normalized_display_name, source,
        valid_from, valid_to, observed_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?)
    `),
    upsertCurrentName: db.prepare(`
      INSERT INTO account_display_name_current (
        account_id, display_name, normalized_display_name, source, observed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        display_name = excluded.display_name,
        normalized_display_name = excluded.normalized_display_name,
        source = COALESCE(excluded.source, account_display_name_current.source),
        observed_at = excluded.observed_at,
        updated_at = excluded.updated_at
    `),
  };
}

function prepareClubSnapshotStatements(db) {
  return {
    core: prepareCoreStatements(db),
    campaign: prepareCampaignStatements(db),
    upload: prepareUploadStatements(db),
    member: prepareMemberStatements(db),
  };
}

export { prepareClubSnapshotStatements };
