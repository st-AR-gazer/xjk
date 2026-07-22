import { withSqliteTransaction } from "../../../shared/sqliteRuntime.js";
import { JOIN_FROM, JOIN_SELECT, asText, normalizeMapInfo, normalizeTotdDay, utcNowIso } from "./mappers.js";

function listTotdMaps(repository, { limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  const safeOffset = Math.max(0, Math.min(repository.maxOffset, Math.floor(Number(offset) || 0)));
  const rows =
    repository.db
      .prepare(
        `SELECT ${JOIN_SELECT}
         ${JOIN_FROM}
         ORDER BY COALESCE(d.start_timestamp, 0) DESC, d.cotd_date DESC, d.updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(safeLimit, safeOffset) || [];
  const total = Number(repository.db.prepare("SELECT COUNT(*) AS count FROM cotd_days").get()?.count || 0);
  return {
    items: rows.map((row) => repository.rowToSnapshot(row)).filter(Boolean),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function upsertTotdDays(repository, days = []) {
  const nowIso = utcNowIso();
  const statement = repository.db.prepare(
    `INSERT INTO cotd_days (
       id, cotd_date, year, month, day, month_day, campaign_id, map_uid, season_uid,
       leaderboard_group, start_timestamp, end_timestamp, start_at, end_at, raw_json,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       cotd_date = excluded.cotd_date,
       year = excluded.year,
       month = excluded.month,
       day = excluded.day,
       month_day = excluded.month_day,
       campaign_id = excluded.campaign_id,
       map_uid = excluded.map_uid,
       season_uid = excluded.season_uid,
       leaderboard_group = excluded.leaderboard_group,
       start_timestamp = excluded.start_timestamp,
       end_timestamp = excluded.end_timestamp,
       start_at = excluded.start_at,
       end_at = excluded.end_at,
       raw_json = excluded.raw_json,
       updated_at = excluded.updated_at`
  );

  return withSqliteTransaction(repository.db, () => {
    let stored = 0;
    for (const item of days) {
      const day = normalizeTotdDay(item);
      if (!day.mapUid) continue;
      statement.run(
        day.id,
        day.cotdDate,
        day.year,
        day.month,
        day.day,
        day.monthDay,
        day.campaignId,
        day.mapUid,
        day.seasonUid,
        day.leaderboardGroup,
        day.startTimestamp,
        day.endTimestamp,
        day.startAt,
        day.endAt,
        JSON.stringify(day.raw || item),
        nowIso,
        nowIso
      );
      stored += 1;
    }
    return stored;
  });
}

function upsertMapInfos(repository, mapInfos = []) {
  const nowIso = utcNowIso();
  const statement = repository.db.prepare(
    `INSERT INTO map_infos (
       map_uid, map_id, name, filename, author_account_id, submitter_account_id,
       author_score, bronze_score, silver_score, gold_score, collection_name,
       map_style, map_type, is_playable, has_clones, created_with_gamepad_editor,
       created_with_simple_editor, thumbnail_url, file_url, timestamp, raw_json,
       fetched_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(map_uid) DO UPDATE SET
       map_id = COALESCE(excluded.map_id, map_infos.map_id),
       name = COALESCE(excluded.name, map_infos.name),
       filename = COALESCE(excluded.filename, map_infos.filename),
       author_account_id = COALESCE(excluded.author_account_id, map_infos.author_account_id),
       submitter_account_id = COALESCE(excluded.submitter_account_id, map_infos.submitter_account_id),
       author_score = COALESCE(excluded.author_score, map_infos.author_score),
       bronze_score = COALESCE(excluded.bronze_score, map_infos.bronze_score),
       silver_score = COALESCE(excluded.silver_score, map_infos.silver_score),
       gold_score = COALESCE(excluded.gold_score, map_infos.gold_score),
       collection_name = COALESCE(excluded.collection_name, map_infos.collection_name),
       map_style = COALESCE(excluded.map_style, map_infos.map_style),
       map_type = COALESCE(excluded.map_type, map_infos.map_type),
       is_playable = COALESCE(excluded.is_playable, map_infos.is_playable),
       has_clones = COALESCE(excluded.has_clones, map_infos.has_clones),
       created_with_gamepad_editor = COALESCE(excluded.created_with_gamepad_editor, map_infos.created_with_gamepad_editor),
       created_with_simple_editor = COALESCE(excluded.created_with_simple_editor, map_infos.created_with_simple_editor),
       thumbnail_url = COALESCE(excluded.thumbnail_url, map_infos.thumbnail_url),
       file_url = COALESCE(excluded.file_url, map_infos.file_url),
       timestamp = COALESCE(excluded.timestamp, map_infos.timestamp),
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at,
       updated_at = excluded.updated_at`
  );

  let stored = 0;
  repository.db.exec("BEGIN IMMEDIATE;");
  try {
    for (const item of mapInfos) {
      const info = normalizeMapInfo(item);
      if (!info.mapUid) continue;
      statement.run(
        info.mapUid,
        info.mapId,
        info.name,
        info.filename,
        info.authorAccountId,
        info.submitterAccountId,
        info.authorScore,
        info.bronzeScore,
        info.silverScore,
        info.goldScore,
        info.collectionName,
        info.mapStyle,
        info.mapType,
        info.isPlayable,
        info.hasClones,
        info.createdWithGamepadEditor,
        info.createdWithSimpleEditor,
        info.thumbnailUrl,
        info.fileUrl,
        info.timestamp,
        JSON.stringify(info.raw || item),
        nowIso,
        nowIso
      );
      stored += 1;
    }
    repository.db.exec("COMMIT;");
  } catch (error) {
    repository.db.exec("ROLLBACK;");
    throw error;
  }
  return stored;
}

function listMapInfosByUids(repository, mapUids = []) {
  const uids = [...new Set(mapUids.map((value) => asText(value)).filter(Boolean))];
  if (!uids.length) return [];
  const placeholders = uids.map(() => "?").join(", ");
  return (
    repository.db
      .prepare(
        `SELECT map_uid AS mapUid, map_id AS mapId, name, filename,
                file_url AS fileUrl, thumbnail_url AS thumbnailUrl
           FROM map_infos
          WHERE map_uid IN (${placeholders})`
      )
      .all(...uids) || []
  );
}

export { listMapInfosByUids, listTotdMaps, upsertMapInfos, upsertTotdDays };
