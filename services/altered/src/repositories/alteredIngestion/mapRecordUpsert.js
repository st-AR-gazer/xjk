import {
  clampInt,
  parseJsonSafe,
  serializeJson,
  toNullableIso,
  toText,
  utcNowIso,
  normalizeStatus,
} from "../alteredRepositorySupport.js";

const MAP_UPSERT_SQL = `
  INSERT INTO altered_maps (
    map_uid, map_id, name, map_type, map_style, map_environment, author, author_display_name, submitter, submitter_display_name,
    author_time, gold_time, silver_time, bronze_time, nb_laps,
    thumbnail_url, download_url, player_count, player_count_updated_at, wr_ms, wr_holder, wr_updated_at,
    tracked, status, check_frequency, last_checked_at,
    map_created_at, map_updated_at, payload_json, monitor_updated_at,
    created_at, updated_at, last_synced_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?
  )
  ON CONFLICT(map_uid) DO UPDATE SET
    map_id = excluded.map_id,
    name = excluded.name,
    map_type = excluded.map_type,
    map_style = excluded.map_style,
    map_environment = excluded.map_environment,
    author = excluded.author,
    author_display_name = COALESCE(NULLIF(excluded.author_display_name, ''), altered_maps.author_display_name),
    submitter = excluded.submitter,
    submitter_display_name = COALESCE(NULLIF(excluded.submitter_display_name, ''), altered_maps.submitter_display_name),
    author_time = excluded.author_time,
    gold_time = excluded.gold_time,
    silver_time = excluded.silver_time,
    bronze_time = excluded.bronze_time,
    nb_laps = excluded.nb_laps,
    thumbnail_url = excluded.thumbnail_url,
    download_url = excluded.download_url,
    player_count = excluded.player_count,
    player_count_updated_at = excluded.player_count_updated_at,
    wr_ms = excluded.wr_ms,
    wr_holder = excluded.wr_holder,
    wr_updated_at = excluded.wr_updated_at,
    tracked = excluded.tracked,
    status = excluded.status,
    check_frequency = excluded.check_frequency,
    last_checked_at = COALESCE(excluded.last_checked_at, altered_maps.last_checked_at),
    map_created_at = COALESCE(excluded.map_created_at, altered_maps.map_created_at),
    map_updated_at = COALESCE(excluded.map_updated_at, altered_maps.map_updated_at),
    payload_json = COALESCE(excluded.payload_json, altered_maps.payload_json),
    monitor_updated_at = excluded.monitor_updated_at,
    updated_at = excluded.updated_at,
    last_synced_at = excluded.last_synced_at
`;

function mergeMapPayload(existingPayloadJson, rawPayload, mergeExistingPayload) {
  if (!mergeExistingPayload) return rawPayload;
  const existingPayload = parseJsonSafe(existingPayloadJson, null);
  return existingPayload &&
    typeof existingPayload === "object" &&
    !Array.isArray(existingPayload) &&
    rawPayload &&
    typeof rawPayload === "object" &&
    !Array.isArray(rawPayload)
    ? { ...existingPayload, ...rawPayload }
    : rawPayload;
}

function resolveTrackingSettings(map, existing, trackedDefault) {
  const payloadTracked = typeof map.tracked === "boolean" ? map.tracked : null;
  const tracked =
    payloadTracked === null ? (existing ? Boolean(existing.tracked) : Boolean(trackedDefault)) : payloadTracked;
  return {
    tracked,
    status: normalizeStatus(
      map.status,
      tracked ? existing?.status || "live" : existing ? existing.status || "paused" : "paused"
    ),
    checkFrequency: clampInt(map.checkFrequency ?? map.check_frequency, {
      min: 120,
      max: 604800,
      fallback: clampInt(existing?.checkFrequency, {
        min: 120,
        max: 604800,
        fallback: 21600,
      }),
    }),
  };
}

function createMapRecordUpserter({
  db,
  counters,
  touchedMapUids,
  trackedDefault = false,
  mergeExistingPayload = false,
}) {
  const selectExistingMapStmt = db.prepare(
    `
    SELECT
      tracked,
      status,
      check_frequency AS checkFrequency,
      wr_ms AS wrMs,
      wr_holder AS wrHolder,
      player_count AS playerCount,
      payload_json AS payloadJson
    FROM altered_maps
    WHERE map_uid = ?
    LIMIT 1
    `
  );
  const upsertMapStmt = db.prepare(MAP_UPSERT_SQL);

  return function upsertMapRecord(map = {}, { payload = null } = {}) {
    const mapUid = toText(map?.uid || map?.mapUid || map?.map_uid);
    if (!mapUid) return null;

    counters.mapsSeen += 1;
    touchedMapUids.add(mapUid);

    const existing = selectExistingMapStmt.get(mapUid);
    const now = utcNowIso();
    const { tracked, status, checkFrequency } = resolveTrackingSettings(map, existing, trackedDefault);
    const wrMs = clampInt(map.wrMs ?? map.wrTime ?? map.wr_time, {
      min: 0,
      max: 2147483647,
      fallback: clampInt(existing?.wrMs, { min: 0, max: 2147483647, fallback: 0 }),
    });
    const wrHolder = toText(map.wrHolder ?? map.wrDisplayName ?? map.wr_display_name ?? existing?.wrHolder) || null;
    const playerCount = clampInt(
      map.playerCount ??
        map.player_count ??
        map.nbPlayers ??
        map.nb_players ??
        map.playCount ??
        map.play_count ??
        map.playersCount ??
        map.players_count,
      {
        min: 0,
        max: 2147483647,
        fallback: clampInt(existing?.playerCount, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        }),
      }
    );
    const rawPayload = payload ?? map?.raw ?? map?.payload ?? map;
    const storedPayload = mergeMapPayload(existing?.payloadJson, rawPayload, mergeExistingPayload);

    upsertMapStmt.run(
      mapUid,
      toText(map.mapId || map.map_id || map.id, `map-${mapUid.toLowerCase()}`),
      toText(map.name || map.title, mapUid) || mapUid,
      toText(map.mapType ?? map.map_type ?? map.type) || null,
      toText(map.mapStyle ?? map.map_style ?? map.style) || null,
      toText(map.mapEnvironment ?? map.map_environment ?? map.environment ?? map.mood) || null,
      toText(map.author),
      toText(map.authorDisplayName ?? map.author_display_name ?? map.authorName ?? map.author_name),
      toText(map.submitter),
      toText(map.submitterDisplayName ?? map.submitter_display_name ?? map.submitterName ?? map.submitter_name),
      clampInt(map.authorMs ?? map.authorTime ?? map.author_time, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      clampInt(map.goldMs ?? map.goldTime ?? map.gold_time, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      clampInt(map.silverMs ?? map.silverTime ?? map.silver_time, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      clampInt(map.bronzeMs ?? map.bronzeTime ?? map.bronze_time, {
        min: 0,
        max: 2147483647,
        fallback: 0,
      }),
      clampInt(map.nbLaps ?? map.nb_laps, {
        min: 1,
        max: 64,
        fallback: 1,
      }),
      toText(map.thumbnailUrl ?? map.thumbnail_url),
      toText(map.downloadUrl ?? map.download_url),
      playerCount,
      now,
      wrMs,
      wrHolder,
      wrMs > 0 ? now : null,
      tracked ? 1 : 0,
      status,
      checkFrequency,
      map.lastCheckedAt || map.last_checked_at || null,
      toNullableIso(map.mapCreatedAt ?? map.map_created_at ?? map.createdAt ?? map.created_at ?? map.uploadTimestamp),
      toNullableIso(map.mapUpdatedAt ?? map.map_updated_at ?? map.updatedAt ?? map.updated_at ?? map.updateTimestamp),
      serializeJson(storedPayload),
      now,
      now,
      now,
      now
    );

    if (existing) counters.mapsUpdated += 1;
    else counters.mapsInserted += 1;

    return {
      mapUid,
      now,
    };
  };
}

export { createMapRecordUpserter };
