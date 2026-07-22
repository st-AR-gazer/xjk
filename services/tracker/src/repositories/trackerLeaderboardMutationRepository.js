import { clampInt, normalizeAccountId } from "../../../shared/valueUtils.js";
import { normalizeIso } from "./trackerRepositorySupport.js";

class TrackerLeaderboardMutationRepository {
  constructor({ db, mapQueryRepository }) {
    this.db = db;
    this.mapQueryRepository = mapQueryRepository;
  }

  insertWrEvent({
    mapUid,
    accountId,
    displayName,
    recordTime,
    timestamp,
    replayUrl = "",
    zoneId = "world",
    zoneName = "World",
    position = 1,
  }) {
    const now = timestamp || new Date().toISOString();
    const map = this.mapQueryRepository.getMapByUid(mapUid);
    if (!map) return null;

    try {
      this.db.exec("BEGIN");
      this.db
        .prepare(
          `
          INSERT INTO wr_history (
            map_uid, account_id, display_name, record_time, medal, replay_url, replay_local_path,
            timestamp, removed, zone_id, zone_name, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          mapUid,
          accountId,
          displayName,
          Math.max(1, Math.floor(recordTime)),
          1,
          replayUrl,
          "",
          now,
          0,
          zoneId,
          zoneName,
          position
        );

      this.db
        .prepare(
          `
          INSERT INTO leaderboards (
            map_uid, account_id, display_name, score, ranking, timestamp, zone_id, zone_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(mapUid, accountId, displayName, Math.max(1, Math.floor(recordTime)), position, now, zoneId, zoneName);

      this.db
        .prepare(
          `
          UPDATE maps
          SET
            wr_account_id = ?,
            wr_display_name = ?,
            wr_time = ?,
            wr_updated_at = ?,
            last_checked_at = ?,
            updated_at = ?
          WHERE map_uid = ?
          `
        )
        .run(accountId, displayName, Math.max(1, Math.floor(recordTime)), now, now, now, mapUid);
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      uid: mapUid,
      name: map.name,
      campaign: this.mapQueryRepository.getMapInfo(mapUid)?.map?.campaign || "Unassigned",
      wrMs: Math.max(1, Math.floor(recordTime)),
      accountId: normalizeAccountId(accountId) || null,
      holder: displayName,
      at: now,
    };
  }

  replaceLeaderboardSnapshot({ mapUid, entries = [], checkedAt, source = "tracker", note = "" } = {}) {
    const uid = String(mapUid || "").trim();
    if (!uid) return null;

    const normalizedEntries = Array.isArray(entries)
      ? entries
          .map((entry, index) => {
            const score = clampInt(entry?.score ?? entry?.wrMs, {
              min: 0,
              max: 2147483647,
              fallback: 0,
            });
            if (score <= 0) return null;
            const ranking = clampInt(entry?.ranking ?? entry?.position ?? index + 1, {
              min: 1,
              max: 100000,
              fallback: index + 1,
            });
            const accountId = normalizeAccountId(entry?.accountId ?? entry?.account_id);
            const displayName = String(
              entry?.displayName ?? entry?.display_name ?? entry?.name ?? accountId ?? ""
            ).trim();
            return {
              accountId: accountId || null,
              displayName: displayName || "Unknown",
              score,
              ranking,
              timestamp: normalizeIso(entry?.recordedAt ?? entry?.timestamp, checkedAt) || checkedAt,
              zoneId: String(entry?.zoneId ?? entry?.zone_id ?? "world").trim() || "world",
              zoneName: String(entry?.zoneName ?? entry?.zone_name ?? "World").trim() || "World",
            };
          })
          .filter(Boolean)
      : [];

    const now = normalizeIso(checkedAt, new Date().toISOString()) || new Date().toISOString();
    const top = normalizedEntries.length > 0 ? normalizedEntries[0] : null;

    try {
      this.db.exec("BEGIN");
      this.db.prepare("DELETE FROM leaderboards WHERE map_uid = ?").run(uid);
      const insertLeaderboard = this.db.prepare(
        `
        INSERT INTO leaderboards (
          map_uid, account_id, display_name, score, ranking, timestamp, zone_id, zone_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );
      for (const entry of normalizedEntries) {
        insertLeaderboard.run(
          uid,
          entry.accountId,
          entry.displayName,
          entry.score,
          entry.ranking,
          entry.timestamp,
          entry.zoneId,
          entry.zoneName
        );
      }

      if (top) {
        this.db
          .prepare(
            `
            UPDATE maps
            SET
              wr_account_id = ?,
              wr_display_name = ?,
              wr_time = ?,
              wr_updated_at = ?,
              last_checked_at = ?,
              updated_at = ?
            WHERE map_uid = ?
            `
          )
          .run(top.accountId, top.displayName, top.score, now, now, now, uid);
      } else {
        this.db
          .prepare(
            `
            UPDATE maps
            SET
              last_checked_at = ?,
              updated_at = ?
            WHERE map_uid = ?
            `
          )
          .run(now, now, uid);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      mapUid: uid,
      checkedAt: now,
      source: String(source || ""),
      note: String(note || ""),
      entries: normalizedEntries.length,
      top:
        top && top.score > 0
          ? {
              accountId: top.accountId,
              displayName: top.displayName,
              score: top.score,
              ranking: top.ranking,
              timestamp: top.timestamp,
            }
          : null,
    };
  }
}

export { TrackerLeaderboardMutationRepository };
