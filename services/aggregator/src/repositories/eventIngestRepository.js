import { clampInt, normalizeAccountId, toIso, uniqueBy } from "../../../shared/valueUtils.js";
import {
  normalizeArray,
  normalizeInstanceId,
  normalizeMaybeString,
  normalizeProjectKey,
} from "./support/repositoryValues.js";

function eventBatch(payload) {
  if (Array.isArray(payload.events)) return payload.events;
  if (payload && typeof payload.event === "object") return [payload.event];
  if (payload && typeof payload === "object" && payload.eventType) return [payload];
  return [];
}

function normalizeChangedMarker(event) {
  const rawChanged = String(event?.changedLabel ?? event?.changed ?? event?.change ?? "")
    .trim()
    .toLowerCase();
  if (rawChanged === "*" || rawChanged === "new") return "*";
  if (["1", "true", "yes", "changed"].includes(rawChanged)) return "yes";
  return "no";
}

function normalizeIncomingEvent(event, defaults) {
  const eventType = String(event?.eventType || event?.type || "").trim();
  if (!eventType) return null;

  const projectKey = normalizeProjectKey(event?.projectKey || event?.project?.key || defaults.projectKey);
  const projectName = String(
    event?.projectName || event?.project?.name || defaults.projectName || projectKey || "event-producer"
  ).trim();
  const sourceLabel = normalizeMaybeString(
    event?.sourceLabel || event?.source || event?.project?.sourceLabel || defaults.sourceLabel
  );
  const changedMarker = normalizeChangedMarker(event);
  const existingDetail3 = String(event?.detail3 || "").trim();
  const detail3 = existingDetail3 || changedMarker ? existingDetail3 || `change:${changedMarker}` : null;
  const change = changedMarker === "*" ? "new" : changedMarker === "yes" ? "changed" : "none";
  const payloadObject = event?.payload && typeof event.payload === "object" ? { ...event.payload } : {};

  return {
    projectKey,
    projectName,
    sourceLabel,
    occurredAt: event?.occurredAt || event?.at || defaults.receivedAt,
    eventType,
    detail1: event?.detail1 || event?.item || null,
    detail2: event?.detail2 || event?.message || null,
    detail3,
    payload: {
      ...payloadObject,
      changed: changedMarker !== "no",
      change,
    },
  };
}

class EventIngestRepository {
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
    const result = this.db
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
    return Number(result?.lastInsertRowid || 0);
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
    const events = eventBatch(payload);

    if (!events.length) {
      return { error: "No valid events provided." };
    }

    let accepted = 0;
    for (const event of events) {
      const normalizedEvent = normalizeIncomingEvent(event, {
        projectKey: defaultProjectKey,
        projectName: defaultProjectName,
        sourceLabel: defaultSourceLabel,
        receivedAt,
      });
      if (!normalizedEvent) continue;
      this.appendAggregatorEvent(normalizedEvent);
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

    const projectName = String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
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
        const status = checkNote && checkNote.toLowerCase().startsWith("error:") ? "error" : "ok";

        const oldHolderAccountId = normalizeAccountId(rawCheck?.oldHolderAccountId || rawCheck?.old_holder_account_id);
        const newHolderAccountId = normalizeAccountId(rawCheck?.newHolderAccountId || rawCheck?.new_holder_account_id);
        const accountIds = uniqueBy(
          [...normalizeArray(rawCheck?.accountIds || rawCheck?.account_ids), oldHolderAccountId, newHolderAccountId]
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
    const projectName = String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const instanceName = normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
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
    const instanceName = normalizeMaybeString(payload.instanceName || payload.instance?.name) || instanceId;
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.project?.sourceLabel);
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
    const projectName = String(payload.projectName || payload.project?.name || projectKey).trim() || projectKey;

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
}

export { EventIngestRepository };
