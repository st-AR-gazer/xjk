import { normalizeClubId } from "../support/repositoryValues.js";

function getClubSummary(db, clubId) {
  const normalizedClubId = normalizeClubId(clubId);
  if (!normalizedClubId) return null;
  const row = db
    .prepare(
      `
      SELECT
        c.club_id AS clubId,
        c.club_name AS clubName,
        c.source_label AS sourceLabel,
        c.last_synced_at AS lastSyncedAt,
        COALESCE(campaigns.count, 0) AS campaignsCount,
        COALESCE(campaignMaps.count, 0) AS campaignMapsCount,
        COALESCE(uploads.count, 0) AS uploadsCount,
        COALESCE(uploadMaps.count, 0) AS uploadMapsCount,
        COALESCE(members.count, 0) AS membersCount
      FROM clubs c
      LEFT JOIN (
        SELECT club_id, COUNT(*) AS count FROM club_campaigns GROUP BY club_id
      ) campaigns ON campaigns.club_id = c.club_id
      LEFT JOIN (
        SELECT club_id, COUNT(*) AS count FROM club_campaign_maps GROUP BY club_id
      ) campaignMaps ON campaignMaps.club_id = c.club_id
      LEFT JOIN (
        SELECT club_id, COUNT(*) AS count FROM club_uploads GROUP BY club_id
      ) uploads ON uploads.club_id = c.club_id
      LEFT JOIN (
        SELECT club_id, COUNT(*) AS count FROM club_upload_maps GROUP BY club_id
      ) uploadMaps ON uploadMaps.club_id = c.club_id
      LEFT JOIN (
        SELECT club_id, COUNT(*) AS count FROM club_members GROUP BY club_id
      ) members ON members.club_id = c.club_id
      WHERE c.club_id = ?
      LIMIT 1
    `
    )
    .get(normalizedClubId);

  if (!row) return null;
  return {
    clubId: Number(row.clubId),
    clubName: row.clubName || null,
    sourceLabel: row.sourceLabel || null,
    lastSyncedAt: row.lastSyncedAt || null,
    campaignsCount: Number(row.campaignsCount || 0),
    campaignMapsCount: Number(row.campaignMapsCount || 0),
    uploadsCount: Number(row.uploadsCount || 0),
    uploadMapsCount: Number(row.uploadMapsCount || 0),
    membersCount: Number(row.membersCount || 0),
  };
}

function getClubCampaigns(db, clubId, { limit = 200 } = {}) {
  const normalizedClubId = normalizeClubId(clubId);
  if (!normalizedClubId) return [];
  const rows = db
    .prepare(
      `
      SELECT
        campaign_id AS campaignId,
        activity_id AS activityId,
        name AS name,
        publication_ts AS publicationTs,
        creation_ts AS creationTs,
        maps_count AS mapsCount,
        source_label AS sourceLabel,
        last_synced_at AS lastSyncedAt
      FROM club_campaigns
      WHERE club_id = ?
      ORDER BY COALESCE(publication_ts, 0) DESC, campaign_id DESC
      LIMIT ?
    `
    )
    .all(normalizedClubId, Math.max(1, Math.min(Number(limit) || 200, 2000)));
  return rows.map((row) => ({
    campaignId: Number(row.campaignId || 0),
    activityId: row.activityId === null ? null : Number(row.activityId || 0),
    name: row.name || null,
    publicationTs: row.publicationTs === null ? null : Number(row.publicationTs || 0),
    creationTs: row.creationTs === null ? null : Number(row.creationTs || 0),
    mapsCount: Number(row.mapsCount || 0),
    sourceLabel: row.sourceLabel || null,
    lastSyncedAt: row.lastSyncedAt || null,
  }));
}

function normalizeClubQuery(clubId, q) {
  const normalizedClubId = normalizeClubId(clubId);
  if (!normalizedClubId) return null;
  const query = String(q || "")
    .trim()
    .toLowerCase();
  const clauses = ["club_id = ?"];
  const args = [normalizedClubId];
  if (query) {
    clauses.push("(LOWER(map_uid) LIKE ? OR LOWER(COALESCE(map_name, '')) LIKE ?)");
    args.push(`%${query}%`, `%${query}%`);
  }
  return { normalizedClubId, query, clauses, args };
}

function getClubMembers(db, clubId, { q = "", limit = 200 } = {}) {
  const normalizedClubId = normalizeClubId(clubId);
  if (!normalizedClubId) return [];
  const query = String(q || "")
    .trim()
    .toLowerCase();
  const clauses = ["m.club_id = ?"];
  const args = [normalizedClubId];
  if (query) {
    clauses.push("(LOWER(m.account_id) LIKE ? OR LOWER(COALESCE(c.display_name, '')) LIKE ?)");
    args.push(`%${query}%`, `%${query}%`);
  }
  const rows = db
    .prepare(
      `
      SELECT
        m.account_id AS accountId,
        m.role AS role,
        m.source_label AS sourceLabel,
        m.last_synced_at AS lastSyncedAt,
        c.display_name AS displayName,
        c.observed_at AS nameObservedAt
      FROM club_members m
      LEFT JOIN account_display_name_current c ON c.account_id = m.account_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY m.last_synced_at DESC, m.account_id ASC
      LIMIT ?
    `
    )
    .all(...args, Math.max(1, Math.min(Number(limit) || 200, 5000)));
  return rows.map((row) => ({
    accountId: row.accountId,
    displayName: row.displayName || null,
    role: row.role || null,
    sourceLabel: row.sourceLabel || null,
    nameObservedAt: row.nameObservedAt || null,
    lastSyncedAt: row.lastSyncedAt || null,
  }));
}

function getClubMaps(db, clubId, { q = "", limit = 500 } = {}) {
  const query = normalizeClubQuery(clubId, q);
  if (!query) return [];
  const { clauses, args } = query;
  const selectRelationMaps = (tableName, relationColumn, relationType) =>
    db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          map_name AS mapName,
          author_account_id AS authorAccountId,
          players_total AS playersTotal,
          last_synced_at AS lastSyncedAt,
          ${relationColumn} AS relationId,
          '${relationType}' AS relationType
        FROM ${tableName}
        WHERE ${clauses.join(" AND ")}
      `
      )
      .all(...args);
  const rows = [
    ...selectRelationMaps("club_campaign_maps", "campaign_id", "campaign"),
    ...selectRelationMaps("club_upload_maps", "upload_id", "upload"),
  ];

  return rows
    .sort((a, b) => String(b.lastSyncedAt || "").localeCompare(String(a.lastSyncedAt || "")))
    .slice(0, Math.max(1, Math.min(Number(limit) || 500, 10000)))
    .map((row) => ({
      mapUid: row.mapUid,
      mapName: row.mapName || row.mapUid,
      authorAccountId: row.authorAccountId || null,
      playersTotal: row.playersTotal === null ? null : Number(row.playersTotal || 0),
      lastSyncedAt: row.lastSyncedAt || null,
      relationType: row.relationType,
      relationId: Number(row.relationId || 0),
    }));
}

export { getClubCampaigns, getClubMaps, getClubMembers, getClubSummary };
