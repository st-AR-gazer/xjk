import { normalizeProjectKey } from "../support/repositoryValues.js";

class WrBaselineQueryRepository {
  constructor(db) {
    this.db = db;
  }

  getWrBaselineQueue({ limit = 100, offset: _offset = 0, page = 1, status = "queued", projectKey = "", q = "" } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const requestedPage = Math.max(1, Number(page) || 1);
    const safeStatus = String(status || "")
      .trim()
      .toLowerCase();
    const queryText = String(q || "")
      .trim()
      .toLowerCase();

    const clauses = [];
    const args = [];
    if (safeStatus && safeStatus !== "all") {
      clauses.push("LOWER(wq.status) = ?");
      args.push(safeStatus);
    }
    if (queryKey) {
      clauses.push("wq.project_key = ?");
      args.push(queryKey);
    }
    if (queryText) {
      clauses.push(
        "(" +
          [
            "LOWER(COALESCE(wq.map_uid, '')) LIKE ?",
            "LOWER(COALESCE(wq.map_name, '')) LIKE ?",
            "LOWER(COALESCE(wq.old_holder, '')) LIKE ?",
            "LOWER(COALESCE(wq.new_holder, '')) LIKE ?",
            "LOWER(COALESCE(wq.reason_code, '')) LIKE ?",
            "LOWER(COALESCE(p.display_name, '')) LIKE ?",
          ].join(" OR ") +
          ")"
      );
      for (let i = 0; i < 6; i += 1) args.push(`%${queryText}%`);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalRow =
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM wr_baseline_queue wq
          LEFT JOIN projects p ON p.project_key = wq.project_key
          ${whereSql}
          `
        )
        .get(...args) || {};
    const total = Number(totalRow.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.max(1, Math.min(requestedPage, totalPages));
    const clampedOffset = Math.max(0, (clampedPage - 1) * safeLimit);

    const rows = this.db
      .prepare(
        `
        SELECT
          wq.queue_id AS queueId,
          wq.project_key AS projectKey,
          p.display_name AS projectName,
          wq.map_uid AS mapUid,
          wq.map_name AS mapName,
          wq.checked_at AS checkedAt,
          wq.reason_code AS reasonCode,
          wq.old_wr_time AS oldWrTime,
          wq.new_wr_time AS newWrTime,
          wq.old_holder AS oldHolder,
          wq.new_holder AS newHolder,
          wq.source AS source,
          wq.note AS note,
          wq.status AS status,
          wq.resolution_note AS resolutionNote,
          wq.created_at AS createdAt,
          wq.updated_at AS updatedAt,
          wq.resolved_at AS resolvedAt
        FROM wr_baseline_queue wq
        LEFT JOIN projects p ON p.project_key = wq.project_key
        ${whereSql}
        ORDER BY datetime(wq.created_at) DESC, wq.queue_id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...args, safeLimit, clampedOffset);

    return {
      items: rows.map((row) => ({
        queueId: Number(row.queueId || 0),
        projectKey: row.projectKey || null,
        projectName: row.projectName || row.projectKey || null,
        mapUid: row.mapUid || null,
        mapName: row.mapName || row.mapUid || null,
        checkedAt: row.checkedAt || null,
        reasonCode: row.reasonCode || null,
        oldWrTime: row.oldWrTime === null ? null : Number(row.oldWrTime || 0),
        newWrTime: row.newWrTime === null ? null : Number(row.newWrTime || 0),
        oldHolder: row.oldHolder || null,
        newHolder: row.newHolder || null,
        source: row.source || null,
        note: row.note || null,
        status: row.status || null,
        resolutionNote: row.resolutionNote || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
        resolvedAt: row.resolvedAt || null,
      })),
      count: rows.length,
      total,
      limit: safeLimit,
      offset: clampedOffset,
      page: clampedPage,
      totalPages,
      filters: {
        status: safeStatus || "all",
        projectKey: queryKey || "",
        q: queryText,
      },
    };
  }
}

export { WrBaselineQueryRepository };
