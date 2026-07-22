import { normalizeProjectKey } from "../support/repositoryValues.js";

class EventQueryRepository {
  constructor(db) {
    this.db = db;
  }

  getEventFacets({ projectKey = "", includeSystem = false, fromIso = "", toIso = "" } = {}) {
    const queryKey = normalizeProjectKey(projectKey);
    const parsedFromMs = Date.parse(String(fromIso || ""));
    const parsedToMs = Date.parse(String(toIso || ""));
    const normalizedFromIso = Number.isFinite(parsedFromMs) ? new Date(parsedFromMs).toISOString() : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";
    const facetSampleLimit = 2000;

    const sourceSet = new Set();
    const eventTypeSet = new Set();

    const mapClauses = [];
    const mapArgs = [];
    if (queryKey) {
      mapClauses.push("project_key = ?");
      mapArgs.push(queryKey);
    }
    if (normalizedFromIso) {
      mapClauses.push("checked_at >= ?");
      mapArgs.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      mapClauses.push("checked_at <= ?");
      mapArgs.push(normalizedToIso);
    }
    const mapWhereSql = mapClauses.length ? `WHERE ${mapClauses.join(" AND ")}` : "";

    const aggregatorClauses = [];
    const aggregatorArgs = [];
    if (queryKey) {
      aggregatorClauses.push("project_key = ?");
      aggregatorArgs.push(queryKey);
    }
    if (!includeSystem) {
      aggregatorClauses.push("event_type NOT LIKE 'instance.%'");
    }
    if (normalizedFromIso) {
      aggregatorClauses.push("occurred_at >= ?");
      aggregatorArgs.push(normalizedFromIso);
    }
    if (normalizedToIso) {
      aggregatorClauses.push("occurred_at <= ?");
      aggregatorArgs.push(normalizedToIso);
    }
    const aggregatorWhereSql = aggregatorClauses.length ? `WHERE ${aggregatorClauses.join(" AND ")}` : "";

    const mapFacetRows = this.db
      .prepare(
        `
        SELECT source, changed
        FROM map_events
        ${mapWhereSql}
        ORDER BY checked_at DESC
        LIMIT ${facetSampleLimit}
        `
      )
      .all(...mapArgs);
    if (mapFacetRows.length > 0) {
      sourceSet.add("tracker-run");
    }
    for (const row of mapFacetRows) {
      if (Number(row?.changed || 0) === 1) {
        eventTypeSet.add("map.wr_changed");
      } else {
        eventTypeSet.add("map.checked");
      }
    }

    const aggregatorFacetRows = this.db
      .prepare(
        `
        SELECT source_label AS sourceLabel, event_type AS eventType
        FROM aggregator_events
        ${aggregatorWhereSql}
        ORDER BY occurred_at DESC
        LIMIT ${facetSampleLimit}
        `
      )
      .all(...aggregatorArgs);
    for (const row of aggregatorFacetRows) {
      const sourceLabel = String(row?.sourceLabel || "").trim();
      if (sourceLabel) sourceSet.add(sourceLabel);
      const eventType = String(row?.eventType || "").trim();
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
    const normalizedFromIso = Number.isFinite(parsedFromMs) ? new Date(parsedFromMs).toISOString() : "";
    const normalizedToIso = Number.isFinite(parsedToMs) ? new Date(parsedToMs).toISOString() : "";
    const queryText = String(q || "")
      .trim()
      .toLowerCase();
    const sourceFilter = String(source || "")
      .trim()
      .toLowerCase();
    const eventTypeFilter = String(eventType || "")
      .trim()
      .toLowerCase();
    const sampleLimit = Math.min(20000, Math.max(2000, requestedOffset + safeLimit * 10));

    const includeMapEvents =
      !eventTypeFilter || eventTypeFilter === "map.checked" || eventTypeFilter === "map.wr_changed";
    const includeAggregatorEvents =
      !eventTypeFilter || (eventTypeFilter !== "map.checked" && eventTypeFilter !== "map.wr_changed");

    const rows = [];

    if (includeMapEvents) {
      const mapClauses = [];
      const mapArgs = [];
      if (queryKey) {
        mapClauses.push("me.project_key = ?");
        mapArgs.push(queryKey);
      }
      if (changedOnly || eventTypeFilter === "map.wr_changed") {
        mapClauses.push("me.changed = 1");
      } else if (eventTypeFilter === "map.checked") {
        mapClauses.push("me.changed = 0");
      }
      if (sourceFilter) {
        mapClauses.push("LOWER(COALESCE(me.source, 'tracker-run')) = ?");
        mapArgs.push(sourceFilter);
      }
      if (normalizedFromIso) {
        mapClauses.push("me.checked_at >= ?");
        mapArgs.push(normalizedFromIso);
      }
      if (normalizedToIso) {
        mapClauses.push("me.checked_at <= ?");
        mapArgs.push(normalizedToIso);
      }
      const mapWhereSql = mapClauses.length ? `WHERE ${mapClauses.join(" AND ")}` : "";
      const mapRows = this.db
        .prepare(
          `
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
          ${mapWhereSql}
          ORDER BY me.checked_at DESC, me.event_id DESC
          LIMIT ?
          `
        )
        .all(...mapArgs, sampleLimit);
      rows.push(...mapRows);
    }

    if (includeAggregatorEvents) {
      const aggregatorClauses = [];
      const aggregatorArgs = [];
      if (queryKey) {
        aggregatorClauses.push("ae.project_key = ?");
        aggregatorArgs.push(queryKey);
      }
      if (!includeSystem) {
        aggregatorClauses.push("ae.event_type NOT LIKE 'instance.%'");
      }
      if (sourceFilter) {
        aggregatorClauses.push("LOWER(COALESCE(ae.source_label, '')) = ?");
        aggregatorArgs.push(sourceFilter);
      }
      if (eventTypeFilter) {
        aggregatorClauses.push("LOWER(ae.event_type) = ?");
        aggregatorArgs.push(eventTypeFilter);
      }
      if (normalizedFromIso) {
        aggregatorClauses.push("ae.occurred_at >= ?");
        aggregatorArgs.push(normalizedFromIso);
      }
      if (normalizedToIso) {
        aggregatorClauses.push("ae.occurred_at <= ?");
        aggregatorArgs.push(normalizedToIso);
      }
      const aggregatorWhereSql = aggregatorClauses.length ? `WHERE ${aggregatorClauses.join(" AND ")}` : "";
      const aggregatorRows = this.db
        .prepare(
          `
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
          ${aggregatorWhereSql}
          ORDER BY ae.occurred_at DESC, ae.event_id DESC
          LIMIT ?
          `
        )
        .all(...aggregatorArgs, sampleLimit);
      rows.push(...aggregatorRows);
    }

    const mappedEvents = rows.map((row) => {
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
      let changedLabel = String(row.changedMarker || "")
        .trim()
        .toLowerCase();
      if (!changedLabel) {
        if (payloadObject?.change === "new") changedLabel = "*";
        else if (payloadObject?.changed === true || payloadObject?.change === "changed") changedLabel = "yes";
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
        row.mapName || row.mapUid || row.detail1 || payloadObject?.displayName || payloadObject?.accountId || "-";
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

    const filteredEvents = mappedEvents
      .filter((event) => {
        if (changedOnly && !event.changed) return false;
        if (!queryText) return true;
        return [
          event.detail1,
          event.detail2,
          event.detail3,
          event.mapName,
          event.mapUid,
          event.eventType,
          event.projectName,
          event.item,
          event.eventDetail,
          event.sourceLabel,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(queryText)
        );
      })
      .sort((a, b) => {
        const timeCompare = String(b.occurredAt || "").localeCompare(String(a.occurredAt || ""));
        if (timeCompare !== 0) return timeCompare;
        return Number(b.eventId || 0) - Number(a.eventId || 0);
      });

    const total = filteredEvents.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const clampedPage = Math.max(1, Math.min(requestedPage, totalPages));
    const clampedOffset = Math.max(0, (clampedPage - 1) * safeLimit);
    const events = filteredEvents.slice(clampedOffset, clampedOffset + safeLimit);

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

export { EventQueryRepository };
