import { parseJsonSafe } from "../../../shared/valueUtils.js";
import { buildPendingTotdSnapshot } from "../cotdModel.js";
import {
  JOIN_FROM,
  JOIN_SELECT,
  asText,
  cotdFromRows,
  dayIdFor,
  mapFileFromRow,
  mapInfoFromRow,
  snapshotIdFor,
  utcNowIso,
} from "./mappers.js";

function enrichSnapshot(snapshot, row) {
  const mapInfo = mapInfoFromRow(row);
  const mapFile = mapFileFromRow(row);
  const enriched = JSON.parse(JSON.stringify(snapshot));
  enriched.cotd = { ...(enriched.cotd || {}), ...cotdFromRows(row, mapInfo) };
  if (mapInfo) enriched.mapInfo = mapInfo;
  if (mapFile) enriched.mapFile = mapFile;
  return enriched;
}

function buildPendingSnapshot(row) {
  const mapInfo = mapInfoFromRow(row);
  const mapFile = mapFileFromRow(row);
  const snapshot = buildPendingTotdSnapshot({
    id: snapshotIdFor(row.day_cotd_date, row.day_map_uid),
    cotd: cotdFromRows(row, mapInfo),
    evidenceSummary: {
      source: "nadeo",
      recordCount: 0,
      replayCount: 0,
      signals: [
        {
          label: "TOTD schedule",
          value: row.day_campaign_id
            ? `Campaign ${row.day_campaign_id}`
            : "Stored from Nadeo monthly campaign endpoint.",
          weight: null,
        },
        {
          label: "Map info",
          value: mapInfo ? "Nadeo Core map metadata stored." : "Waiting for Nadeo Core map metadata.",
          weight: null,
        },
        {
          label: "Map file",
          value: mapFile?.downloaded ? "GBX file downloaded." : "Waiting for GBX download.",
          weight: null,
        },
      ],
    },
    warnings: [
      "Classifier styles are pending for this TOTD map.",
      mapInfo ? "" : "Nadeo Core map info has not been downloaded yet.",
      mapFile?.downloaded ? "" : "Map file has not been downloaded yet.",
    ].filter(Boolean),
  });
  if (mapInfo) snapshot.mapInfo = mapInfo;
  if (mapFile) snapshot.mapFile = mapFile;
  return snapshot;
}

function rowToSnapshot(row) {
  if (!row) return null;
  const storedSnapshot = parseJsonSafe(row.snapshot_payload_json, null);
  return storedSnapshot ? enrichSnapshot(storedSnapshot, row) : buildPendingSnapshot(row);
}

function getLatest(repository) {
  const row =
    repository.db
      .prepare(
        `
          SELECT ${JOIN_SELECT}
          ${JOIN_FROM}
          ORDER BY COALESCE(d.start_timestamp, 0) DESC, d.cotd_date DESC, d.updated_at DESC
          LIMIT 1
        `
      )
      .get() || null;
  return row ? rowToSnapshot(row) : getLatestStoredSnapshot(repository);
}

function getLatestStoredSnapshot(repository) {
  const row =
    repository.db
      .prepare(
        `SELECT payload_json
           FROM style_snapshots
          ORDER BY updated_at DESC, generated_at DESC
          LIMIT 1`
      )
      .get() || null;
  return parseJsonSafe(row?.payload_json, null);
}

function listHistory(repository, { limit = 30, offset = 0 } = {}) {
  const totdPage = repository.listTotdMaps({ limit, offset });
  if (totdPage.total > 0) return totdPage;

  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 30)));
  const safeOffset = Math.max(0, Math.min(repository.maxOffset, Math.floor(Number(offset) || 0)));
  const rows =
    repository.db
      .prepare(
        `SELECT payload_json
           FROM style_snapshots
          ORDER BY updated_at DESC, generated_at DESC
          LIMIT ? OFFSET ?`
      )
      .all(safeLimit, safeOffset) || [];
  const total = Number(repository.db.prepare("SELECT COUNT(*) AS count FROM style_snapshots").get()?.count || 0);
  return {
    items: rows.map((row) => parseJsonSafe(row.payload_json, null)).filter(Boolean),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function upsertSnapshot(repository, snapshot) {
  const nowIso = utcNowIso();
  const cotd = snapshot?.cotd || {};
  const cotdDate = asText(cotd.cotdDate, nowIso.slice(0, 10));
  const mapUid = asText(cotd.mapUid, "unknown-map");
  const snapshotId = asText(snapshot?.id, snapshotIdFor(cotdDate, mapUid));
  const payload = {
    ...snapshot,
    id: snapshotId,
    cotd: { ...cotd, cotdDate, mapUid },
    updatedAt: snapshot?.updatedAt || nowIso,
  };

  repository.upsertTotdDays([
    {
      id: dayIdFor({ cotdDate, mapUid }),
      cotdDate,
      mapUid,
      campaignId: cotd.competitionId,
      startAt: cotd.startedAt,
      endAt: cotd.endedAt,
      raw: { source: "style_snapshot", snapshotId },
    },
  ]);

  if (cotd.thumbnailUrl || cotd.trackId || cotd.mapName) {
    repository.upsertMapInfos([
      {
        mapUid,
        mapId: cotd.trackId,
        name: cotd.mapName,
        author: cotd.authorAccountId,
        thumbnailUrl: cotd.thumbnailUrl,
      },
    ]);
  }

  repository.db
    .prepare(
      `INSERT INTO style_snapshots (
         id, cotd_date, map_uid, source, status, payload_json, generated_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         cotd_date = excluded.cotd_date,
         map_uid = excluded.map_uid,
         source = excluded.source,
         status = excluded.status,
         payload_json = excluded.payload_json,
         generated_at = excluded.generated_at,
         updated_at = excluded.updated_at`
    )
    .run(
      snapshotId,
      cotdDate,
      mapUid,
      asText(payload.source, "manual"),
      asText(payload.status, "classified"),
      JSON.stringify(payload),
      asText(payload.generatedAt, nowIso),
      asText(payload.updatedAt, nowIso)
    );

  return getSnapshotByDateAndUid(repository, cotdDate, mapUid) || payload;
}

function getSnapshotByDateAndUid(repository, cotdDate, mapUid) {
  const row =
    repository.db
      .prepare(
        `SELECT ${JOIN_SELECT}
         ${JOIN_FROM}
         WHERE d.cotd_date = ? AND d.map_uid = ?
         LIMIT 1`
      )
      .get(cotdDate, mapUid) || null;
  return rowToSnapshot(row);
}

export {
  buildPendingSnapshot,
  enrichSnapshot,
  getLatest,
  getLatestStoredSnapshot,
  getSnapshotByDateAndUid,
  listHistory,
  rowToSnapshot,
  upsertSnapshot,
};
