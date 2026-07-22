import { clampInt } from "../../../../shared/valueUtils.js";
import { normalizeMaybeString, normalizeProjectKey } from "../support/repositoryValues.js";
import { normalizeTrafficSample, parseTrafficRow } from "./trafficNormalization.js";

class TrafficIngestionRepository {
  constructor(db, { eventsRepository, support }) {
    this.db = db;
    this.eventsRepository = eventsRepository;
    this.support = support;
  }

  insertTrafficSampleRecord(eventId, sample = {}) {
    const safeEventId = clampInt(eventId, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    if (!safeEventId) return 0;
    const normalized = normalizeTrafficSample(sample, {
      projectKey: sample?.projectKey,
      sourceLabel: sample?.sourceLabel,
      occurredAt: sample?.occurredAt,
    });
    const result = this.db
      .prepare(
        `
        INSERT OR IGNORE INTO traffic_http_samples (
          event_id,
          project_key,
          source_label,
          direction,
          service,
          component,
          method,
          route,
          target_host,
          target_path,
          status_code,
          status_group,
          duration_ms,
          bytes_in,
          bytes_out,
          occurred_at,
          is_nadeo_outgoing,
          is_internal_outgoing
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        safeEventId,
        normalized.projectKey,
        normalized.sourceLabel,
        normalized.direction,
        normalized.service,
        normalized.component,
        normalized.method,
        normalized.route,
        normalized.targetHost || null,
        normalized.targetPath,
        normalized.statusCode,
        normalized.statusGroup,
        normalized.durationMs,
        Math.floor(normalized.bytesIn),
        Math.floor(normalized.bytesOut),
        normalized.occurredAt,
        normalized.isNadeoOutgoing ? 1 : 0,
        normalized.isInternalOutgoing ? 1 : 0
      );
    return Number(result?.changes || 0);
  }

  backfillTrafficSamples({ batchSize = 5000, maxBatches = 500 } = {}) {
    const safeBatchSize = clampInt(batchSize, { min: 100, max: 50000, fallback: 5000 });
    const safeMaxBatches = clampInt(maxBatches, { min: 1, max: 50000, fallback: 500 });
    const selectStmt = this.db.prepare(
      `
      SELECT
        ae.event_id AS eventId,
        ae.project_key AS projectKey,
        ae.source_label AS sourceLabel,
        ae.occurred_at AS occurredAt,
        ae.payload_json AS payloadJson
      FROM aggregator_events ae
      LEFT JOIN traffic_http_samples ths ON ths.event_id = ae.event_id
      WHERE ae.event_type = 'traffic.http' AND ths.event_id IS NULL
      ORDER BY ae.event_id ASC
      LIMIT ?
      `
    );

    let inserted = 0;
    for (let batchIndex = 0; batchIndex < safeMaxBatches; batchIndex += 1) {
      const rows = selectStmt.all(safeBatchSize);
      if (!rows.length) break;
      this.db.exec("BEGIN");
      try {
        for (const row of rows) {
          const normalized = parseTrafficRow({
            project_key: row.projectKey,
            source_label: row.sourceLabel,
            occurred_at: row.occurredAt,
            payload_json: row.payloadJson,
          });
          inserted += this.insertTrafficSampleRecord(row.eventId, normalized);
        }
        this.db.exec("COMMIT");
      } catch (error) {
        try {
          this.db.exec("ROLLBACK");
        } catch {}
        throw error;
      }
      if (rows.length < safeBatchSize) break;
    }
    if (inserted > 0) this.support.bumpTrafficCacheVersion();
    return { inserted };
  }

  ingestTraffic(payload = {}) {
    const receivedAt = new Date().toISOString();
    const defaultProjectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const defaultProjectName = String(
      payload.projectName || payload.project?.name || defaultProjectKey || "traffic-producer"
    ).trim();
    const defaultSourceLabel = normalizeMaybeString(
      payload.sourceLabel || payload.source || payload.project?.sourceLabel
    );
    const defaultService = String(payload.service || payload.component || "tracker").trim() || "tracker";

    const samples = Array.isArray(payload.samples)
      ? payload.samples
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.events)
          ? payload.events
          : payload && typeof payload.sample === "object"
            ? [payload.sample]
            : payload &&
                typeof payload === "object" &&
                (payload.direction || payload.method || payload.route || payload.targetHost)
              ? [payload]
              : [];

    if (!samples.length) {
      return { error: "No traffic samples provided." };
    }

    let accepted = 0;
    try {
      this.db.exec("BEGIN");
      for (const sample of samples) {
        const projectKey = normalizeProjectKey(sample?.projectKey || sample?.project?.key || defaultProjectKey);
        const projectName = String(
          sample?.projectName || sample?.project?.name || defaultProjectName || projectKey || "traffic-producer"
        ).trim();
        const normalized = normalizeTrafficSample(sample, {
          projectKey,
          sourceLabel:
            sample?.sourceLabel ||
            sample?.source ||
            sample?.project?.sourceLabel ||
            defaultSourceLabel ||
            defaultService,
          occurredAt: receivedAt,
        });
        const sourceLabel = normalizeMaybeString(normalized.sourceLabel);

        const eventId = this.eventsRepository.appendAggregatorEvent({
          projectKey,
          projectName,
          sourceLabel,
          occurredAt: normalized.occurredAt,
          eventType: "traffic.http",
          detail1: `${normalized.direction}:${normalized.service}`,
          detail2: `${normalized.method} ${normalized.route}`,
          detail3: `${normalized.statusCode || 0} ${Math.round(normalized.durationMs)}ms`,
          payload: {
            direction: normalized.direction,
            service: normalized.service,
            component: normalized.component,
            method: normalized.method,
            route: normalized.route,
            targetHost: normalized.targetHost,
            targetPath: normalized.targetPath,
            statusCode: normalized.statusCode,
            durationMs: normalized.durationMs,
            bytesIn: normalized.bytesIn,
            bytesOut: normalized.bytesOut,
            occurredAt: normalized.occurredAt,
            projectKey: normalized.projectKey || null,
            sourceLabel: sourceLabel || null,
          },
        });
        if (eventId) {
          this.insertTrafficSampleRecord(eventId, normalized);
        }
        accepted += 1;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    if (!accepted) {
      return { error: "No traffic samples were accepted." };
    }
    this.support.bumpTrafficCacheVersion();

    return {
      projectKey: defaultProjectKey || null,
      sourceLabel: defaultSourceLabel,
      accepted,
      receivedAt,
    };
  }
}

export { TrafficIngestionRepository };
