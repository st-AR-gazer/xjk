import { isSafeIdentifier, quoteIdentifier } from "./support/repositoryValues.js";

class AdminDataRepository {
  constructor(db) {
    this.db = db;
  }

  getMeta() {
    const safeCount = (sql) => {
      try {
        return Number(this.db.prepare(sql).get()?.count || 0);
      } catch {
        return 0;
      }
    };
    const safeApproxCount = (sql) => {
      try {
        return Number(this.db.prepare(sql).get()?.count || 0);
      } catch {
        return 0;
      }
    };
    const safeGetAt = (sql) => {
      try {
        return this.db.prepare(sql).get()?.at || null;
      } catch {
        return null;
      }
    };

    const projectCount = safeCount("SELECT COUNT(*) AS count FROM projects");
    const mapCount = safeCount("SELECT COUNT(*) AS count FROM map_registry");
    const mapEventCount = safeApproxCount("SELECT MAX(event_id) AS count FROM map_events");
    const aggregatorEventCount = safeApproxCount("SELECT MAX(event_id) AS count FROM aggregator_events");
    const eventCount = mapEventCount + aggregatorEventCount;

    const latestMapEventAt = safeGetAt("SELECT checked_at AS at FROM map_events ORDER BY checked_at DESC LIMIT 1");
    const latestAggregatorEventAt = safeGetAt(
      "SELECT occurred_at AS at FROM aggregator_events ORDER BY occurred_at DESC LIMIT 1"
    );
    const latestEventAt =
      String(latestMapEventAt || "") > String(latestAggregatorEventAt || "")
        ? latestMapEventAt
        : latestAggregatorEventAt;

    const latestChangeAt = safeGetAt(
      "SELECT checked_at AS at FROM map_events WHERE changed = 1 ORDER BY checked_at DESC LIMIT 1"
    );

    return {
      projects: Number(projectCount),
      maps: Number(mapCount),
      events: Number(eventCount),
      latestEventAt,
      latestChangeAt,
    };
  }

  listDataTables({ includeCounts = true } = {}) {
    let tables = [];
    try {
      tables = this.db
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name ASC
          `
        )
        .all()
        .map((row) => String(row.name || ""))
        .filter((name) => isSafeIdentifier(name));
    } catch {
      return [];
    }

    return tables.map((name) => {
      const quoted = quoteIdentifier(name);
      let columnCount = 0;
      try {
        columnCount = this.db.prepare(`PRAGMA table_info(${quoted})`).all().length;
      } catch {
        columnCount = 0;
      }

      let rowCount = null;
      if (includeCounts) {
        try {
          rowCount = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get()?.count || 0);
        } catch {
          rowCount = null;
        }
      }
      return {
        table: name,
        rowCount,
        columnCount: Number(columnCount || 0),
      };
    });
  }

  getTableSchema(tableName) {
    const table = String(tableName || "").trim();
    if (!isSafeIdentifier(table)) return null;
    const quoted = quoteIdentifier(table);

    const exists = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        `
      )
      .get(table)?.count;
    if (!Number(exists)) return null;

    const columns = this.db
      .prepare(`PRAGMA table_info(${quoted})`)
      .all()
      .map((row) => ({
        cid: Number(row.cid || 0),
        name: row.name,
        type: row.type || "",
        notNull: Boolean(row.notnull),
        defaultValue: row.dflt_value ?? null,
        primaryKey: Boolean(row.pk),
      }));

    const indexes = this.db
      .prepare(`PRAGMA index_list(${quoted})`)
      .all()
      .map((row) => ({
        name: row.name,
        unique: Boolean(row.unique),
        origin: row.origin || null,
        partial: Boolean(row.partial),
      }));

    return {
      table,
      columns,
      indexes,
    };
  }

  getTableRows(tableName, { limit = 50, offset = 0, sortBy = "", sortDir = "desc" } = {}) {
    const schema = this.getTableSchema(tableName);
    if (!schema) return null;
    const table = schema.table;
    const quotedTable = quoteIdentifier(table);

    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 300));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const columns = schema.columns.map((col) => String(col.name || ""));
    const safeSortBy = columns.includes(String(sortBy || "")) ? String(sortBy) : "";
    const order = String(sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";

    const orderSql = safeSortBy ? ` ORDER BY ${quoteIdentifier(safeSortBy)} ${order}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM ${quotedTable}${orderSql} LIMIT ? OFFSET ?`)
      .all(safeLimit, safeOffset)
      .map((row) => ({ ...row }));

    const total = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${quotedTable}`).get()?.count || 0);

    return {
      table,
      total,
      limit: safeLimit,
      offset: safeOffset,
      sortBy: safeSortBy || null,
      sortDir: safeSortBy ? order.toLowerCase() : null,
      rows,
      columns,
    };
  }
}

export { AdminDataRepository };
