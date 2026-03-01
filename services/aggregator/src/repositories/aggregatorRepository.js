function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toIso(value, fallbackIso) {
  if (value === null || value === undefined || value === "") return fallbackIso;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return fallbackIso;
  return dt.toISOString();
}

function normalizeProjectKey(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeInstanceId(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 120);
}

function normalizeMaybeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeAccountId(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
    return text;
  }
  return "";
}

function normalizeClubId(value) {
  return clampInt(value, { min: 1, max: 2147483647, fallback: 0 });
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueBy(values, toKey) {
  const keyFn = typeof toKey === "function" ? toKey : (value) => value;
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}

function quoteIdentifier(value) {
  if (!isSafeIdentifier(value)) return "";
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function parseBucket(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "day" || raw === "daily") {
    return {
      key: "day",
      expr: "strftime('%Y-%m-%dT00:00:00Z', __ts__)",
    };
  }
  return {
    key: "hour",
    expr: "strftime('%Y-%m-%dT%H:00:00Z', __ts__)",
  };
}

function normalizeDisplayNameEntries(payload = {}) {
  const out = [];

  const maybeArray = normalizeArray(payload.names);
  for (const row of maybeArray) {
    const accountId = normalizeAccountId(row?.accountId || row?.account_id || row?.id);
    const displayName = String(row?.displayName ?? row?.display_name ?? row?.name ?? "").trim();
    if (!accountId || !displayName) continue;
    out.push({
      accountId,
      displayName,
      observedAt: row?.observedAt || row?.observed_at || payload.observedAt || payload.observed_at,
      source: row?.source || payload.sourceLabel || payload.source,
    });
  }

  const mapping = payload.namesByAccountId || payload.displayNames || payload.names_map;
  if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
    for (const [rawAccountId, rawName] of Object.entries(mapping)) {
      const accountId = normalizeAccountId(rawAccountId);
      const displayName = String(rawName || "").trim();
      if (!accountId || !displayName) continue;
      out.push({
        accountId,
        displayName,
        observedAt: payload.observedAt || payload.observed_at,
        source: payload.sourceLabel || payload.source,
      });
    }
  }

  const dedup = new Map();
  for (const entry of out) {
    const key = `${entry.accountId}|${entry.displayName}`;
    if (!dedup.has(key)) dedup.set(key, entry);
  }
  return [...dedup.values()];
}

class AggregatorRepository {
  constructor(db) {
    this.db = db;
  }

  upsertProjectSeen(projectKey, projectName, sourceLabel, observedAt) {
    const normalizedProjectKey = normalizeProjectKey(projectKey);
    if (!normalizedProjectKey) return;
    const safeName = String(projectName || normalizedProjectKey).trim() || normalizedProjectKey;
    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = excluded.display_name,
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(normalizedProjectKey, safeName, normalizeMaybeString(sourceLabel), observedAt, observedAt);
  }

  appendAggregatorEvent({
    projectKey = "",
    projectName = "",
    sourceLabel = null,
    occurredAt = "",
    eventType = "",
    detail1 = null,
    detail2 = null,
    detail3 = null,
    payload = null,
  } = {}) {
    const safeProjectKey = normalizeProjectKey(projectKey);
    const safeOccurredAt = toIso(occurredAt, new Date().toISOString());
    const safeEventType = String(eventType || "").trim();
    if (!safeEventType) return;
    if (safeProjectKey) {
      const safeProjectName = String(projectName || safeProjectKey).trim() || safeProjectKey;
      this.upsertProjectSeen(safeProjectKey, safeProjectName, sourceLabel, safeOccurredAt);
    }
    const payloadJson = payload && typeof payload === "object" ? JSON.stringify(payload) : null;
    this.db
      .prepare(
        `
        INSERT INTO aggregator_events (
          project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeProjectKey || null,
        safeOccurredAt,
        safeEventType,
        normalizeMaybeString(detail1),
        normalizeMaybeString(detail2),
        normalizeMaybeString(detail3),
        normalizeMaybeString(sourceLabel),
        payloadJson
      );
  }

  ingestEvents(payload = {}) {
    const receivedAt = new Date().toISOString();
    const defaultProjectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const defaultProjectName = String(
      payload.projectName || payload.project?.name || defaultProjectKey || "event-producer"
    ).trim();
    const defaultSourceLabel = normalizeMaybeString(
      payload.sourceLabel || payload.source || payload.project?.sourceLabel
    );

    const events = Array.isArray(payload.events)
      ? payload.events
      : payload && typeof payload.event === "object"
        ? [payload.event]
        : payload && typeof payload === "object" && payload.eventType
          ? [payload]
          : [];

    if (!events.length) {
      return { error: "No valid events provided." };
    }

    let accepted = 0;
    for (const event of events) {
      const eventType = String(event?.eventType || event?.type || "").trim();
      if (!eventType) continue;

      const projectKey = normalizeProjectKey(
        event?.projectKey || event?.project?.key || defaultProjectKey
      );
      const projectName = String(
        event?.projectName || event?.project?.name || defaultProjectName || projectKey || "event-producer"
      ).trim();
      const sourceLabel = normalizeMaybeString(
        event?.sourceLabel || event?.source || event?.project?.sourceLabel || defaultSourceLabel
      );

      const rawChanged = String(
        event?.changedLabel ?? event?.changed ?? event?.change ?? ""
      )
        .trim()
        .toLowerCase();
      const changedMarker =
        rawChanged === "*" || rawChanged === "new"
          ? "*"
          : rawChanged === "1" ||
              rawChanged === "true" ||
              rawChanged === "yes" ||
              rawChanged === "changed"
            ? "yes"
            : "no";

      const existingDetail3 = String(event?.detail3 || "").trim();
      const detail3 =
        existingDetail3 || changedMarker ? (existingDetail3 || `change:${changedMarker}`) : null;

      const payloadObject =
        event?.payload && typeof event.payload === "object"
          ? {
              ...event.payload,
              changed: changedMarker !== "no",
              change: changedMarker === "*" ? "new" : changedMarker === "yes" ? "changed" : "none",
            }
          : {
              changed: changedMarker !== "no",
              change: changedMarker === "*" ? "new" : changedMarker === "yes" ? "changed" : "none",
            };

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: event?.occurredAt || event?.at || receivedAt,
        eventType,
        detail1: event?.detail1 || event?.item || null,
        detail2: event?.detail2 || event?.message || null,
        detail3,
        payload: payloadObject,
      });
      accepted += 1;
    }

    if (!accepted) {
      return { error: "No events were accepted." };
    }

    return {
      projectKey: defaultProjectKey || null,
      sourceLabel: defaultSourceLabel,
      accepted,
      receivedAt,
    };
  }

  ingestTrackerRun(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    if (!projectKey) {
      return { error: "projectKey is required." };
    }

    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const run = payload.run && typeof payload.run === "object" ? payload.run : {};
    const checks = Array.isArray(payload.checks) ? payload.checks : [];

    const startedAt = toIso(run.startedAt, receivedAt);
    const finishedAt = toIso(run.finishedAt, receivedAt);
    const provider = normalizeMaybeString(run.provider);
    const reason = normalizeMaybeString(run.reason || run.note);
    const note = normalizeMaybeString(run.note);
    const mapsConsidered = clampInt(run.mapsConsidered, { min: 0, max: 100000, fallback: 0 });
    const mapsChecked = clampInt(run.mapsChecked, { min: 0, max: 100000, fallback: checks.length });
    const wrChanges = clampInt(run.wrChanges, { min: 0, max: 100000, fallback: 0 });

    let ingestId = 0;
    let acceptedChecks = 0;
    let changedChecks = 0;
    let queuedBaselineAnomalies = 0;

    try {
      this.db.exec("BEGIN");

      this.db
        .prepare(
          `
          INSERT INTO projects (
            project_key, display_name, source_label, first_seen_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(project_key) DO UPDATE SET
            display_name = excluded.display_name,
            source_label = COALESCE(excluded.source_label, projects.source_label),
            last_seen_at = excluded.last_seen_at
          `
        )
        .run(projectKey, projectName, sourceLabel, receivedAt, receivedAt);

      const runResult = this.db
        .prepare(
          `
          INSERT INTO ingest_runs (
            project_key, provider, reason, source_label, started_at, finished_at,
            maps_considered, maps_checked, wr_changes, note, received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          projectKey,
          provider,
          reason,
          sourceLabel,
          startedAt,
          finishedAt,
          mapsConsidered,
          mapsChecked,
          wrChanges,
          note,
          receivedAt
        );
      ingestId = Number(runResult.lastInsertRowid || 0);

      const upsertMapRegistry = this.db.prepare(
        `
        INSERT INTO map_registry (
          map_uid, map_name, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(map_uid) DO UPDATE SET
          map_name = CASE
            WHEN excluded.map_name IS NOT NULL AND excluded.map_name <> '' THEN excluded.map_name
            ELSE map_registry.map_name
          END,
          last_seen_at = excluded.last_seen_at
        `
      );

      const upsertProjectMap = this.db.prepare(
        `
        INSERT INTO project_maps (
          project_key, map_uid, latest_checked_at, last_changed_at, wr_ms, wr_holder,
          source, note, check_count, change_count, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, map_uid) DO UPDATE SET
          latest_checked_at = excluded.latest_checked_at,
          last_changed_at = COALESCE(excluded.last_changed_at, project_maps.last_changed_at),
          wr_ms = CASE
            WHEN excluded.wr_ms IS NOT NULL AND excluded.wr_ms > 0 THEN excluded.wr_ms
            ELSE project_maps.wr_ms
          END,
          wr_holder = CASE
            WHEN excluded.wr_holder IS NOT NULL AND excluded.wr_holder <> '' THEN excluded.wr_holder
            ELSE project_maps.wr_holder
          END,
          source = COALESCE(excluded.source, project_maps.source),
          note = COALESCE(excluded.note, project_maps.note),
          check_count = project_maps.check_count + excluded.check_count,
          change_count = project_maps.change_count + excluded.change_count,
          status = excluded.status,
          updated_at = excluded.updated_at
        `
      );

      const upsertAccount = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const insertMapEvent = this.db.prepare(
        `
        INSERT INTO map_events (
          ingest_id, project_key, map_uid, map_name, checked_at, changed,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      const insertWrBaselineQueue = this.db.prepare(
        `
        INSERT OR IGNORE INTO wr_baseline_queue (
          project_key, map_uid, map_name, checked_at, reason_code,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
        `
      );

      for (const rawCheck of checks) {
        const mapUid = String(rawCheck?.mapUid || rawCheck?.uid || "").trim();
        if (!mapUid) continue;

        const checkedAt = toIso(rawCheck.checkedAt, finishedAt);
        const changed = Boolean(rawCheck.changed);
        const mapName = normalizeMaybeString(rawCheck.mapName || rawCheck.name || mapUid);
        const oldWrTime = clampInt(rawCheck.oldWrTime, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const newWrTime = clampInt(rawCheck.newWrTime, {
          min: 0,
          max: 2147483647,
          fallback: 0,
        });
        const oldHolder = normalizeMaybeString(rawCheck.oldHolder);
        const newHolder = normalizeMaybeString(rawCheck.newHolder);
        const source = normalizeMaybeString(rawCheck.source || provider);
        const checkNote = normalizeMaybeString(rawCheck.note);
        const wrMs = newWrTime > 0 ? newWrTime : null;
        const wrHolder = newHolder || null;
        const status =
          checkNote && checkNote.toLowerCase().startsWith("error:") ? "error" : "ok";

        const oldHolderAccountId = normalizeAccountId(
          rawCheck?.oldHolderAccountId || rawCheck?.old_holder_account_id
        );
        const newHolderAccountId = normalizeAccountId(
          rawCheck?.newHolderAccountId || rawCheck?.new_holder_account_id
        );
        const accountIds = uniqueBy(
          [
            ...normalizeArray(rawCheck?.accountIds || rawCheck?.account_ids),
            oldHolderAccountId,
            newHolderAccountId,
          ]
            .map((value) => normalizeAccountId(value))
            .filter(Boolean),
          (accountId) => accountId
        );
        for (const accountId of accountIds) {
          upsertAccount.run(accountId, checkedAt, checkedAt);
        }

        upsertMapRegistry.run(mapUid, mapName, checkedAt, checkedAt);
        upsertProjectMap.run(
          projectKey,
          mapUid,
          checkedAt,
          changed ? checkedAt : null,
          wrMs,
          wrHolder,
          source,
          checkNote,
          1,
          changed ? 1 : 0,
          status,
          receivedAt
        );
        insertMapEvent.run(
          ingestId,
          projectKey,
          mapUid,
          mapName,
          checkedAt,
          changed ? 1 : 0,
          oldWrTime || null,
          newWrTime || null,
          oldHolder,
          newHolder,
          source,
          checkNote
        );

        const oldWrMissing = oldWrTime <= 0;
        const oldHolderMissing = !oldHolder;
        const newWrPresent = newWrTime > 0;
        const newHolderPresent = Boolean(newHolder);
        const shouldQueueBaselineAnomaly =
          changed && (oldWrMissing || oldHolderMissing) && (newWrPresent || newHolderPresent);
        if (shouldQueueBaselineAnomaly) {
          const queueResult = insertWrBaselineQueue.run(
            projectKey,
            mapUid,
            mapName,
            checkedAt,
            "wr-baseline-missing",
            oldWrTime || null,
            newWrTime || null,
            oldHolder,
            newHolder,
            source,
            checkNote,
            receivedAt,
            receivedAt
          );
          if (Number(queueResult?.changes || 0) > 0) {
            queuedBaselineAnomalies += 1;
            this.appendAggregatorEvent({
              projectKey,
              projectName,
              sourceLabel: source || sourceLabel,
              occurredAt: checkedAt,
              eventType: "queue.wr_baseline_missing",
              detail1: mapName || mapUid,
              detail2: `wr: ${oldWrTime > 0 ? oldWrTime : "-"} -> ${newWrTime > 0 ? newWrTime : "-"}`,
              detail3: `holder: ${oldHolder || "-"} -> ${newHolder || "-"}`,
              payload: {
                projectKey,
                mapUid,
                mapName: mapName || mapUid,
                reason: "wr-baseline-missing",
                oldWrTime: oldWrTime || null,
                newWrTime: newWrTime || null,
                oldHolder: oldHolder || null,
                newHolder: newHolder || null,
                checkedAt,
              },
            });
          }
        }

        acceptedChecks += 1;
        if (changed) changedChecks += 1;
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: finishedAt,
        eventType: "tracker.run",
        detail1: `maps considered: ${mapsConsidered}`,
        detail2: `maps checked: ${acceptedChecks}, wr changes: ${changedChecks}, queued anomalies: ${queuedBaselineAnomalies}`,
        detail3: reason || provider || note || "tracker ingest",
        payload: {
          ingestId,
          provider,
          reason,
          mapsConsidered,
          mapsChecked: acceptedChecks,
          wrChanges: changedChecks,
          queuedBaselineAnomalies,
          startedAt,
          finishedAt,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      ingestId,
      projectKey,
      projectName,
      acceptedChecks,
      changedChecks,
      queuedBaselineAnomalies,
      receivedAt,
    };
  }

  registerInstance(payload = {}) {
    const now = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const instanceId = normalizeInstanceId(payload.instanceId || payload.instance?.id);
    if (!projectKey) return { error: "projectKey is required." };
    if (!instanceId) return { error: "instanceId is required." };
    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const instanceName =
      normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
    const status = normalizeMaybeString(payload.status) || "online";
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;

    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = excluded.display_name,
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(projectKey, projectName, sourceLabel, now, now);

    this.db
      .prepare(
        `
        INSERT INTO project_instances (
          project_key, instance_id, instance_name, source_label, status,
          registered_at, last_heartbeat_at, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, instance_id) DO UPDATE SET
          instance_name = excluded.instance_name,
          source_label = COALESCE(excluded.source_label, project_instances.source_label),
          status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          meta_json = COALESCE(excluded.meta_json, project_instances.meta_json)
        `
      )
      .run(projectKey, instanceId, instanceName, sourceLabel, status, now, now, metaJson);

    this.appendAggregatorEvent({
      projectKey,
      projectName,
      sourceLabel,
      occurredAt: now,
      eventType: "instance.register",
      detail1: `instance: ${instanceName}`,
      detail2: `status: ${status}`,
      detail3: null,
      payload: {
        instanceId,
        instanceName,
        status,
      },
    });

    return {
      projectKey,
      instanceId,
      instanceName,
      status,
      registeredAt: now,
      lastHeartbeatAt: now,
    };
  }

  heartbeatInstance(payload = {}) {
    const now = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const instanceId = normalizeInstanceId(payload.instanceId || payload.instance?.id);
    if (!projectKey) return { error: "projectKey is required." };
    if (!instanceId) return { error: "instanceId is required." };
    const status = normalizeMaybeString(payload.status) || "online";
    const instanceName =
      normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
    const projectName =
      String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;

    this.db
      .prepare(
        `
        INSERT INTO projects (
          project_key, display_name, source_label, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_key) DO UPDATE SET
          display_name = COALESCE(excluded.display_name, projects.display_name),
          source_label = COALESCE(excluded.source_label, projects.source_label),
          last_seen_at = excluded.last_seen_at
        `
      )
      .run(projectKey, projectName, sourceLabel, now, now);

    this.db
      .prepare(
        `
        INSERT INTO project_instances (
          project_key, instance_id, instance_name, source_label, status,
          registered_at, last_heartbeat_at, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_key, instance_id) DO UPDATE SET
          instance_name = COALESCE(excluded.instance_name, project_instances.instance_name),
          source_label = COALESCE(excluded.source_label, project_instances.source_label),
          status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          meta_json = COALESCE(excluded.meta_json, project_instances.meta_json)
        `
      )
      .run(projectKey, instanceId, instanceName, sourceLabel, status, now, now, metaJson);

    this.appendAggregatorEvent({
      projectKey,
      projectName,
      sourceLabel,
      occurredAt: now,
      eventType: "instance.heartbeat",
      detail1: `instance: ${instanceName}`,
      detail2: `status: ${status}`,
      detail3: null,
      payload: {
        instanceId,
        instanceName,
        status,
      },
    });

    return {
      projectKey,
      instanceId,
      status,
      lastHeartbeatAt: now,
    };
  }

  getMeta() {
    const projectCount =
      this.db.prepare("SELECT COUNT(*) AS count FROM projects").get()?.count || 0;
    const mapCount =
      this.db.prepare("SELECT COUNT(*) AS count FROM map_registry").get()?.count || 0;
    const mapEventCount = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM map_events").get()?.count || 0
    );
    const aggregatorEventCount = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM aggregator_events").get()?.count || 0
    );
    const eventCount = mapEventCount + aggregatorEventCount;
    const latestEventAt = this.db
      .prepare(
        `
        SELECT at
        FROM (
          SELECT checked_at AS at FROM map_events
          UNION ALL
          SELECT occurred_at AS at FROM aggregator_events
        )
        ORDER BY at DESC
        LIMIT 1
        `
      )
      .get()?.at || null;
    const latestChangeAt =
      this.db
        .prepare(
          "SELECT checked_at AS at FROM map_events WHERE changed = 1 ORDER BY checked_at DESC LIMIT 1"
        )
        .get()?.at || null;

    return {
      projects: Number(projectCount),
      maps: Number(mapCount),
      events: Number(eventCount),
      latestEventAt,
      latestChangeAt,
    };
  }

  listDataTables({ includeCounts = true } = {}) {
    const tables = this.db
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

    return tables.map((name) => {
      const quoted = quoteIdentifier(name);
      const columnCount = this.db.prepare(`PRAGMA table_info(${quoted})`).all().length;
      let rowCount = null;
      if (includeCounts) {
        rowCount = Number(this.db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get()?.count || 0);
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

  getMetricsOverview() {
    const base = this.getMeta();
    const projects = Number(this.db.prepare("SELECT COUNT(*) AS count FROM projects").get()?.count || 0);
    const instances = Number(this.db.prepare("SELECT COUNT(*) AS count FROM project_instances").get()?.count || 0);
    const onlineInstances = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM project_instances
          WHERE status = 'online'
            AND julianday(last_heartbeat_at) >= julianday('now') - (10.0 / 1440.0)
          `
        )
        .get()?.count || 0
    );
    const ingestRuns = Number(this.db.prepare("SELECT COUNT(*) AS count FROM ingest_runs").get()?.count || 0);
    const eventsChanged = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM map_events WHERE changed = 1").get()?.count || 0
    );
    const accounts = Number(this.db.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count || 0);
    const displayNames = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM account_display_name_current").get()?.count || 0
    );
    const clubs = Number(this.db.prepare("SELECT COUNT(*) AS count FROM clubs").get()?.count || 0);
    const clubCampaigns = Number(this.db.prepare("SELECT COUNT(*) AS count FROM club_campaigns").get()?.count || 0);
    const clubMaps = Number(
      this.db
        .prepare(
          `
          SELECT
            (SELECT COUNT(*) FROM club_campaign_maps) +
            (SELECT COUNT(*) FROM club_upload_maps) AS count
          `
        )
        .get()?.count || 0
    );
    const clubMembers = Number(this.db.prepare("SELECT COUNT(*) AS count FROM club_members").get()?.count || 0);
    const lastIngestAt =
      this.db.prepare("SELECT finished_at AS at FROM ingest_runs ORDER BY finished_at DESC LIMIT 1").get()?.at ||
      null;

    const mapFreshnessRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS trackedMaps,
            COALESCE(SUM(CASE WHEN latest_checked_at IS NULL THEN 1 ELSE 0 END), 0) AS neverChecked,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (6.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked6h,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END), 0) AS checked24h,
            COALESCE(SUM(CASE WHEN julianday(latest_checked_at) >= julianday('now') - (7.0) THEN 1 ELSE 0 END), 0) AS checked7d,
            MIN(latest_checked_at) AS oldestCheckedAt,
            MAX(latest_checked_at) AS newestCheckedAt
          FROM project_maps
          `
        )
        .get() || {};
    const trackedMaps = Number(mapFreshnessRaw.trackedMaps || 0);
    const checked6h = Number(mapFreshnessRaw.checked6h || 0);
    const checked24h = Number(mapFreshnessRaw.checked24h || 0);
    const checked7d = Number(mapFreshnessRaw.checked7d || 0);
    const neverChecked = Number(mapFreshnessRaw.neverChecked || 0);
    const stale24h = Math.max(0, trackedMaps - checked24h);
    const stale7d = Math.max(0, trackedMaps - checked7d);

    const events24hRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS checks24h,
            COALESCE(SUM(changed), 0) AS changes24h,
            COALESCE(
              SUM(CASE WHEN note IS NOT NULL AND LOWER(note) LIKE 'error:%' THEN 1 ELSE 0 END),
              0
            ) AS errors24h
          FROM map_events
          WHERE julianday(checked_at) >= julianday('now') - (24.0 / 24.0)
          `
        )
        .get() || {};
    const checks24h = Number(events24hRaw.checks24h || 0);
    const changes24h = Number(events24hRaw.changes24h || 0);
    const errors24h = Number(events24hRaw.errors24h || 0);

    const run24hRaw =
      this.db
        .prepare(
          `
          SELECT
            COUNT(*) AS runs24h,
            COALESCE(SUM(maps_checked), 0) AS mapsChecked24h,
            COALESCE(SUM(wr_changes), 0) AS wrChanges24h,
            COALESCE(AVG((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS avgRunDurationSeconds24h,
            COALESCE(MAX((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS maxRunDurationSeconds24h
          FROM ingest_runs
          WHERE julianday(finished_at) >= julianday('now') - (24.0 / 24.0)
          `
        )
        .get() || {};
    const runs24h = Number(run24hRaw.runs24h || 0);
    const mapsChecked24h = Number(run24hRaw.mapsChecked24h || 0);
    const wrChanges24h = Number(run24hRaw.wrChanges24h || 0);
    const avgRunDurationSeconds24h = Number(run24hRaw.avgRunDurationSeconds24h || 0);
    const maxRunDurationSeconds24h = Number(run24hRaw.maxRunDurationSeconds24h || 0);

    const instanceHealthRaw =
      this.db
        .prepare(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN status <> 'online'
                    OR julianday(last_heartbeat_at) < julianday('now') - (10.0 / 1440.0)
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS staleOrOfflineInstances,
            COALESCE(AVG((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS avgHeartbeatAgeSeconds,
            COALESCE(MAX((julianday('now') - julianday(last_heartbeat_at)) * 86400.0), 0) AS maxHeartbeatAgeSeconds
          FROM project_instances
          `
        )
        .get() || {};
    const staleOrOfflineInstances = Number(instanceHealthRaw.staleOrOfflineInstances || 0);
    const avgHeartbeatAgeSeconds = Number(instanceHealthRaw.avgHeartbeatAgeSeconds || 0);
    const maxHeartbeatAgeSeconds = Number(instanceHealthRaw.maxHeartbeatAgeSeconds || 0);

    const nameHealthRaw =
      this.db
        .prepare(
          `
          SELECT
            COALESCE(
              SUM(CASE WHEN julianday(observed_at) >= julianday('now') - (24.0 / 24.0) THEN 1 ELSE 0 END),
              0
            ) AS observed24h,
            COALESCE(
              SUM(CASE WHEN julianday(observed_at) < julianday('now') - 20.0 THEN 1 ELSE 0 END),
              0
            ) AS stale20d,
            MAX(observed_at) AS lastObservedAt
          FROM account_display_name_current
          `
        )
        .get() || {};
    const observed24h = Number(nameHealthRaw.observed24h || 0);
    const stale20d = Number(nameHealthRaw.stale20d || 0);
    const lastObservedAt = nameHealthRaw.lastObservedAt || null;
    const renameEvents30d = Number(
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM account_display_name_history
          WHERE julianday(valid_from) >= julianday('now') - 30.0
          `
        )
        .get()?.count || 0
    );
    const missingDisplayNames = Math.max(0, accounts - displayNames);

    const pageCount = Number(this.db.prepare("PRAGMA page_count").get()?.page_count || 0);
    const pageSize = Number(this.db.prepare("PRAGMA page_size").get()?.page_size || 0);
    const freelistCount = Number(this.db.prepare("PRAGMA freelist_count").get()?.freelist_count || 0);
    const dbBytes = pageCount * pageSize;
    const freeBytes = freelistCount * pageSize;
    const usedBytes = Math.max(0, dbBytes - freeBytes);

    const topProjects = this.db
      .prepare(
        `
        SELECT
          p.project_key AS projectKey,
          p.display_name AS projectName,
          COALESCE(SUM(pm.check_count), 0) AS checks,
          COALESCE(SUM(pm.change_count), 0) AS changes,
          COALESCE(COUNT(pm.map_uid), 0) AS trackedMaps
        FROM projects p
        LEFT JOIN project_maps pm ON pm.project_key = p.project_key
        GROUP BY p.project_key, p.display_name
        ORDER BY checks DESC, changes DESC, trackedMaps DESC
        LIMIT 8
        `
      )
      .all()
      .map((row) => ({
        projectKey: row.projectKey,
        projectName: row.projectName || row.projectKey,
        checks: Number(row.checks || 0),
        changes: Number(row.changes || 0),
        trackedMaps: Number(row.trackedMaps || 0),
      }));

    return {
      ...base,
      projects,
      instances,
      onlineInstances,
      ingestRuns,
      eventsChanged,
      accounts,
      displayNames,
      clubs,
      clubCampaigns,
      clubMaps,
      clubMembers,
      lastIngestAt,
      storage: {
        pageCount,
        pageSize,
        dbBytes,
        usedBytes,
        freeBytes,
      },
      freshness: {
        trackedMaps,
        checked6h,
        checked24h,
        checked7d,
        stale24h,
        stale7d,
        neverChecked,
        oldestCheckedAt: mapFreshnessRaw.oldestCheckedAt || null,
        newestCheckedAt: mapFreshnessRaw.newestCheckedAt || null,
      },
      throughput24h: {
        checks: checks24h,
        changes: changes24h,
        errors: errors24h,
        runs: runs24h,
        mapsChecked: mapsChecked24h,
        wrChanges: wrChanges24h,
      },
      rates: {
        changeRateOverallPct: base.events > 0 ? (eventsChanged / base.events) * 100 : 0,
        changeRate24hPct: checks24h > 0 ? (changes24h / checks24h) * 100 : 0,
        errorRate24hPct: checks24h > 0 ? (errors24h / checks24h) * 100 : 0,
      },
      runHealth: {
        avgRunDurationSeconds24h,
        maxRunDurationSeconds24h,
        avgMapsPerRun24h: runs24h > 0 ? mapsChecked24h / runs24h : 0,
        avgWrChangesPerRun24h: runs24h > 0 ? wrChanges24h / runs24h : 0,
      },
      instanceHealth: {
        staleOrOfflineInstances,
        avgHeartbeatAgeSeconds,
        maxHeartbeatAgeSeconds,
      },
      nameHealth: {
        observed24h,
        stale20d,
        renameEvents30d,
        missingDisplayNames,
        coveragePct: accounts > 0 ? (displayNames / accounts) * 100 : 0,
        lastObservedAt,
      },
      topProjects,
    };
  }

  getMetricsTimeseries({ bucket = "hour", windowHours = 168, projectKey = "" } = {}) {
    const safeWindowHours = Math.max(1, Math.min(Number(windowHours) || 168, 24 * 365));
    const bucketMeta = parseBucket(bucket);
    const normalizedProjectKey = normalizeProjectKey(projectKey);

    const eventClauses = ["julianday(checked_at) >= julianday('now') - (? / 24.0)"];
    const eventArgs = [safeWindowHours];
    if (normalizedProjectKey) {
      eventClauses.push("project_key = ?");
      eventArgs.push(normalizedProjectKey);
    }

    const runClauses = ["julianday(finished_at) >= julianday('now') - (? / 24.0)"];
    const runArgs = [safeWindowHours];
    if (normalizedProjectKey) {
      runClauses.push("project_key = ?");
      runArgs.push(normalizedProjectKey);
    }

    const eventBucketExpr = bucketMeta.expr.replace(/__ts__/g, "checked_at");
    const runBucketExpr = bucketMeta.expr.replace(/__ts__/g, "finished_at");

    const events = this.db
      .prepare(
        `
        SELECT
          ${eventBucketExpr} AS bucket,
          COUNT(*) AS checks,
          COALESCE(SUM(changed), 0) AS changes
        FROM map_events
        WHERE ${eventClauses.join(" AND ")}
        GROUP BY bucket
        ORDER BY bucket ASC
        `
      )
      .all(...eventArgs)
      .map((row) => ({
        bucket: row.bucket,
        checks: Number(row.checks || 0),
        changes: Number(row.changes || 0),
      }));

    const runs = this.db
      .prepare(
        `
        SELECT
          ${runBucketExpr} AS bucket,
          COUNT(*) AS runs,
          COALESCE(SUM(maps_checked), 0) AS mapsChecked,
          COALESCE(SUM(wr_changes), 0) AS wrChanges,
          COALESCE(AVG((julianday(finished_at) - julianday(started_at)) * 86400.0), 0) AS avgDurationSeconds
        FROM ingest_runs
        WHERE ${runClauses.join(" AND ")}
        GROUP BY bucket
        ORDER BY bucket ASC
        `
      )
      .all(...runArgs)
      .map((row) => ({
        bucket: row.bucket,
        runs: Number(row.runs || 0),
        mapsChecked: Number(row.mapsChecked || 0),
        wrChanges: Number(row.wrChanges || 0),
        avgDurationSeconds: Number(row.avgDurationSeconds || 0),
      }));

    const nameBucketExpr = bucketMeta.expr.replace(/__ts__/g, "valid_from");
    const names = this.db
      .prepare(
        `
        SELECT
          ${nameBucketExpr} AS bucket,
          COUNT(*) AS updates
        FROM account_display_name_history
        WHERE julianday(valid_from) >= julianday('now') - (? / 24.0)
        GROUP BY bucket
        ORDER BY bucket ASC
        `
      )
      .all(safeWindowHours)
      .map((row) => ({
        bucket: row.bucket,
        updates: Number(row.updates || 0),
      }));

    return {
      bucket: bucketMeta.key,
      windowHours: safeWindowHours,
      projectKey: normalizedProjectKey || null,
      events,
      runs,
      names,
    };
  }

  listProjects({ limit = 100 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          p.project_key AS projectKey,
          p.display_name AS projectName,
          p.source_label AS sourceLabel,
          p.first_seen_at AS firstSeenAt,
          p.last_seen_at AS lastSeenAt,
          COALESCE(stats.trackedMaps, 0) AS trackedMaps,
          COALESCE(stats.totalChecks, 0) AS totalChecks,
          COALESCE(stats.totalChanges, 0) AS totalChanges,
          stats.latestCheckedAt AS latestCheckedAt,
          runs.latestRunAt AS latestRunAt
        FROM projects p
        LEFT JOIN (
          SELECT
            project_key,
            COUNT(*) AS trackedMaps,
            SUM(check_count) AS totalChecks,
            SUM(change_count) AS totalChanges,
            MAX(latest_checked_at) AS latestCheckedAt
          FROM project_maps
          GROUP BY project_key
        ) stats ON stats.project_key = p.project_key
        LEFT JOIN (
          SELECT
            project_key,
            MAX(finished_at) AS latestRunAt
          FROM ingest_runs
          GROUP BY project_key
        ) runs ON runs.project_key = p.project_key
        ORDER BY p.last_seen_at DESC
        LIMIT ?
        `
      )
      .all(Math.max(1, Math.min(Number(limit) || 100, 500)));

    return rows.map((row) => ({
      projectKey: row.projectKey,
      projectName: row.projectName,
      sourceLabel: row.sourceLabel || null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      trackedMaps: Number(row.trackedMaps || 0),
      totalChecks: Number(row.totalChecks || 0),
      totalChanges: Number(row.totalChanges || 0),
      latestCheckedAt: row.latestCheckedAt || null,
      latestRunAt: row.latestRunAt || null,
    }));
  }

  listProjectInstances(projectKey, { limit = 120 } = {}) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          project_key AS projectKey,
          instance_id AS instanceId,
          instance_name AS instanceName,
          source_label AS sourceLabel,
          status AS status,
          registered_at AS registeredAt,
          last_heartbeat_at AS lastHeartbeatAt,
          meta_json AS metaJson
        FROM project_instances
        WHERE project_key = ?
        ORDER BY last_heartbeat_at DESC
        LIMIT ?
        `
      )
      .all(normalized, Math.max(1, Math.min(Number(limit) || 120, 1000)));

    return rows.map((row) => {
      let meta = null;
      if (row.metaJson) {
        try {
          meta = JSON.parse(row.metaJson);
        } catch {
          meta = null;
        }
      }
      return {
        projectKey: row.projectKey,
        instanceId: row.instanceId,
        instanceName: row.instanceName || row.instanceId,
        sourceLabel: row.sourceLabel || null,
        status: row.status || "online",
        registeredAt: row.registeredAt,
        lastHeartbeatAt: row.lastHeartbeatAt,
        meta,
      };
    });
  }

  getProject(projectKey) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          p.project_key AS projectKey,
          p.display_name AS projectName,
          p.source_label AS sourceLabel,
          p.first_seen_at AS firstSeenAt,
          p.last_seen_at AS lastSeenAt,
          COALESCE(stats.trackedMaps, 0) AS trackedMaps,
          COALESCE(stats.totalChecks, 0) AS totalChecks,
          COALESCE(stats.totalChanges, 0) AS totalChanges,
          stats.latestCheckedAt AS latestCheckedAt,
          runs.latestRunAt AS latestRunAt
        FROM projects p
        LEFT JOIN (
          SELECT
            project_key,
            COUNT(*) AS trackedMaps,
            SUM(check_count) AS totalChecks,
            SUM(change_count) AS totalChanges,
            MAX(latest_checked_at) AS latestCheckedAt
          FROM project_maps
          GROUP BY project_key
        ) stats ON stats.project_key = p.project_key
        LEFT JOIN (
          SELECT
            project_key,
            MAX(finished_at) AS latestRunAt
          FROM ingest_runs
          GROUP BY project_key
        ) runs ON runs.project_key = p.project_key
        WHERE p.project_key = ?
        LIMIT 1
        `
      )
      .get(normalized);

    if (!row) return null;
    return {
      projectKey: row.projectKey,
      projectName: row.projectName,
      sourceLabel: row.sourceLabel || null,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      trackedMaps: Number(row.trackedMaps || 0),
      totalChecks: Number(row.totalChecks || 0),
      totalChanges: Number(row.totalChanges || 0),
      latestCheckedAt: row.latestCheckedAt || null,
      latestRunAt: row.latestRunAt || null,
    };
  }

  getProjectMaps(projectKey, { q = "", limit = 500, changedOnly = false } = {}) {
    const normalized = normalizeProjectKey(projectKey);
    if (!normalized) return [];

    const query = String(q || "").trim().toLowerCase();
    const clauses = ["pm.project_key = ?"];
    const args = [normalized];
    if (query) {
      clauses.push("(LOWER(pm.map_uid) LIKE ? OR LOWER(COALESCE(mr.map_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }
    if (changedOnly) {
      clauses.push("pm.change_count > 0");
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          pm.project_key AS projectKey,
          pm.map_uid AS mapUid,
          mr.map_name AS mapName,
          pm.latest_checked_at AS latestCheckedAt,
          pm.last_changed_at AS lastChangedAt,
          pm.wr_ms AS wrMs,
          pm.wr_holder AS wrHolder,
          pm.source AS source,
          pm.note AS note,
          pm.check_count AS checkCount,
          pm.change_count AS changeCount,
          pm.status AS status
        FROM project_maps pm
        LEFT JOIN map_registry mr ON mr.map_uid = pm.map_uid
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          COALESCE(pm.last_changed_at, '') DESC,
          COALESCE(pm.latest_checked_at, '') DESC,
          pm.map_uid ASC
        LIMIT ?
        `
      )
      .all(...args, Math.max(1, Math.min(Number(limit) || 500, 2000)));

    return rows.map((row) => ({
      projectKey: row.projectKey,
      mapUid: row.mapUid,
      mapName: row.mapName || row.mapUid,
      latestCheckedAt: row.latestCheckedAt || null,
      lastChangedAt: row.lastChangedAt || null,
      wrMs: Number(row.wrMs || 0),
      wrHolder: row.wrHolder || null,
      source: row.source || null,
      note: row.note || null,
      checkCount: Number(row.checkCount || 0),
      changeCount: Number(row.changeCount || 0),
      status: row.status || "ok",
    }));
  }

  getMapProjects(mapUid, { limit = 100 } = {}) {
    const uid = String(mapUid || "").trim();
    if (!uid) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          pm.project_key AS projectKey,
          p.display_name AS projectName,
          pm.latest_checked_at AS latestCheckedAt,
          pm.last_changed_at AS lastChangedAt,
          pm.wr_ms AS wrMs,
          pm.wr_holder AS wrHolder,
          pm.check_count AS checkCount,
          pm.change_count AS changeCount,
          pm.status AS status
        FROM project_maps pm
        JOIN projects p ON p.project_key = pm.project_key
        WHERE pm.map_uid = ?
        ORDER BY COALESCE(pm.latest_checked_at, '') DESC
        LIMIT ?
        `
      )
      .all(uid, Math.max(1, Math.min(Number(limit) || 100, 1000)));

    return rows.map((row) => ({
      projectKey: row.projectKey,
      projectName: row.projectName,
      latestCheckedAt: row.latestCheckedAt || null,
      lastChangedAt: row.lastChangedAt || null,
      wrMs: Number(row.wrMs || 0),
      wrHolder: row.wrHolder || null,
      checkCount: Number(row.checkCount || 0),
      changeCount: Number(row.changeCount || 0),
      status: row.status || "ok",
    }));
  }

  ingestDisplayNames(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const projectName = String(payload.projectName || payload.project?.name || projectKey || "display-name-tracker").trim();
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel);
    const entries = normalizeDisplayNameEntries(payload);
    if (!entries.length) {
      return { error: "No valid display-name entries provided." };
    }

    let accepted = 0;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    try {
      this.db.exec("BEGIN");

      if (projectKey) {
        this.upsertProjectSeen(projectKey, projectName, sourceLabel, receivedAt);
      }

      const upsertAccountStmt = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const getCurrentStmt = this.db.prepare(
        `
        SELECT
          display_name AS displayName,
          observed_at AS observedAt
        FROM account_display_name_current
        WHERE account_id = ?
        LIMIT 1
        `
      );

      const insertCurrentStmt = this.db.prepare(
        `
        INSERT INTO account_display_name_current (
          account_id, display_name, source, observed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = excluded.display_name,
          source = COALESCE(excluded.source, account_display_name_current.source),
          observed_at = excluded.observed_at,
          updated_at = excluded.updated_at
        `
      );

      const closeHistoryStmt = this.db.prepare(
        `
        UPDATE account_display_name_history
        SET valid_to = ?
        WHERE account_id = ? AND valid_to IS NULL
        `
      );

      const insertHistoryStmt = this.db.prepare(
        `
        INSERT OR IGNORE INTO account_display_name_history (
          account_id, display_name, source, valid_from, valid_to, observed_at
        ) VALUES (?, ?, ?, ?, NULL, ?)
        `
      );

      const insertEventStmt = this.db.prepare(
        `
        INSERT INTO aggregator_events (
          project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const entry of entries) {
        const accountId = normalizeAccountId(entry.accountId);
        const displayName = String(entry.displayName || "").trim();
        if (!accountId || !displayName) continue;
        const observedAt = toIso(entry.observedAt, receivedAt);
        const source = normalizeMaybeString(entry.source || sourceLabel);
        let previousName = null;
        let changeMarker = "no";
        let changeType = "none";

        upsertAccountStmt.run(accountId, observedAt, observedAt);
        const current = getCurrentStmt.get(accountId);
        if (current?.displayName) previousName = String(current.displayName || "").trim() || null;

        if (!current) {
          insertCurrentStmt.run(accountId, displayName, source, observedAt, receivedAt);
          insertHistoryStmt.run(accountId, displayName, source, observedAt, observedAt);
          accepted += 1;
          inserted += 1;
          changeMarker = "*";
          changeType = "new";
        } else {
          const currentName = String(current.displayName || "");
          if (currentName !== displayName) {
            closeHistoryStmt.run(observedAt, accountId);
            insertHistoryStmt.run(accountId, displayName, source, observedAt, observedAt);
            insertCurrentStmt.run(accountId, displayName, source, observedAt, receivedAt);
            accepted += 1;
            updated += 1;
            changeMarker = "yes";
            changeType = "changed";
          } else {
            insertCurrentStmt.run(accountId, displayName, source, observedAt, receivedAt);
            accepted += 1;
            unchanged += 1;
            changeMarker = "no";
            changeType = "none";
          }
        }

        insertEventStmt.run(
          projectKey || null,
          observedAt,
          "displayname.checked",
          displayName,
          accountId,
          `change:${changeMarker}`,
          source,
          JSON.stringify({
            accountId,
            displayName,
            previousDisplayName: previousName,
            changed: changeMarker !== "no",
            change: changeType,
            observedAt,
          })
        );
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: receivedAt,
        eventType: "displayname.sync",
        detail1: `accepted: ${accepted}`,
        detail2: `inserted: ${inserted}, updated: ${updated}`,
        detail3: `unchanged: ${unchanged}`,
        payload: {
          accepted,
          inserted,
          updated,
          unchanged,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      projectKey: projectKey || null,
      sourceLabel,
      accepted,
      inserted,
      updated,
      unchanged,
      receivedAt,
    };
  }

  getDisplayNames({
    accountIds = [],
    q = "",
    limit = 200,
    maxAgeSeconds = 0,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 2000));
    const normalizedIds = [...new Set(normalizeArray(accountIds).map(normalizeAccountId).filter(Boolean))];
    const queryText = String(q || "").trim().toLowerCase();

    if (normalizedIds.length) {
      const placeholders = normalizedIds.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `
          SELECT
            a.account_id AS accountId,
            c.display_name AS displayName,
            c.source AS source,
            c.observed_at AS observedAt,
            c.updated_at AS updatedAt,
            CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
          FROM accounts a
          LEFT JOIN account_display_name_current c ON c.account_id = a.account_id
          WHERE a.account_id IN (${placeholders})
          ORDER BY a.account_id ASC
          `
        )
        .all(...normalizedIds);

      return rows
        .map((row) => ({
          accountId: row.accountId,
          displayName: row.displayName || null,
          source: row.source || null,
          observedAt: row.observedAt || null,
          updatedAt: row.updatedAt || null,
          ageSeconds: Number(row.ageSeconds || 0),
          stale:
            Number(maxAgeSeconds || 0) > 0
              ? Number(row.ageSeconds || 0) > Number(maxAgeSeconds)
              : false,
          missing: !row.displayName,
        }))
        .sort((a, b) => String(a.accountId || "").localeCompare(String(b.accountId || "")));
    }

    const clauses = [];
    const args = [];
    if (queryText) {
      clauses.push("(LOWER(c.display_name) LIKE ? OR LOWER(a.account_id) LIKE ?)");
      args.push(`%${queryText}%`, `%${queryText}%`);
    }
    if (Number(maxAgeSeconds || 0) > 0) {
      clauses.push("CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) > ?");
      args.push(Number(maxAgeSeconds));
    }

    const rows = this.db
      .prepare(
        `
        SELECT
          a.account_id AS accountId,
          c.display_name AS displayName,
          c.source AS source,
          c.observed_at AS observedAt,
          c.updated_at AS updatedAt,
          CAST((julianday('now') - julianday(c.observed_at)) * 86400 AS INTEGER) AS ageSeconds
        FROM accounts a
        JOIN account_display_name_current c ON c.account_id = a.account_id
        ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY c.observed_at DESC, a.account_id ASC
        LIMIT ?
        `
      )
      .all(...args, safeLimit);

    return rows.map((row) => ({
      accountId: row.accountId,
      displayName: row.displayName || null,
      source: row.source || null,
      observedAt: row.observedAt || null,
      updatedAt: row.updatedAt || null,
      ageSeconds: Number(row.ageSeconds || 0),
      stale:
        Number(maxAgeSeconds || 0) > 0
          ? Number(row.ageSeconds || 0) > Number(maxAgeSeconds)
          : false,
      missing: false,
    }));
  }

  listDisplayNameCandidates({ staleAfterSeconds = 86400, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
    const safeStaleAfter = Math.max(0, Number(staleAfterSeconds) || 0);
    const nowMs = Date.now();
    const staleMs = safeStaleAfter * 1000;
    const parseMs = (value) => {
      const ms = Date.parse(String(value || ""));
      return Number.isFinite(ms) ? ms : 0;
    };

    const accountRows = this.db
      .prepare(
        `
        SELECT
          a.account_id AS accountId,
          a.last_seen_at AS accountLastSeenAt,
          c.observed_at AS observedAt
        FROM accounts a
        LEFT JOIN account_display_name_current c ON c.account_id = a.account_id
        `
      )
      .all();

    const metaByAccountId = new Map();
    for (const row of accountRows) {
      const accountId = normalizeAccountId(row?.accountId);
      if (!accountId) continue;
      const observedAtMs = parseMs(row?.observedAt);
      const accountLastSeenMs = parseMs(row?.accountLastSeenAt);
      metaByAccountId.set(accountId, {
        observedAtMs,
        accountLastSeenMs,
      });
    }

    const candidates = new Map();
    const addCandidate = (rawAccountId, baseScore = 0, seenAt = 0) => {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId) return;
      const meta = metaByAccountId.get(accountId) || { observedAtMs: 0, accountLastSeenMs: 0 };
      const isMissing = !meta.observedAtMs;
      const isStale = isMissing || nowMs - meta.observedAtMs > staleMs;
      if (!isStale) return;
      const existing = candidates.get(accountId) || { score: 0, lastSeenMs: 0 };
      existing.score += Number(baseScore || 0);
      existing.lastSeenMs = Math.max(existing.lastSeenMs, Number(seenAt || 0), meta.accountLastSeenMs);
      candidates.set(accountId, existing);
    };

    for (const [accountId, meta] of metaByAccountId.entries()) {
      const isMissing = !meta.observedAtMs;
      const isStale = isMissing || nowMs - meta.observedAtMs > staleMs;
      if (!isStale) continue;
      addCandidate(accountId, isMissing ? 120 : 10, meta.accountLastSeenMs);
    }

    for (const row of this.db
      .prepare(
        `
        SELECT account_id AS accountId, last_synced_at AS seenAt
        FROM club_members
        ORDER BY last_synced_at DESC
        LIMIT 8000
        `
      )
      .all()) {
      addCandidate(row?.accountId, 90, parseMs(row?.seenAt));
    }

    for (const row of this.db
      .prepare(
        `
        SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
        FROM club_campaign_maps
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        ORDER BY last_synced_at DESC
        LIMIT 12000
        `
      )
      .all()) {
      const popularityBoost = Math.min(25, Math.floor(Number(row?.playersTotal || 0) / 200));
      addCandidate(row?.accountId, 70 + popularityBoost, parseMs(row?.seenAt));
    }

    for (const row of this.db
      .prepare(
        `
        SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
        FROM club_upload_maps
        WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
        ORDER BY last_synced_at DESC
        LIMIT 12000
        `
      )
      .all()) {
      const popularityBoost = Math.min(25, Math.floor(Number(row?.playersTotal || 0) / 200));
      addCandidate(row?.accountId, 65 + popularityBoost, parseMs(row?.seenAt));
    }

    for (const row of this.db
      .prepare(
        `
        SELECT wr_holder AS accountId, latest_checked_at AS seenAt
        FROM project_maps
        WHERE NULLIF(TRIM(COALESCE(wr_holder, '')), '') IS NOT NULL
        ORDER BY latest_checked_at DESC
        LIMIT 12000
        `
      )
      .all()) {
      addCandidate(row?.accountId, 50, parseMs(row?.seenAt));
    }

    for (const row of this.db
      .prepare(
        `
        SELECT old_holder AS accountId, checked_at AS seenAt
        FROM map_events
        WHERE NULLIF(TRIM(COALESCE(old_holder, '')), '') IS NOT NULL
        ORDER BY checked_at DESC
        LIMIT 12000
        `
      )
      .all()) {
      addCandidate(row?.accountId, 45, parseMs(row?.seenAt));
    }
    for (const row of this.db
      .prepare(
        `
        SELECT new_holder AS accountId, checked_at AS seenAt
        FROM map_events
        WHERE NULLIF(TRIM(COALESCE(new_holder, '')), '') IS NOT NULL
        ORDER BY checked_at DESC
        LIMIT 12000
        `
      )
      .all()) {
      addCandidate(row?.accountId, 46, parseMs(row?.seenAt));
    }

    return [...candidates.entries()]
      .sort((a, b) => {
        const scoreDiff = Number(b[1]?.score || 0) - Number(a[1]?.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        const timeDiff = Number(b[1]?.lastSeenMs || 0) - Number(a[1]?.lastSeenMs || 0);
        if (timeDiff !== 0) return timeDiff;
        return String(a[0] || "").localeCompare(String(b[0] || ""));
      })
      .slice(0, safeLimit)
      .map((entry) => entry[0])
      .filter(Boolean);
  }

  ingestClubSnapshot(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const projectName = String(payload.projectName || payload.project?.name || projectKey || "tracker-club").trim();
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel);
    const observedAt = toIso(payload.observedAt || payload.observed_at, receivedAt);
    const club = payload.club && typeof payload.club === "object" ? payload.club : payload;
    const clubId = normalizeClubId(club.clubId || club.club_id || club.id || payload.clubId || payload.club_id);
    if (!clubId) return { error: "clubId is required." };

    const clubName = normalizeMaybeString(club.clubName || club.club_name || club.name);
    const campaigns = normalizeArray(payload.campaigns || club.campaigns);
    const uploads = normalizeArray(payload.uploads || payload.uploadBuckets || club.uploads || club.uploadBuckets);
    const members = normalizeArray(payload.members || club.members);

    let campaignsSeen = 0;
    let campaignMapsSeen = 0;
    let uploadsSeen = 0;
    let uploadMapsSeen = 0;
    let membersSeen = 0;

    try {
      this.db.exec("BEGIN");

      if (projectKey) {
        this.upsertProjectSeen(projectKey, projectName, sourceLabel, receivedAt);
      }

      this.db
        .prepare(
          `
          INSERT INTO clubs (
            club_id, club_name, source_label, first_seen_at, last_synced_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(club_id) DO UPDATE SET
            club_name = COALESCE(excluded.club_name, clubs.club_name),
            source_label = COALESCE(excluded.source_label, clubs.source_label),
            last_synced_at = excluded.last_synced_at,
            payload_json = COALESCE(excluded.payload_json, clubs.payload_json)
          `
        )
        .run(clubId, clubName, sourceLabel, observedAt, observedAt, JSON.stringify(club || {}));

      const upsertMapRegistry = this.db.prepare(
        `
        INSERT INTO map_registry (
          map_uid, map_name, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(map_uid) DO UPDATE SET
          map_name = CASE
            WHEN excluded.map_name IS NOT NULL AND excluded.map_name <> '' THEN excluded.map_name
            ELSE map_registry.map_name
          END,
          last_seen_at = excluded.last_seen_at
        `
      );
      const upsertAccount = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );

      const upsertCampaign = this.db.prepare(
        `
        INSERT INTO club_campaigns (
          club_id, campaign_id, activity_id, name, publication_ts, creation_ts, maps_count, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, campaign_id) DO UPDATE SET
          activity_id = COALESCE(excluded.activity_id, club_campaigns.activity_id),
          name = COALESCE(excluded.name, club_campaigns.name),
          publication_ts = COALESCE(excluded.publication_ts, club_campaigns.publication_ts),
          creation_ts = COALESCE(excluded.creation_ts, club_campaigns.creation_ts),
          maps_count = excluded.maps_count,
          source_label = COALESCE(excluded.source_label, club_campaigns.source_label),
          payload_json = COALESCE(excluded.payload_json, club_campaigns.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertCampaignMap = this.db.prepare(
        `
        INSERT INTO club_campaign_maps (
          club_id, campaign_id, map_uid, map_name, position, author_account_id, players_total, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, campaign_id, map_uid) DO UPDATE SET
          map_name = COALESCE(excluded.map_name, club_campaign_maps.map_name),
          position = COALESCE(excluded.position, club_campaign_maps.position),
          author_account_id = COALESCE(excluded.author_account_id, club_campaign_maps.author_account_id),
          players_total = COALESCE(excluded.players_total, club_campaign_maps.players_total),
          source_label = COALESCE(excluded.source_label, club_campaign_maps.source_label),
          payload_json = COALESCE(excluded.payload_json, club_campaign_maps.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      for (const campaign of campaigns) {
        const campaignId = clampInt(campaign?.campaignId ?? campaign?.campaign_id ?? campaign?.id, {
          min: 1,
          max: 2147483647,
          fallback: 0,
        });
        if (!campaignId) continue;
        const maps = normalizeArray(campaign?.maps || campaign?.playlist);
        upsertCampaign.run(
          clubId,
          campaignId,
          clampInt(campaign?.activityId ?? campaign?.activity_id, { min: 0, max: 2147483647, fallback: 0 }) || null,
          normalizeMaybeString(campaign?.name || campaign?.campaignName),
          clampInt(campaign?.publicationTimestamp ?? campaign?.publication_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          clampInt(campaign?.creationTimestamp ?? campaign?.creation_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          maps.length,
          sourceLabel,
          JSON.stringify(campaign || {}),
          observedAt
        );
        campaignsSeen += 1;

        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
          if (!mapUid) continue;
          const mapName = normalizeMaybeString(map?.name || map?.mapName);
          const authorAccountId = normalizeAccountId(
            map?.authorAccountId || map?.author_account_id || map?.author || map?.submitter
          );
          if (authorAccountId) upsertAccount.run(authorAccountId, observedAt, observedAt);
          upsertMapRegistry.run(mapUid, mapName, observedAt, observedAt);
          upsertCampaignMap.run(
            clubId,
            campaignId,
            mapUid,
            mapName,
            clampInt(map?.position ?? map?.slot ?? index + 1, { min: 0, max: 100000, fallback: index + 1 }),
            authorAccountId || null,
            clampInt(map?.playersTotal ?? map?.playerCount ?? map?.player_count, { min: 0, max: 2147483647, fallback: 0 }) || null,
            sourceLabel,
            JSON.stringify(map || {}),
            observedAt
          );
          campaignMapsSeen += 1;
        }
      }

      const upsertUpload = this.db.prepare(
        `
        INSERT INTO club_uploads (
          club_id, upload_id, activity_id, name, publication_ts, creation_ts, maps_count, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, upload_id) DO UPDATE SET
          activity_id = COALESCE(excluded.activity_id, club_uploads.activity_id),
          name = COALESCE(excluded.name, club_uploads.name),
          publication_ts = COALESCE(excluded.publication_ts, club_uploads.publication_ts),
          creation_ts = COALESCE(excluded.creation_ts, club_uploads.creation_ts),
          maps_count = excluded.maps_count,
          source_label = COALESCE(excluded.source_label, club_uploads.source_label),
          payload_json = COALESCE(excluded.payload_json, club_uploads.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertUploadMap = this.db.prepare(
        `
        INSERT INTO club_upload_maps (
          club_id, upload_id, map_uid, map_name, position, author_account_id, players_total, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, upload_id, map_uid) DO UPDATE SET
          map_name = COALESCE(excluded.map_name, club_upload_maps.map_name),
          position = COALESCE(excluded.position, club_upload_maps.position),
          author_account_id = COALESCE(excluded.author_account_id, club_upload_maps.author_account_id),
          players_total = COALESCE(excluded.players_total, club_upload_maps.players_total),
          source_label = COALESCE(excluded.source_label, club_upload_maps.source_label),
          payload_json = COALESCE(excluded.payload_json, club_upload_maps.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      for (const upload of uploads) {
        const uploadId = clampInt(upload?.uploadId ?? upload?.upload_id ?? upload?.bucketId ?? upload?.bucket_id ?? upload?.id, {
          min: 1,
          max: 2147483647,
          fallback: 0,
        });
        if (!uploadId) continue;
        const maps = normalizeArray(upload?.maps || upload?.mapList);
        upsertUpload.run(
          clubId,
          uploadId,
          clampInt(upload?.activityId ?? upload?.activity_id, { min: 0, max: 2147483647, fallback: 0 }) || null,
          normalizeMaybeString(upload?.name || upload?.uploadName || upload?.bucketName),
          clampInt(upload?.publicationTimestamp ?? upload?.publication_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          clampInt(upload?.creationTimestamp ?? upload?.creation_ts, { min: 0, max: 2147483647, fallback: 0 }) || null,
          maps.length,
          sourceLabel,
          JSON.stringify(upload || {}),
          observedAt
        );
        uploadsSeen += 1;

        for (let index = 0; index < maps.length; index += 1) {
          const map = maps[index] || {};
          const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
          if (!mapUid) continue;
          const mapName = normalizeMaybeString(map?.name || map?.mapName);
          const authorAccountId = normalizeAccountId(
            map?.authorAccountId || map?.author_account_id || map?.author || map?.submitter
          );
          if (authorAccountId) upsertAccount.run(authorAccountId, observedAt, observedAt);
          upsertMapRegistry.run(mapUid, mapName, observedAt, observedAt);
          upsertUploadMap.run(
            clubId,
            uploadId,
            mapUid,
            mapName,
            clampInt(map?.position ?? map?.slot ?? index + 1, { min: 0, max: 100000, fallback: index + 1 }),
            authorAccountId || null,
            clampInt(map?.playersTotal ?? map?.playerCount ?? map?.player_count, { min: 0, max: 2147483647, fallback: 0 }) || null,
            sourceLabel,
            JSON.stringify(map || {}),
            observedAt
          );
          uploadMapsSeen += 1;
        }
      }

      const upsertMember = this.db.prepare(
        `
        INSERT INTO club_members (
          club_id, account_id, role, source_label, payload_json, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(club_id, account_id) DO UPDATE SET
          role = COALESCE(excluded.role, club_members.role),
          source_label = COALESCE(excluded.source_label, club_members.source_label),
          payload_json = COALESCE(excluded.payload_json, club_members.payload_json),
          last_synced_at = excluded.last_synced_at
        `
      );

      const upsertCurrentName = this.db.prepare(
        `
        INSERT INTO account_display_name_current (
          account_id, display_name, source, observed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = excluded.display_name,
          source = COALESCE(excluded.source, account_display_name_current.source),
          observed_at = excluded.observed_at,
          updated_at = excluded.updated_at
        `
      );
      const upsertHistoryName = this.db.prepare(
        `
        INSERT OR IGNORE INTO account_display_name_history (
          account_id, display_name, source, valid_from, valid_to, observed_at
        ) VALUES (?, ?, ?, ?, NULL, ?)
        `
      );
      const closeHistoryName = this.db.prepare(
        `
        UPDATE account_display_name_history
        SET valid_to = ?
        WHERE account_id = ? AND valid_to IS NULL
        `
      );
      const getCurrentName = this.db.prepare(
        `
        SELECT display_name AS displayName
        FROM account_display_name_current
        WHERE account_id = ?
        LIMIT 1
        `
      );

      for (const member of members) {
        const accountId = normalizeAccountId(
          member?.accountId || member?.account_id || member?.id || member?.playerId
        );
        if (!accountId) continue;
        const displayName = String(
          member?.displayName || member?.display_name || member?.name || ""
        ).trim();
        upsertAccount.run(accountId, observedAt, observedAt);
        upsertMember.run(
          clubId,
          accountId,
          normalizeMaybeString(
            member?.role || member?.status || member?.memberRole || member?.member_role
          ),
          sourceLabel,
          JSON.stringify(member || {}),
          observedAt
        );
        membersSeen += 1;

        if (displayName) {
          const current = getCurrentName.get(accountId);
          if (!current || String(current.displayName || "") !== displayName) {
            closeHistoryName.run(observedAt, accountId);
            upsertHistoryName.run(accountId, displayName, sourceLabel, observedAt, observedAt);
          }
          upsertCurrentName.run(accountId, displayName, sourceLabel, observedAt, receivedAt);
        }
      }

      this.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: observedAt,
        eventType: "club.snapshot",
        detail1: `club: ${clubName || clubId}`,
        detail2: `campaigns: ${campaignsSeen}, uploads: ${uploadsSeen}, members: ${membersSeen}`,
        detail3: `maps: ${campaignMapsSeen + uploadMapsSeen}`,
        payload: {
          clubId,
          clubName,
          campaignsSeen,
          campaignMapsSeen,
          uploadsSeen,
          uploadMapsSeen,
          membersSeen,
        },
      });

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      projectKey: projectKey || null,
      sourceLabel,
      clubId,
      clubName,
      observedAt,
      campaignsSeen,
      campaignMapsSeen,
      uploadsSeen,
      uploadMapsSeen,
      membersSeen,
      receivedAt,
    };
  }

  getClubSummary(clubId) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return null;
    const row = this.db
      .prepare(
        `
        SELECT
          c.club_id AS clubId,
          c.club_name AS clubName,
          c.source_label AS sourceLabel,
          c.last_synced_at AS lastSyncedAt,
          COALESCE(campaigns.count, 0) AS campaignsCount,
          COALESCE(campaignMaps.count, 0) AS campaignMapsCount,
          COALESCE(uploads.count, 0) AS uploadsCount,
          COALESCE(uploadMaps.count, 0) AS uploadMapsCount,
          COALESCE(members.count, 0) AS membersCount
        FROM clubs c
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_campaigns GROUP BY club_id
        ) campaigns ON campaigns.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_campaign_maps GROUP BY club_id
        ) campaignMaps ON campaignMaps.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_uploads GROUP BY club_id
        ) uploads ON uploads.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_upload_maps GROUP BY club_id
        ) uploadMaps ON uploadMaps.club_id = c.club_id
        LEFT JOIN (
          SELECT club_id, COUNT(*) AS count FROM club_members GROUP BY club_id
        ) members ON members.club_id = c.club_id
        WHERE c.club_id = ?
        LIMIT 1
        `
      )
      .get(normalizedClubId);

    if (!row) return null;
    return {
      clubId: Number(row.clubId),
      clubName: row.clubName || null,
      sourceLabel: row.sourceLabel || null,
      lastSyncedAt: row.lastSyncedAt || null,
      campaignsCount: Number(row.campaignsCount || 0),
      campaignMapsCount: Number(row.campaignMapsCount || 0),
      uploadsCount: Number(row.uploadsCount || 0),
      uploadMapsCount: Number(row.uploadMapsCount || 0),
      membersCount: Number(row.membersCount || 0),
    };
  }

  getClubCampaigns(clubId, { limit = 200 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const rows = this.db
      .prepare(
        `
        SELECT
          campaign_id AS campaignId,
          activity_id AS activityId,
          name AS name,
          publication_ts AS publicationTs,
          creation_ts AS creationTs,
          maps_count AS mapsCount,
          source_label AS sourceLabel,
          last_synced_at AS lastSyncedAt
        FROM club_campaigns
        WHERE club_id = ?
        ORDER BY COALESCE(publication_ts, 0) DESC, campaign_id DESC
        LIMIT ?
        `
      )
      .all(normalizedClubId, Math.max(1, Math.min(Number(limit) || 200, 2000)));
    return rows.map((row) => ({
      campaignId: Number(row.campaignId || 0),
      activityId: row.activityId === null ? null : Number(row.activityId || 0),
      name: row.name || null,
      publicationTs: row.publicationTs === null ? null : Number(row.publicationTs || 0),
      creationTs: row.creationTs === null ? null : Number(row.creationTs || 0),
      mapsCount: Number(row.mapsCount || 0),
      sourceLabel: row.sourceLabel || null,
      lastSyncedAt: row.lastSyncedAt || null,
    }));
  }

  getClubMembers(clubId, { q = "", limit = 200 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const query = String(q || "").trim().toLowerCase();
    const clauses = ["m.club_id = ?"];
    const args = [normalizedClubId];
    if (query) {
      clauses.push("(LOWER(m.account_id) LIKE ? OR LOWER(COALESCE(c.display_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }
    const rows = this.db
      .prepare(
        `
        SELECT
          m.account_id AS accountId,
          m.role AS role,
          m.source_label AS sourceLabel,
          m.last_synced_at AS lastSyncedAt,
          c.display_name AS displayName,
          c.observed_at AS nameObservedAt
        FROM club_members m
        LEFT JOIN account_display_name_current c ON c.account_id = m.account_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY m.last_synced_at DESC, m.account_id ASC
        LIMIT ?
        `
      )
      .all(...args, Math.max(1, Math.min(Number(limit) || 200, 5000)));
    return rows.map((row) => ({
      accountId: row.accountId,
      displayName: row.displayName || null,
      role: row.role || null,
      sourceLabel: row.sourceLabel || null,
      nameObservedAt: row.nameObservedAt || null,
      lastSyncedAt: row.lastSyncedAt || null,
    }));
  }

  getClubMaps(clubId, { q = "", limit = 500 } = {}) {
    const normalizedClubId = normalizeClubId(clubId);
    if (!normalizedClubId) return [];
    const query = String(q || "").trim().toLowerCase();
    const clauses = ["club_id = ?"];
    const args = [normalizedClubId];
    if (query) {
      clauses.push("(LOWER(map_uid) LIKE ? OR LOWER(COALESCE(map_name, '')) LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }

    const campaignRows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          map_name AS mapName,
          author_account_id AS authorAccountId,
          players_total AS playersTotal,
          last_synced_at AS lastSyncedAt,
          campaign_id AS relationId,
          'campaign' AS relationType
        FROM club_campaign_maps
        WHERE ${clauses.join(" AND ")}
        `
      )
      .all(...args);

    const uploadRows = this.db
      .prepare(
        `
        SELECT
          map_uid AS mapUid,
          map_name AS mapName,
          author_account_id AS authorAccountId,
          players_total AS playersTotal,
          last_synced_at AS lastSyncedAt,
          upload_id AS relationId,
          'upload' AS relationType
        FROM club_upload_maps
        WHERE ${clauses.join(" AND ")}
        `
      )
      .all(...args);

    const merged = [...campaignRows, ...uploadRows]
      .sort((a, b) => String(b.lastSyncedAt || "").localeCompare(String(a.lastSyncedAt || "")))
      .slice(0, Math.max(1, Math.min(Number(limit) || 500, 10000)));

    return merged.map((row) => ({
      mapUid: row.mapUid,
      mapName: row.mapName || row.mapUid,
      authorAccountId: row.authorAccountId || null,
      playersTotal: row.playersTotal === null ? null : Number(row.playersTotal || 0),
      lastSyncedAt: row.lastSyncedAt || null,
      relationType: row.relationType,
      relationId: Number(row.relationId || 0),
    }));
  }

  getEventFacets({
    projectKey = "",
    includeSystem = false,
    fromIso = "",
    toIso = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const parsedFromMs = Date.parse(String(fromIso || ""));
    const parsedToMs = Date.parse(String(toIso || ""));
    const normalizedFromIso = Number.isFinite(parsedFromMs)
      ? new Date(parsedFromMs).toISOString()
      : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";

    const baseSql = `
      SELECT
        me.project_key AS projectKey,
        me.checked_at AS occurredAt,
        CASE WHEN me.changed = 1 THEN 'map.wr_changed' ELSE 'map.checked' END AS eventType,
        COALESCE(me.source, 'tracker-run') AS sourceLabel
      FROM map_events me

      UNION ALL

      SELECT
        ae.project_key AS projectKey,
        ae.occurred_at AS occurredAt,
        ae.event_type AS eventType,
        ae.source_label AS sourceLabel
      FROM aggregator_events ae
    `;

    const clauses = [];
    const args = [];
    if (queryKey) {
      clauses.push("eventSet.projectKey = ?");
      args.push(queryKey);
    }
    if (!includeSystem) {
      clauses.push("eventSet.eventType NOT LIKE 'instance.%'");
    }
    if (normalizedFromIso) {
      clauses.push("datetime(eventSet.occurredAt) >= datetime(?)");
      args.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      clauses.push("datetime(eventSet.occurredAt) <= datetime(?)");
      args.push(normalizedToIso);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = this.db
      .prepare(
        `
        SELECT
          eventSet.sourceLabel AS sourceLabel,
          eventSet.eventType AS eventType
        FROM (${baseSql}) eventSet
        ${whereSql}
        `
      )
      .all(...args);

    const sourceSet = new Set();
    const eventTypeSet = new Set();
    for (const row of rows) {
      const sourceLabel = String(row?.sourceLabel || "").trim();
      const eventType = String(row?.eventType || "").trim();
      if (sourceLabel) sourceSet.add(sourceLabel);
      if (eventType) eventTypeSet.add(eventType);
    }

    return {
      sources: [...sourceSet].sort((a, b) => a.localeCompare(b)),
      eventTypes: [...eventTypeSet].sort((a, b) => a.localeCompare(b)),
      filters: {
        projectKey: queryKey || "",
        includeSystem: Boolean(includeSystem),
        fromIso: normalizedFromIso || "",
        toIso: normalizedToIso || "",
      },
    };
  }

  getWrBaselineQueue({
    limit = 100,
    offset = 0,
    page = 1,
    status = "queued",
    projectKey = "",
    q = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;
    const safeStatus = String(status || "").trim().toLowerCase();
    const queryText = String(q || "").trim().toLowerCase();

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

  getRecentEvents({
    limit = 80,
    offset = 0,
    page = 1,
    projectKey = "",
    changedOnly = false,
    includeSystem = false,
    source = "",
    eventType = "",
    fromIso = "",
    toIso = "",
    q = "",
  } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 500));
    const requestedPage = Math.max(1, Number(page) || 1);
    const requestedOffset =
      Number(offset) > 0 ? Math.max(0, Math.floor(Number(offset))) : (requestedPage - 1) * safeLimit;

    const parsedFromMs = Date.parse(String(fromIso || ""));
    const parsedToMs = Date.parse(String(toIso || ""));
    const normalizedFromIso = Number.isFinite(parsedFromMs)
      ? new Date(parsedFromMs).toISOString()
      : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";
    const queryText = String(q || "").trim().toLowerCase();

    const baseSql = `
      SELECT
        me.event_id AS eventId,
        'map:' || me.event_id AS eventKey,
        me.project_key AS projectKey,
        p.display_name AS projectName,
        me.checked_at AS occurredAt,
        CASE WHEN me.changed = 1 THEN 'map.wr_changed' ELSE 'map.checked' END AS eventType,
        COALESCE(me.map_name, mr.map_name, me.map_uid) AS detail1,
        CASE
          WHEN me.changed = 1 THEN ('wr: ' || COALESCE(CAST(me.old_wr_time AS TEXT), '-') || ' -> ' || COALESCE(CAST(me.new_wr_time AS TEXT), '-'))
          ELSE 'wr unchanged'
        END AS detail2,
        CASE
          WHEN me.changed = 1 THEN ('holder: ' || COALESCE(me.old_holder, '-') || ' -> ' || COALESCE(me.new_holder, '-'))
          ELSE COALESCE(me.note, '')
        END AS detail3,
        COALESCE(me.source, 'tracker-run') AS sourceLabel,
        NULL AS payloadJson,
        me.map_uid AS mapUid,
        COALESCE(me.map_name, mr.map_name, me.map_uid) AS mapName,
        me.changed AS changed,
        CASE
          WHEN me.changed = 1 AND COALESCE(me.old_wr_time, 0) <= 0 THEN '*'
          WHEN me.changed = 1 THEN 'yes'
          ELSE 'no'
        END AS changedMarker,
        me.old_wr_time AS oldWrTime,
        me.new_wr_time AS newWrTime,
        me.old_holder AS oldHolder,
        me.new_holder AS newHolder,
        me.note AS note
      FROM map_events me
      LEFT JOIN projects p ON p.project_key = me.project_key
      LEFT JOIN map_registry mr ON mr.map_uid = me.map_uid

      UNION ALL

      SELECT
        ae.event_id AS eventId,
        'agg:' || ae.event_id AS eventKey,
        ae.project_key AS projectKey,
        p.display_name AS projectName,
        ae.occurred_at AS occurredAt,
        ae.event_type AS eventType,
        ae.detail_1 AS detail1,
        ae.detail_2 AS detail2,
        ae.detail_3 AS detail3,
        ae.source_label AS sourceLabel,
        ae.payload_json AS payloadJson,
        NULL AS mapUid,
        NULL AS mapName,
        0 AS changed,
        CASE
          WHEN ae.event_type = 'displayname.checked' THEN
            CASE
              WHEN LOWER(COALESCE(ae.detail_3, '')) LIKE 'change:*%' THEN '*'
              WHEN LOWER(COALESCE(ae.detail_3, '')) LIKE 'change:yes%' THEN 'yes'
              ELSE 'no'
            END
          ELSE 'no'
        END AS changedMarker,
        NULL AS oldWrTime,
        NULL AS newWrTime,
        NULL AS oldHolder,
        NULL AS newHolder,
        NULL AS note
      FROM aggregator_events ae
      LEFT JOIN projects p ON p.project_key = ae.project_key
    `;

    const clauses = [];
    const args = [];
    if (queryKey) {
      clauses.push("eventSet.projectKey = ?");
      args.push(queryKey);
    }
    if (!includeSystem) {
      clauses.push("eventSet.eventType NOT LIKE 'instance.%'");
    }
    if (changedOnly) {
      clauses.push("eventSet.changedMarker IN ('yes', '*')");
    }
    if (String(source || "").trim()) {
      clauses.push("LOWER(COALESCE(eventSet.sourceLabel, '')) = ?");
      args.push(String(source).trim().toLowerCase());
    }
    if (String(eventType || "").trim()) {
      clauses.push("LOWER(COALESCE(eventSet.eventType, '')) = ?");
      args.push(String(eventType).trim().toLowerCase());
    }
    if (normalizedFromIso) {
      clauses.push("datetime(eventSet.occurredAt) >= datetime(?)");
      args.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      clauses.push("datetime(eventSet.occurredAt) <= datetime(?)");
      args.push(normalizedToIso);
    }
    if (queryText) {
      clauses.push(
        "(" +
          [
            "LOWER(COALESCE(eventSet.detail1, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.detail2, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.detail3, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.mapName, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.mapUid, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.eventType, '')) LIKE ?",
            "LOWER(COALESCE(eventSet.projectName, '')) LIKE ?",
          ].join(" OR ") +
          ")"
      );
      for (let i = 0; i < 7; i += 1) args.push(`%${queryText}%`);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalRow =
      this.db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM (${baseSql}) eventSet
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
        SELECT *
        FROM (${baseSql}) eventSet
        ${whereSql}
        ORDER BY datetime(eventSet.occurredAt) DESC, eventSet.eventId DESC
        LIMIT ? OFFSET ?
        `
      )
      .all(...args, safeLimit, clampedOffset);

    const events = rows.map((row) => {
      let payloadObject = null;
      if (row.payloadJson) {
        try {
          payloadObject = JSON.parse(String(row.payloadJson));
        } catch {
          payloadObject = null;
        }
      }

      const detail3Text = String(row.detail3 || "").trim();
      const detail3ForEvent = detail3Text.replace(/^change:(\*|yes|no)\s*/i, "").trim();
      let changedLabel = String(row.changedMarker || "").trim().toLowerCase();
      if (!changedLabel) {
        if (payloadObject?.change === "new") changedLabel = "*";
        else if (payloadObject?.changed === true || payloadObject?.change === "changed")
          changedLabel = "yes";
        else if (Boolean(row.changed)) {
          changedLabel = Number(row.oldWrTime || 0) <= 0 ? "*" : "yes";
        } else {
          changedLabel = "no";
        }
      }
      if (changedLabel !== "*" && changedLabel !== "yes" && changedLabel !== "no") {
        changedLabel = "no";
      }

      const item =
        row.mapName ||
        row.mapUid ||
        row.detail1 ||
        payloadObject?.displayName ||
        payloadObject?.accountId ||
        "-";
      const eventDetail = [row.detail2, detail3ForEvent].filter(Boolean).join(" | ");

      return {
        eventId: Number(row.eventId || 0),
        eventKey: row.eventKey || String(row.eventId || ""),
        projectKey: row.projectKey,
        projectName: row.projectName || row.projectKey,
        occurredAt: row.occurredAt || row.checkedAt || null,
        checkedAt: row.occurredAt || row.checkedAt || null,
        eventType: row.eventType || "event",
        event: row.eventType || "event",
        detail1: row.detail1 || null,
        detail2: row.detail2 || null,
        detail3: row.detail3 || null,
        mapUid: row.mapUid,
        mapName: row.mapName || row.mapUid,
        item,
        eventDetail: eventDetail || null,
        changed: changedLabel === "yes" || changedLabel === "*",
        changedLabel,
        oldWrTime: Number(row.oldWrTime || 0),
        newWrTime: Number(row.newWrTime || 0),
        oldHolder: row.oldHolder || null,
        newHolder: row.newHolder || null,
        source: row.sourceLabel || null,
        sourceLabel: row.sourceLabel || null,
        note: row.note || null,
        payload: row.payloadJson ? String(row.payloadJson) : null,
      };
    });

    return {
      events,
      count: events.length,
      total,
      limit: safeLimit,
      offset: clampedOffset,
      page: clampedPage,
      totalPages,
      filters: {
        projectKey: queryKey || "",
        changedOnly: Boolean(changedOnly),
        includeSystem: Boolean(includeSystem),
        source: String(source || "").trim(),
        eventType: String(eventType || "").trim(),
        fromIso: normalizedFromIso || "",
        toIso: normalizedToIso || "",
        q: queryText,
      },
    };
  }
}

export { AggregatorRepository };
