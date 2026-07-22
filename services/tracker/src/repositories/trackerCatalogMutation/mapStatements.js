function prepareMapStatements(db) {
  return {
    selectMap: db.prepare(`
      SELECT
        map_uid AS uid,
        map_id AS mapId,
        is_tracked AS tracked,
        tracking_status AS status,
        check_frequency AS checkFrequency,
        wr_account_id AS wrAccountId,
        wr_display_name AS wrHolder,
        wr_time AS wrTime,
        wr_updated_at AS wrUpdatedAt,
        last_checked_at AS lastCheckedAt
      FROM maps
      WHERE map_uid = ?
      LIMIT 1
    `),
    insertMap: db.prepare(`
      INSERT INTO maps (
        map_uid, map_id, name, author, submitter,
        author_time, gold_time, silver_time, bronze_time, nb_laps,
        thumbnail_url, download_url, created_at, updated_at, added_to_bot_at,
        check_frequency, last_checked_at, wr_account_id, wr_display_name, wr_time, wr_updated_at,
        is_tracked, tracking_status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
    `),
    updateMap: db.prepare(`
      UPDATE maps
      SET
        map_id = ?,
        name = ?,
        author = ?,
        submitter = ?,
        author_time = ?,
        gold_time = ?,
        silver_time = ?,
        bronze_time = ?,
        nb_laps = ?,
        thumbnail_url = ?,
        download_url = ?,
        check_frequency = ?,
        last_checked_at = ?,
        wr_account_id = ?,
        wr_display_name = ?,
        wr_time = ?,
        wr_updated_at = ?,
        is_tracked = ?,
        tracking_status = ?,
        updated_at = ?
      WHERE map_uid = ?
    `),
    selectLatestCampaign: db.prepare(`
      SELECT
        c.name AS campaignName,
        c.club_id AS clubId,
        mc.slot AS slot
      FROM map_campaigns mc
      JOIN campaigns c ON c.campaign_id = mc.campaign_id
      WHERE mc.map_uid = ?
      ORDER BY mc.id DESC
      LIMIT 1
    `),
  };
}

export { prepareMapStatements };
