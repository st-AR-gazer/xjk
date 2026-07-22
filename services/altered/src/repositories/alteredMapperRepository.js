import {
  hasResolvedDisplayName,
  sanitizeResolvedDisplayName,
  clampInt,
  normalizeAccountId,
  parseJsonSafe,
  serializeJson,
  toNullableIso,
  toText,
  uniqueBy,
} from "./alteredRepositorySupport.js";

class AlteredMapperRepository {
  constructor(db) {
    this.db = db;
  }

  upsertMapperNames({ accountIds = [], namesByAccountId = {}, source = "trackmania-oauth" } = {}) {
    const normalizedAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : []).map((accountId) => normalizeAccountId(accountId)).filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return {
        accountsSeen: 0,
        namesResolved: 0,
        namesUpdated: 0,
        historyInserted: 0,
      };
    }

    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "trackmania-oauth";
    const selectStmt = this.db.prepare(
      `
      SELECT latest_display_name AS latestDisplayName
      FROM altered_mapper_accounts
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const accountUpsertStmt = this.db.prepare(
      `
      INSERT INTO altered_mapper_accounts (
        account_id,
        latest_display_name,
        latest_source,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_resolution_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_display_name = COALESCE(NULLIF(excluded.latest_display_name, ''), altered_mapper_accounts.latest_display_name),
        latest_source = COALESCE(NULLIF(excluded.latest_source, ''), altered_mapper_accounts.latest_source),
        last_seen_at = excluded.last_seen_at,
        last_resolved_at = COALESCE(excluded.last_resolved_at, altered_mapper_accounts.last_resolved_at),
        last_resolution_error = excluded.last_resolution_error,
        updated_at = excluded.updated_at
      `
    );
    const historyInsertStmt = this.db.prepare(
      `
      INSERT OR IGNORE INTO altered_mapper_name_history (
        account_id,
        display_name,
        observed_at,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
      `
    );

    const namesMap = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};

    let namesResolved = 0;
    let namesUpdated = 0;
    let historyInserted = 0;

    try {
      this.db.exec("BEGIN");
      for (const accountId of normalizedAccountIds) {
        const existing = selectStmt.get(accountId);
        const displayName = sanitizeResolvedDisplayName(namesMap[accountId], { accountId });
        const hasDisplayName = Boolean(displayName);
        if (hasDisplayName) namesResolved += 1;

        accountUpsertStmt.run(
          accountId,
          hasDisplayName ? displayName : null,
          hasDisplayName ? safeSource : null,
          now,
          now,
          hasDisplayName ? now : null,
          hasDisplayName ? null : "display-name-not-resolved",
          now,
          now
        );

        if (hasDisplayName && String(existing?.latestDisplayName || "") !== displayName) {
          namesUpdated += 1;
        }

        if (hasDisplayName) {
          const result = historyInsertStmt.run(accountId, displayName, now, safeSource, now);
          if (Number(result?.changes || 0) > 0) historyInserted += 1;
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return { error: error?.message || "Failed to upsert mapper names." };
    }

    return {
      accountsSeen: normalizedAccountIds.length,
      namesResolved,
      namesUpdated,
      historyInserted,
    };
  }

  updateMapMapperDisplayNames({ namesByAccountId = {} } = {}) {
    const entries = Object.entries(namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {})
      .map(([rawAccountId, rawDisplayName]) => ({
        accountId: normalizeAccountId(rawAccountId),
        displayName: sanitizeResolvedDisplayName(rawDisplayName, {
          accountId: normalizeAccountId(rawAccountId),
        }),
      }))
      .filter((entry) => entry.accountId && entry.displayName);
    if (!entries.length) return { updated: 0 };

    const updateAuthorStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        author_display_name = ?,
        updated_at = ?
      WHERE LOWER(COALESCE(author, '')) = ?
      `
    );
    const updateSubmitterStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        submitter_display_name = ?,
        updated_at = ?
      WHERE LOWER(COALESCE(submitter, '')) = ?
      `
    );
    const updateWrHolderStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET
        wr_holder = ?,
        updated_at = ?
      WHERE
        LOWER(COALESCE(wr_holder, '')) = ?
        AND COALESCE(wr_holder, '') <> ?
      `
    );
    const updateWrEventHolderStmt = this.db.prepare(
      `
      UPDATE altered_wr_events
      SET holder = ?
      WHERE
        LOWER(COALESCE(account_id, '')) = ?
        AND LOWER(COALESCE(holder, '')) = ?
        AND COALESCE(holder, '') <> ?
      `
    );

    let updated = 0;
    const now = new Date().toISOString();
    try {
      this.db.exec("BEGIN");
      for (const entry of entries) {
        const authorResult = updateAuthorStmt.run(entry.displayName, now, entry.accountId);
        updated += Number(authorResult?.changes || 0);
        const submitterResult = updateSubmitterStmt.run(entry.displayName, now, entry.accountId);
        updated += Number(submitterResult?.changes || 0);
        const wrHolderResult = updateWrHolderStmt.run(entry.displayName, now, entry.accountId, entry.displayName);
        updated += Number(wrHolderResult?.changes || 0);
        const wrEventHolderResult = updateWrEventHolderStmt.run(
          entry.displayName,
          entry.accountId,
          entry.accountId,
          entry.displayName
        );
        updated += Number(wrEventHolderResult?.changes || 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to apply resolved display names to altered storage.",
        updated,
      };
    }

    return { updated };
  }

  updateMapSavedDisplayNames({ namesByMapUid = {} } = {}) {
    const entries = Object.entries(namesByMapUid && typeof namesByMapUid === "object" ? namesByMapUid : {})
      .map(([rawMapUid, rawValue]) => {
        const value = rawValue && typeof rawValue === "object" ? rawValue : {};
        const mapUid = toText(rawMapUid);
        return {
          mapUid,
          authorSavedDisplayName: sanitizeResolvedDisplayName(
            value.authorSavedDisplayName ?? value.author_saved_display_name ?? value.authorNickname,
            { accountId: value.authorAccountId || "" }
          ),
          submitterSavedDisplayName: sanitizeResolvedDisplayName(
            value.submitterSavedDisplayName ?? value.submitter_saved_display_name ?? "",
            { accountId: value.submitterAccountId || "" }
          ),
        };
      })
      .filter((entry) => entry.mapUid && (entry.authorSavedDisplayName || entry.submitterSavedDisplayName));
    if (!entries.length) return { updated: 0 };

    const readStmt = this.db.prepare(
      "SELECT payload_json AS payloadJson FROM altered_maps WHERE LOWER(map_uid) = LOWER(?) LIMIT 1"
    );
    const updateStmt = this.db.prepare(
      `
      UPDATE altered_maps
      SET payload_json = ?, updated_at = ?
      WHERE LOWER(map_uid) = LOWER(?)
      `
    );

    let updated = 0;
    const now = new Date().toISOString();
    try {
      this.db.exec("BEGIN");
      for (const entry of entries) {
        const existing = readStmt.get(entry.mapUid);
        if (!existing) continue;
        const payload = parseJsonSafe(existing.payloadJson, {}) || {};
        const nextPayload = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
        if (entry.authorSavedDisplayName) {
          nextPayload.authorSavedDisplayName = entry.authorSavedDisplayName;
          nextPayload.authorNickname = entry.authorSavedDisplayName;
        }
        if (entry.submitterSavedDisplayName) {
          nextPayload.submitterSavedDisplayName = entry.submitterSavedDisplayName;
          nextPayload.submitterNickname = entry.submitterSavedDisplayName;
        }
        const result = updateStmt.run(serializeJson(nextPayload), now, entry.mapUid);
        updated += Number(result?.changes || 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to update saved mapper display names.",
        updated,
      };
    }

    return { updated };
  }

  listKnownMapperAccountIds({ limit = 50000 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 250000, fallback: 50000 });
    const rows = this.db
      .prepare(
        `
        SELECT account_id AS accountId FROM altered_mapper_accounts
        UNION
        SELECT LOWER(TRIM(author)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(author, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(submitter)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(submitter, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(wr_holder)) AS accountId
        FROM altered_maps
        WHERE NULLIF(TRIM(COALESCE(wr_holder, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(account_id)) AS accountId
        FROM altered_club_members
        WHERE NULLIF(TRIM(COALESCE(account_id, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(author_account_id)) AS accountId
        FROM altered_club_activities
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        UNION
        SELECT LOWER(TRIM(author_account_id)) AS accountId
        FROM altered_upload_maps
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        LIMIT ?
        `
      )
      .all(safeLimit);

    return uniqueBy(rows.map((row) => normalizeAccountId(row?.accountId)).filter(Boolean), (accountId) => accountId);
  }

  seedMapperAccounts({ accountIds = [], source = "seed" } = {}) {
    const normalizedAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : []).map((accountId) => normalizeAccountId(accountId)).filter(Boolean),
      (accountId) => accountId
    );
    if (!normalizedAccountIds.length) {
      return { accountsSeen: 0, inserted: 0, updated: 0 };
    }

    const now = new Date().toISOString();
    const safeSource = String(source || "").trim() || "seed";
    const existsStmt = this.db.prepare(
      `
      SELECT 1 AS present
      FROM altered_mapper_accounts
      WHERE account_id = ?
      LIMIT 1
      `
    );
    const upsertStmt = this.db.prepare(
      `
      INSERT INTO altered_mapper_accounts (
        account_id,
        latest_display_name,
        latest_source,
        first_seen_at,
        last_seen_at,
        last_resolved_at,
        last_resolution_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        latest_source = COALESCE(NULLIF(altered_mapper_accounts.latest_source, ''), excluded.latest_source),
        last_seen_at = excluded.last_seen_at
      `
    );

    let inserted = 0;
    let updated = 0;
    try {
      this.db.exec("BEGIN");
      for (const accountId of normalizedAccountIds) {
        const existed = Boolean(existsStmt.get(accountId));
        upsertStmt.run(accountId, null, safeSource, now, now, null, null, now, now);
        if (existed) updated += 1;
        else inserted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      return {
        error: error?.message || "Failed to seed mapper accounts.",
        accountsSeen: normalizedAccountIds.length,
        inserted,
        updated,
      };
    }

    return {
      accountsSeen: normalizedAccountIds.length,
      inserted,
      updated,
    };
  }

  getMapperAccountStats() {
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id AS accountId,
          latest_display_name AS latestDisplayName,
          last_resolved_at AS lastResolvedAt
        FROM altered_mapper_accounts
        `
      )
      .all();

    let unresolvedAccounts = 0;
    let neverResolvedAccounts = 0;
    let latestResolvedAtMs = 0;
    let oldestResolvedAtMs = 0;
    for (const row of rows) {
      const accountId = normalizeAccountId(row?.accountId);
      const hasDisplayName = hasResolvedDisplayName(row?.latestDisplayName, { accountId });
      if (!hasDisplayName) unresolvedAccounts += 1;
      const resolvedAt = toNullableIso(row?.lastResolvedAt) || null;
      if (!resolvedAt) {
        neverResolvedAccounts += 1;
        continue;
      }
      const resolvedAtMs = Date.parse(resolvedAt);
      if (!Number.isFinite(resolvedAtMs)) continue;
      latestResolvedAtMs = Math.max(latestResolvedAtMs, resolvedAtMs);
      oldestResolvedAtMs = oldestResolvedAtMs > 0 ? Math.min(oldestResolvedAtMs, resolvedAtMs) : resolvedAtMs;
    }

    return {
      totalAccounts: Number(rows.length || 0),
      unresolvedAccounts,
      neverResolvedAccounts,
      latestResolvedAt: latestResolvedAtMs > 0 ? new Date(latestResolvedAtMs).toISOString() : null,
      oldestResolvedAt: oldestResolvedAtMs > 0 ? new Date(oldestResolvedAtMs).toISOString() : null,
    };
  }

  getMapperAccountsForSync({ limit = 50, accountIds = [], minResolvedAgeSeconds = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 5000, fallback: 50 });
    const safeMinResolvedAgeSeconds = clampInt(minResolvedAgeSeconds, {
      min: 0,
      max: 30 * 24 * 60 * 60,
      fallback: 0,
    });
    const filteredAccountIds = uniqueBy(
      (Array.isArray(accountIds) ? accountIds : []).map((accountId) => normalizeAccountId(accountId)).filter(Boolean),
      (accountId) => accountId
    );
    const params = [];
    let whereClause = "";
    if (filteredAccountIds.length) {
      const placeholders = filteredAccountIds.map(() => "?").join(", ");
      whereClause = `WHERE account_id IN (${placeholders})`;
      params.push(...filteredAccountIds);
    }

    const staleBeforeMs = safeMinResolvedAgeSeconds > 0 ? Date.now() - safeMinResolvedAgeSeconds * 1000 : 0;
    const rows = this.db
      .prepare(
        `
        SELECT
          account_id AS accountId,
          latest_display_name AS latestDisplayName,
          last_resolved_at AS lastResolvedAt,
          last_resolution_error AS lastResolutionError,
          updated_at AS updatedAt,
          first_seen_at AS firstSeenAt
        FROM altered_mapper_accounts
        ${whereClause}
        `
      )
      .all(...params);

    return rows
      .map((row) => ({
        accountId: normalizeAccountId(row.accountId),
        latestDisplayName:
          sanitizeResolvedDisplayName(row.latestDisplayName, {
            accountId: normalizeAccountId(row.accountId),
          }) || null,
        lastResolvedAt: toNullableIso(row.lastResolvedAt) || null,
        lastResolutionError: String(row.lastResolutionError || "").trim() || null,
        updatedAt: toNullableIso(row.updatedAt) || null,
        firstSeenAt: toNullableIso(row.firstSeenAt) || null,
      }))
      .filter((row) => {
        if (!row.accountId) return false;
        if (!safeMinResolvedAgeSeconds) return true;
        if (!row.latestDisplayName) return true;
        const resolvedAtMs = Date.parse(String(row.lastResolvedAt || ""));
        return !Number.isFinite(resolvedAtMs) || resolvedAtMs <= staleBeforeMs;
      })
      .sort((a, b) => {
        const aResolved = a.latestDisplayName ? 1 : 0;
        const bResolved = b.latestDisplayName ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        const aSeenAt = Date.parse(String(a.lastResolvedAt || a.updatedAt || a.firstSeenAt || "")) || 0;
        const bSeenAt = Date.parse(String(b.lastResolvedAt || b.updatedAt || b.firstSeenAt || "")) || 0;
        if (aSeenAt !== bSeenAt) return aSeenAt - bSeenAt;
        return String(a.accountId || "").localeCompare(String(b.accountId || ""));
      })
      .slice(0, safeLimit)
      .map(({ firstSeenAt: _firstSeenAt, ...row }) => row);
  }
}

export { AlteredMapperRepository };
