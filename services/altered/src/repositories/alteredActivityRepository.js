import { clampInt, normalizeAccountId, toIso, toText, truncateText } from "../../../shared/valueUtils.js";

function rowToUpdateRequest(row) {
  if (!row) return null;
  return {
    requestId: Number(row.requestId || 0),
    mapUid: toText(row.mapUid),
    mapName: toText(row.mapName),
    reason: toText(row.reason),
    status: toText(row.status, "queued") || "queued",
    requesterIp: toText(row.requesterIp) || null,
    requesterUserAgent: toText(row.requesterUserAgent) || null,
    createdAt: row.createdAt || null,
    resolvedAt: row.resolvedAt || null,
    resolutionNote: toText(row.resolutionNote) || null,
  };
}

class AlteredActivityRepository {
  constructor(db) {
    this.db = db;
  }

  insertWrEvent({ mapUid, mapName, accountId, holder, wrMs, recordedAt, receivedAt } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const nowIso = new Date().toISOString();
    const safeRecordedAt = toIso(recordedAt, nowIso);
    const safeReceivedAt = toIso(receivedAt, nowIso);
    const safeMapName = toText(mapName);
    const safeAccountId = normalizeAccountId(accountId || holder);
    const safeHolder = toText(holder);
    const safeWrMs = clampInt(wrMs, { min: 0, max: 2147483647, fallback: 0 });

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_wr_events (
          map_uid,
          map_name,
          account_id,
          holder,
          wr_ms,
          recorded_at,
          received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(safeMapUid, safeMapName, safeAccountId || null, safeHolder, safeWrMs, safeRecordedAt, safeReceivedAt);

    return {
      eventId: Number(result?.lastInsertRowid || 0),
      mapUid: safeMapUid,
      mapName: safeMapName,
      accountId: safeAccountId || null,
      holder: safeHolder,
      wrMs: safeWrMs,
      recordedAt: safeRecordedAt,
      receivedAt: safeReceivedAt,
    };
  }

  getLatestWrEvent() {
    const row = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT 1
        `
      )
      .get();
    if (!row) return null;
    return {
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    };
  }

  getRecentWrEvents({ limit = 10, offset = 0 } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 1000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeLimit, safeOffset);
    return rows.map((row) => ({
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    }));
  }

  getRecentWrEventsForMap({ mapUid, limit = 10, offset = 0 } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return [];
    const safeLimit = clampInt(limit, { min: 1, max: 100, fallback: 10 });
    const safeOffset = clampInt(offset, { min: 0, max: 1000000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          event_id AS eventId,
          map_uid AS mapUid,
          map_name AS mapName,
          account_id AS accountId,
          holder AS holder,
          wr_ms AS wrMs,
          recorded_at AS recordedAt,
          received_at AS receivedAt
        FROM altered_wr_events
        WHERE LOWER(map_uid) = LOWER(?)
        ORDER BY recorded_at DESC, event_id DESC
        LIMIT ?
        OFFSET ?
        `
      )
      .all(safeMapUid, safeLimit, safeOffset);
    return rows.map((row) => ({
      eventId: Number(row.eventId || 0),
      mapUid: toText(row.mapUid),
      mapName: toText(row.mapName),
      accountId: normalizeAccountId(row.accountId),
      holder: toText(row.holder),
      wrMs: Number(row.wrMs || 0),
      recordedAt: row.recordedAt || null,
      receivedAt: row.receivedAt || null,
    }));
  }

  recordApiRequest({
    endpointKey,
    requestPath,
    method = "GET",
    statusCode = 200,
    mapUid = "",
    origin = "",
    clientHash = "",
    userAgent = "",
    durationMs = 0,
    createdAt = null,
  } = {}) {
    const safeEndpointKey = toText(endpointKey);
    const safeRequestPath = toText(requestPath);
    if (!safeEndpointKey || !safeRequestPath) return null;

    const safeMethod = truncateText(method || "GET", 12).toUpperCase();
    const safeStatusCode = clampInt(statusCode, {
      min: 100,
      max: 599,
      fallback: 200,
    });
    const safeMapUid = toText(mapUid) || null;
    const safeOrigin = truncateText(origin, 320) || null;
    const safeClientHash = truncateText(clientHash, 128) || null;
    const safeUserAgent = truncateText(userAgent, 512) || null;
    const safeDurationMs = clampInt(durationMs, {
      min: 0,
      max: 3600000,
      fallback: 0,
    });
    const safeCreatedAt = toIso(createdAt, new Date().toISOString());

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_api_requests (
          endpoint_key,
          request_path,
          method,
          status_code,
          map_uid,
          origin,
          client_hash,
          user_agent,
          duration_ms,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeEndpointKey,
        safeRequestPath,
        safeMethod,
        safeStatusCode,
        safeMapUid,
        safeOrigin,
        safeClientHash,
        safeUserAgent,
        safeDurationMs,
        safeCreatedAt
      );

    return {
      requestId: Number(result?.lastInsertRowid || 0),
      endpointKey: safeEndpointKey,
      requestPath: safeRequestPath,
      method: safeMethod,
      statusCode: safeStatusCode,
      mapUid: safeMapUid,
      origin: safeOrigin,
      clientHash: safeClientHash,
      userAgent: safeUserAgent,
      durationMs: safeDurationMs,
      createdAt: safeCreatedAt,
    };
  }

  getApiUsageSummary({ days = 30, recentLimit = 20, topLimit = 8, originsLimit = 8 } = {}) {
    const safeDays = clampInt(days, { min: 1, max: 365, fallback: 30 });
    const safeRecentLimit = clampInt(recentLimit, { min: 1, max: 100, fallback: 20 });
    const safeTopLimit = clampInt(topLimit, { min: 1, max: 25, fallback: 8 });
    const safeOriginsLimit = clampInt(originsLimit, { min: 1, max: 25, fallback: 8 });
    const now = Date.now();
    const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffWindow = new Date(now - safeDays * 24 * 60 * 60 * 1000).toISOString();

    const totals = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests24h,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests7d,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requestsWindow,
          SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) AS clientErrorCount,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount,
          COUNT(DISTINCT CASE
            WHEN created_at >= ? AND client_hash IS NOT NULL AND TRIM(client_hash) <> ''
            THEN client_hash
          END) AS uniqueClientsWindow
        FROM altered_api_requests
        `
      )
      .get(cutoff24h, cutoff7d, cutoffWindow, cutoffWindow);

    const endpoints = this.db
      .prepare(
        `
        SELECT
          endpoint_key AS endpointKey,
          MAX(request_path) AS requestPath,
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests24h,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requests7d,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS requestsWindow,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount,
          AVG(duration_ms) AS avgDurationMs,
          MAX(created_at) AS lastRequestedAt
        FROM altered_api_requests
        GROUP BY endpoint_key
        ORDER BY requests7d DESC, totalRequests DESC, endpoint_key ASC
        LIMIT ?
        `
      )
      .all(cutoff24h, cutoff7d, cutoffWindow, safeTopLimit)
      .map((row) => ({
        endpointKey: toText(row.endpointKey),
        requestPath: toText(row.requestPath),
        totalRequests: Number(row.totalRequests || 0),
        requests24h: Number(row.requests24h || 0),
        requests7d: Number(row.requests7d || 0),
        requestsWindow: Number(row.requestsWindow || 0),
        serverErrorCount: Number(row.serverErrorCount || 0),
        avgDurationMs: Number(Number(row.avgDurationMs || 0).toFixed(1)),
        lastRequestedAt: row.lastRequestedAt || null,
      }));

    const origins = this.db
      .prepare(
        `
        SELECT
          COALESCE(NULLIF(TRIM(origin), ''), 'direct') AS originLabel,
          COUNT(*) AS totalRequests,
          MAX(created_at) AS lastRequestedAt
        FROM altered_api_requests
        WHERE created_at >= ?
        GROUP BY COALESCE(NULLIF(TRIM(origin), ''), 'direct')
        ORDER BY totalRequests DESC, lastRequestedAt DESC
        LIMIT ?
        `
      )
      .all(cutoffWindow, safeOriginsLimit)
      .map((row) => ({
        origin: toText(row.originLabel, "direct") || "direct",
        totalRequests: Number(row.totalRequests || 0),
        lastRequestedAt: row.lastRequestedAt || null,
      }));

    const timeline = this.db
      .prepare(
        `
        SELECT
          substr(created_at, 1, 10) AS day,
          COUNT(*) AS totalRequests,
          SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverErrorCount
        FROM altered_api_requests
        WHERE created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC
        `
      )
      .all(cutoffWindow)
      .map((row) => ({
        day: toText(row.day),
        totalRequests: Number(row.totalRequests || 0),
        serverErrorCount: Number(row.serverErrorCount || 0),
      }));

    const recentRequests = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          endpoint_key AS endpointKey,
          request_path AS requestPath,
          method AS method,
          status_code AS statusCode,
          map_uid AS mapUid,
          origin AS origin,
          user_agent AS userAgent,
          duration_ms AS durationMs,
          created_at AS createdAt
        FROM altered_api_requests
        ORDER BY request_id DESC
        LIMIT ?
        `
      )
      .all(safeRecentLimit)
      .map((row) => ({
        requestId: Number(row.requestId || 0),
        endpointKey: toText(row.endpointKey),
        requestPath: toText(row.requestPath),
        method: toText(row.method),
        statusCode: Number(row.statusCode || 0),
        mapUid: toText(row.mapUid) || null,
        origin: toText(row.origin) || null,
        userAgent: toText(row.userAgent) || null,
        durationMs: Number(row.durationMs || 0),
        createdAt: row.createdAt || null,
      }));

    return {
      generatedAt: new Date().toISOString(),
      windowDays: safeDays,
      totals: {
        totalRequests: Number(totals?.totalRequests || 0),
        requests24h: Number(totals?.requests24h || 0),
        requests7d: Number(totals?.requests7d || 0),
        requestsWindow: Number(totals?.requestsWindow || 0),
        successCount: Number(totals?.successCount || 0),
        clientErrorCount: Number(totals?.clientErrorCount || 0),
        serverErrorCount: Number(totals?.serverErrorCount || 0),
        uniqueClientsWindow: Number(totals?.uniqueClientsWindow || 0),
      },
      endpoints,
      origins,
      timeline,
      recentRequests,
    };
  }

  getRecentUpdateRequest(mapUid, withinMinutes = 60) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const safeMinutes = clampInt(withinMinutes, { min: 1, max: 1440, fallback: 60 });
    const cutoffIso = new Date(Date.now() - safeMinutes * 60 * 1000).toISOString();
    const row = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE map_uid = ? AND created_at >= ?
        ORDER BY created_at DESC, request_id DESC
        LIMIT 1
        `
      )
      .get(safeMapUid, cutoffIso);
    return rowToUpdateRequest(row);
  }

  insertUpdateRequest({
    mapUid,
    mapName,
    reason,
    status = "queued",
    requesterIp = "",
    requesterUserAgent = "",
    createdAt,
  } = {}) {
    const safeMapUid = toText(mapUid);
    if (!safeMapUid) return null;
    const safeStatusRaw = toText(status, "queued").toLowerCase();
    const safeStatus = ["queued", "processing", "done", "rejected"].includes(safeStatusRaw) ? safeStatusRaw : "queued";
    const safeMapName = toText(mapName);
    const safeReason = toText(reason);
    const safeCreatedAt = toIso(createdAt, new Date().toISOString());
    const safeRequesterIp = toText(requesterIp);
    const safeRequesterUserAgent = toText(requesterUserAgent);

    const result = this.db
      .prepare(
        `
        INSERT INTO altered_update_requests (
          map_uid,
          map_name,
          reason,
          status,
          requester_ip,
          requester_user_agent,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeMapUid,
        safeMapName,
        safeReason,
        safeStatus,
        safeRequesterIp || null,
        safeRequesterUserAgent || null,
        safeCreatedAt
      );

    return {
      requestId: Number(result?.lastInsertRowid || 0),
      mapUid: safeMapUid,
      mapName: safeMapName,
      reason: safeReason,
      status: safeStatus,
      requesterIp: safeRequesterIp || null,
      requesterUserAgent: safeRequesterUserAgent || null,
      createdAt: safeCreatedAt,
      resolvedAt: null,
      resolutionNote: null,
    };
  }

  getUpdateRequestById(requestId) {
    const safeRequestId = clampInt(requestId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeRequestId) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE request_id = ?
        LIMIT 1
        `
      )
      .get(safeRequestId);
    return rowToUpdateRequest(row);
  }

  listUpdateRequests({ status = "", q = "", limit = 100, offset = 0 } = {}) {
    const safeStatusRaw = toText(status).toLowerCase();
    const safeStatus = ["queued", "processing", "done", "rejected"].includes(safeStatusRaw) ? safeStatusRaw : "";
    const query = toText(q).toLowerCase();
    const pattern = `%${query}%`;
    const safeLimit = clampInt(limit, { min: 1, max: 500, fallback: 100 });
    const safeOffset = clampInt(offset, { min: 0, max: 500000, fallback: 0 });
    const rows = this.db
      .prepare(
        `
        SELECT
          request_id AS requestId,
          map_uid AS mapUid,
          map_name AS mapName,
          reason AS reason,
          status AS status,
          requester_ip AS requesterIp,
          requester_user_agent AS requesterUserAgent,
          created_at AS createdAt,
          resolved_at AS resolvedAt,
          resolution_note AS resolutionNote
        FROM altered_update_requests
        WHERE
          (? = '' OR LOWER(status) = ?)
          AND (
            ? = ''
            OR LOWER(map_uid) LIKE ?
            OR LOWER(map_name) LIKE ?
            OR LOWER(reason) LIKE ?
          )
        ORDER BY created_at DESC, request_id DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(safeStatus, safeStatus, query, pattern, pattern, pattern, safeLimit, safeOffset);
    return rows.map(rowToUpdateRequest);
  }

  updateUpdateRequestStatus({ requestId, status, resolutionNote = "" } = {}) {
    const safeRequestId = clampInt(requestId, { min: 1, max: 2147483647, fallback: 0 });
    if (!safeRequestId) return null;
    const safeStatusRaw = toText(status).toLowerCase();
    if (!["queued", "processing", "done", "rejected"].includes(safeStatusRaw)) return null;
    const nowIso = new Date().toISOString();
    const safeResolutionNote = toText(resolutionNote);
    const resolvedAt = safeStatusRaw === "done" || safeStatusRaw === "rejected" ? nowIso : null;
    const result = this.db
      .prepare(
        `
        UPDATE altered_update_requests
        SET
          status = ?,
          resolved_at = ?,
          resolution_note = ?
        WHERE request_id = ?
        `
      )
      .run(safeStatusRaw, resolvedAt, safeResolutionNote || null, safeRequestId);
    if (!Number(result?.changes || 0)) return null;
    return this.getUpdateRequestById(safeRequestId);
  }
}

export { AlteredActivityRepository, rowToUpdateRequest };
