import { sanitizeResolvedDisplayName } from "../../../shared/displayNameResolution.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";
import { normalizeIso } from "./trackerRepositorySupport.js";

class TrackerPlayerRepository {
  constructor(db) {
    this.db = db;
  }

  bulkUpsertPlayerNames({ players = [], source = "external-sync" } = {}) {
    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "external-sync";
    const normalized = [];
    const seen = new Set();
    for (const item of Array.isArray(players) ? players : []) {
      const accountId = normalizeAccountId(item?.accountId ?? item?.account_id ?? item?.id);
      const displayName = sanitizeResolvedDisplayName(item?.displayName ?? item?.display_name ?? item?.name ?? "", {
        accountId,
      });
      if (!accountId || !displayName) continue;
      if (seen.has(accountId)) continue;
      seen.add(accountId);
      normalized.push({
        accountId,
        displayName,
        observedAt: normalizeIso(item?.observedAt ?? item?.observed_at, now) || now,
      });
    }

    if (!normalized.length) {
      return {
        playersSeen: 0,
        namesUpdated: 0,
        historyInserted: 0,
        mapsUpdated: 0,
        leaderboardRowsUpdated: 0,
        wrHistoryRowsUpdated: 0,
      };
    }

    const selectProfileStmt = this.db.prepare(
      `
      SELECT latest_display_name AS latestDisplayName
      FROM player_profiles
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const upsertProfileStmt = this.db.prepare(
      `
      INSERT INTO player_profiles (
        account_id,
        latest_display_name,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_source,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_display_name = COALESCE(NULLIF(excluded.latest_display_name, ''), player_profiles.latest_display_name),
        last_seen_at = excluded.last_seen_at,
        last_resolved_at = COALESCE(excluded.last_resolved_at, player_profiles.last_resolved_at),
        last_source = COALESCE(NULLIF(excluded.last_source, ''), player_profiles.last_source),
        updated_at = excluded.updated_at
      `
    );
    const insertHistoryStmt = this.db.prepare(
      `
      INSERT OR IGNORE INTO player_name_history (
        account_id,
        display_name,
        observed_at,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
      `
    );
    const updateMapsStmt = this.db.prepare(
      `
      UPDATE maps
      SET
        wr_display_name = ?,
        updated_at = ?
      WHERE
        LOWER(COALESCE(wr_account_id, '')) = ?
        AND COALESCE(wr_display_name, '') <> ?
      `
    );
    const updateLeaderboardsStmt = this.db.prepare(
      `
      UPDATE leaderboards
      SET display_name = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND COALESCE(display_name, '') <> ?
      `
    );
    const updateWrHistoryStmt = this.db.prepare(
      `
      UPDATE wr_history
      SET display_name = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND COALESCE(display_name, '') <> ?
      `
    );

    let namesUpdated = 0;
    let historyInserted = 0;
    let mapsUpdated = 0;
    let leaderboardRowsUpdated = 0;
    let wrHistoryRowsUpdated = 0;

    try {
      this.db.exec("BEGIN");
      for (const entry of normalized) {
        const existing = selectProfileStmt.get(entry.accountId);
        upsertProfileStmt.run(entry.accountId, entry.displayName, now, now, entry.observedAt, safeSource, now);
        if (String(existing?.latestDisplayName || "") !== entry.displayName) {
          namesUpdated += 1;
        }
        const historyResult = insertHistoryStmt.run(
          entry.accountId,
          entry.displayName,
          entry.observedAt,
          safeSource,
          now
        );
        historyInserted += Number(historyResult?.changes || 0);
        mapsUpdated += Number(
          updateMapsStmt.run(entry.displayName, now, entry.accountId, entry.displayName)?.changes || 0
        );
        leaderboardRowsUpdated += Number(
          updateLeaderboardsStmt.run(entry.displayName, entry.accountId, entry.displayName)?.changes || 0
        );
        wrHistoryRowsUpdated += Number(
          updateWrHistoryStmt.run(entry.displayName, entry.accountId, entry.displayName)?.changes || 0
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to upsert player names.",
        playersSeen: normalized.length,
        namesUpdated,
        historyInserted,
        mapsUpdated,
        leaderboardRowsUpdated,
        wrHistoryRowsUpdated,
      };
    }

    return {
      playersSeen: normalized.length,
      namesUpdated,
      historyInserted,
      mapsUpdated,
      leaderboardRowsUpdated,
      wrHistoryRowsUpdated,
    };
  }

  getPlayerNamesByAccountIds({ accountIds = [], limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const normalized = [];
    const seen = new Set();
    for (const rawAccountId of Array.isArray(accountIds) ? accountIds : []) {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      normalized.push(accountId);
      if (normalized.length >= safeLimit) break;
    }
    if (!normalized.length) {
      return {
        requested: 0,
        found: 0,
        namesByAccountId: {},
        profiles: [],
      };
    }

    const placeholders = normalized.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          p.account_id AS accountId,
          p.latest_display_name AS displayName,
          p.last_resolved_at AS lastResolvedAt,
          p.last_source AS lastSource,
          p.updated_at AS updatedAt
        FROM player_profiles p
        WHERE p.account_id IN (${placeholders})
        `
      )
      .all(...normalized);

    const namesByAccountId = {};
    const profiles = rows
      .map((row) => {
        const accountId = normalizeAccountId(row.accountId);
        const displayName = sanitizeResolvedDisplayName(row.displayName, { accountId });
        if (accountId && displayName) {
          namesByAccountId[accountId] = displayName;
        }
        return {
          accountId,
          displayName: displayName || null,
          lastResolvedAt: normalizeIso(row.lastResolvedAt, null),
          lastSource: String(row.lastSource || "").trim() || null,
          updatedAt: normalizeIso(row.updatedAt, null),
        };
      })
      .filter((row) => row.accountId);

    return {
      requested: normalized.length,
      found: Object.keys(namesByAccountId).length,
      namesByAccountId,
      profiles,
    };
  }
}

export { TrackerPlayerRepository };
