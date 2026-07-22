import { normalizeDisplayNameQuery, sanitizeResolvedDisplayName } from "../../../../shared/displayNameResolution.js";
import { normalizeAccountId } from "../../../../shared/valueUtils.js";
import {
  computeDiceScore,
  FUZZY_SEARCH_ROW_LIMIT,
  normalizeArray,
  normalizeSearchMode,
} from "../support/repositoryValues.js";
import { runDisplayNamePersistenceOperation } from "./displayNamePersistenceError.js";

function isAgeStale(ageSeconds, maxAgeSeconds) {
  const maximumAge = Number(maxAgeSeconds || 0);
  return maximumAge > 0 ? Number(ageSeconds || 0) > maximumAge : false;
}

function mapDisplayNameRow(row, { accountId = row?.accountId || null, maxAgeSeconds = 0, missing = false } = {}) {
  const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
  const normalizedDisplayName = displayName
    ? String(row?.normalizedDisplayName || normalizeDisplayNameQuery(displayName))
    : null;
  return {
    accountId,
    displayName: displayName || null,
    normalizedDisplayName,
    source: row?.source || null,
    observedAt: displayName ? row?.observedAt || null : null,
    updatedAt: row?.updatedAt || null,
    ageSeconds: displayName ? Number(row?.ageSeconds || 0) : 0,
    stale: displayName ? isAgeStale(row?.ageSeconds, maxAgeSeconds) : true,
    missing: Boolean(missing) || !displayName,
  };
}

class DisplayNameQueryRepository {
  constructor(db) {
    this.db = db;
  }

  getDisplayNamesByName({ displayNames = [], maxAgeSeconds = 0 } = {}) {
    const names = normalizeArray(displayNames)
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    const queries = [...new Set(names)].map((displayName) => ({
      displayName,
      normalizedDisplayName: normalizeDisplayNameQuery(displayName),
      matches: [],
    }));
    const queriesByNormalizedName = new Map();
    for (const query of queries) {
      if (!queriesByNormalizedName.has(query.normalizedDisplayName)) {
        queriesByNormalizedName.set(query.normalizedDisplayName, []);
      }
      queriesByNormalizedName.get(query.normalizedDisplayName).push(query);
    }

    const normalizedNames = [...queriesByNormalizedName.keys()];
    if (normalizedNames.length > 0) {
      const placeholders = normalizedNames.map(() => "?").join(",");
      const rows = runDisplayNamePersistenceOperation("get-display-names-by-name", () =>
        this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c
            WHERE c.normalized_display_name IN (${placeholders})
            ORDER BY c.account_id ASC
            `
          )
          .all(...normalizedNames)
      );

      for (const row of rows) {
        const match = {
          accountId: row.accountId,
          displayName: row.displayName,
          normalizedDisplayName: row.normalizedDisplayName,
          source: row.source || null,
          observedAt: row.observedAt,
          updatedAt: row.updatedAt,
          stale: isAgeStale(row.ageSeconds, maxAgeSeconds),
          missing: false,
        };
        for (const query of queriesByNormalizedName.get(row.normalizedDisplayName) || []) {
          query.matches.push(match);
        }
      }
    }

    return { queries, count: queries.length };
  }

  getDisplayNames({ accountIds = [], q = "", limit = 200, maxAgeSeconds = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const normalizedIds = [...new Set(normalizeArray(accountIds).map(normalizeAccountId).filter(Boolean))];

    if (normalizedIds.length > 0) {
      const placeholders = normalizedIds.map(() => "?").join(", ");
      const rows = runDisplayNamePersistenceOperation("get-display-names", () =>
        this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c NOT INDEXED
            WHERE c.account_id IN (${placeholders})
            ORDER BY c.account_id ASC
            `
          )
          .all(...normalizedIds)
      );
      const rowsByAccountId = new Map(rows.map((row) => [String(row.accountId || ""), row]));
      return normalizedIds
        .map((accountId) => {
          const row = rowsByAccountId.get(accountId);
          return mapDisplayNameRow(row, { accountId, maxAgeSeconds, missing: !row });
        })
        .sort((a, b) => String(a.accountId || "").localeCompare(String(b.accountId || "")));
    }

    const queryText = String(q || "")
      .trim()
      .toLowerCase();
    const clauses = [];
    const args = [];
    if (queryText) {
      clauses.push("(c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?)");
      args.push(`%${queryText}%`, `%${queryText}%`);
    }

    const rows = runDisplayNamePersistenceOperation("get-display-names", () =>
      this.db
        .prepare(
          `
          SELECT
            c.account_id AS accountId,
            c.display_name AS displayName,
            c.normalized_display_name AS normalizedDisplayName,
            c.source AS source,
            c.observed_at AS observedAt,
            c.updated_at AS updatedAt,
            CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
          FROM account_display_name_current c NOT INDEXED
          ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
          ORDER BY c.observed_at DESC, c.account_id ASC
          LIMIT ?
          `
        )
        .all(...args, safeLimit)
    );
    return rows.map((row) => mapDisplayNameRow(row, { maxAgeSeconds }));
  }

  searchDisplayNames({ q = "", mode = "contains", limit = 20, maxAgeSeconds = 0 } = {}) {
    const queryText = normalizeDisplayNameQuery(q);
    const safeMode = normalizeSearchMode(mode);
    if (!queryText) {
      return { query: String(q || "").trim(), mode: safeMode, matches: [], count: 0 };
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
    const args = [];
    let whereClause = "";
    if (safeMode === "prefix") {
      whereClause = "WHERE c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?";
      args.push(`${queryText}%`, `${queryText}%`);
    } else if (safeMode === "contains") {
      whereClause = "WHERE c.normalized_display_name LIKE ? OR LOWER(c.account_id) LIKE ?";
      args.push(`%${queryText}%`, `%${queryText}%`);
    }

    const rows = runDisplayNamePersistenceOperation("search-display-names", () => {
      if (safeMode === "fuzzy") {
        return this.db
          .prepare(
            `
            SELECT
              c.account_id AS accountId,
              c.display_name AS displayName,
              c.normalized_display_name AS normalizedDisplayName,
              c.source AS source,
              c.observed_at AS observedAt,
              c.updated_at AS updatedAt,
              CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
            FROM account_display_name_current c
            ORDER BY c.observed_at DESC, c.account_id ASC
            LIMIT ?
            `
          )
          .all(FUZZY_SEARCH_ROW_LIMIT);
      }
      return this.db
        .prepare(
          `
          SELECT
            c.account_id AS accountId,
            c.display_name AS displayName,
            c.normalized_display_name AS normalizedDisplayName,
            c.source AS source,
            c.observed_at AS observedAt,
            c.updated_at AS updatedAt,
            CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
          FROM account_display_name_current c
          ${whereClause}
          ORDER BY c.observed_at DESC, c.account_id ASC
          LIMIT ?
          `
        )
        .all(...args, Math.max(safeLimit * 4, safeLimit));
    });

    const matches = rows
      .map((row) => this.#mapSearchMatch(row, { maxAgeSeconds, queryText, mode: safeMode }))
      .filter((row) => row.accountId && row.displayName && row.score > 0)
      .sort((a, b) => {
        const scoreDifference = Number(b.score || 0) - Number(a.score || 0);
        return scoreDifference || String(a.displayName || "").localeCompare(String(b.displayName || ""));
      })
      .slice(0, safeLimit);

    return { query: String(q || "").trim(), mode: safeMode, matches, count: matches.length };
  }

  #mapSearchMatch(row, { maxAgeSeconds, queryText, mode }) {
    const accountId = row?.accountId || null;
    const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
    const normalizedDisplayName = String(row?.normalizedDisplayName || normalizeDisplayNameQuery(displayName));
    let score = 0;
    if (mode === "prefix") {
      score = normalizedDisplayName.startsWith(queryText)
        ? 1
        : accountId && String(accountId).startsWith(queryText)
          ? 0.75
          : 0;
    } else if (mode === "contains") {
      score = normalizedDisplayName.includes(queryText)
        ? 1
        : accountId && String(accountId).includes(queryText)
          ? 0.75
          : 0;
    } else {
      const nameScore = computeDiceScore(normalizedDisplayName, queryText);
      const accountScore = computeDiceScore(String(accountId || ""), queryText) * 0.65;
      score = Math.max(nameScore, accountScore);
    }

    return {
      accountId,
      displayName: displayName || null,
      normalizedDisplayName: normalizedDisplayName || null,
      source: row?.source || null,
      observedAt: row?.observedAt || null,
      updatedAt: row?.updatedAt || null,
      stale: isAgeStale(row?.ageSeconds, maxAgeSeconds),
      missing: false,
      score: Number(score.toFixed(4)),
    };
  }
}

export { DisplayNameQueryRepository };
