import {
  buildEvent,
  normalizeIso,
  sortEvents,
  summarizeDiscovery,
  summarizeDisplayname,
  summarizeHookRun,
  toText,
} from "./routeUtils.js";

function appendMonitoringSummaryEvents(events, monitor, mapperNameSync) {
  if (monitor.lastDiscoverySummary || monitor.lastDiscoveryError) {
    events.push(
      buildEvent({
        id: `discovery:${monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt || "latest"}`,
        kind: "job",
        title: monitor.lastDiscoveryError ? "Discovery sync failed" : "Discovery sync completed",
        subtitle: "Altered club discovery",
        createdAt: monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt,
        jobKey: "club-discovery-sync",
        status: monitor.lastDiscoveryError ? "warn" : "success",
        summary: summarizeDiscovery(monitor),
        detail: monitor.lastDiscoveryError || null,
      })
    );
  }

  if (mapperNameSync.lastSummary || mapperNameSync.lastError) {
    events.push(
      buildEvent({
        id: `displayname:${mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt || "latest"}`,
        kind: "job",
        title: mapperNameSync.lastError ? "Display-name sync failed" : "Display-name sync completed",
        subtitle: "Mapper account resolver",
        createdAt: mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt,
        jobKey: "displayname-sync",
        status: mapperNameSync.lastError ? "warn" : "success",
        summary: summarizeDisplayname(mapperNameSync),
        detail: mapperNameSync.lastError || null,
      })
    );
  }
}

function buildAlerts({ liveStatus, hook, trackerStatus, namingSummary, updateRequests, opsOverview, opsEvents }) {
  const alerts = [];
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  const integrations = liveStatus?.integrations || {};
  const counts = opsOverview?.counts || {};
  const pendingNaming = Number(namingSummary?.pendingManualReview || namingSummary?.pending || 0);
  const queuedRequests = (Array.isArray(updateRequests) ? updateRequests : []).filter(
    (request) => String(request?.status || "").toLowerCase() === "queued"
  ).length;
  const pollErrors = (Array.isArray(opsEvents) ? opsEvents : []).filter((event) => event?.error).length;

  if (!liveStatus?.configured) {
    alerts.push({
      id: "live-auth-missing",
      level: "error",
      title: "Live auth is missing",
      body: liveStatus?.authAdvice || "Configure Altered live auth before running club syncs.",
      source: "club monitor",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (!hook?.enabled) {
    alerts.push({
      id: "hook-disabled",
      level: "warn",
      title: "Hook is disabled",
      body: "Tracker hook sync is disabled for altered-club.",
      source: "hook",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (monitor.lastError) {
    alerts.push({
      id: "full-sync-error",
      level: "error",
      title: "Last full sync failed",
      body: monitor.lastError,
      source: "club full sync",
      createdAt: normalizeIso(monitor.lastFinishedAt || monitor.lastStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (monitor.lastDiscoveryError) {
    alerts.push({
      id: "discovery-error",
      level: "warn",
      title: "Last discovery sync failed",
      body: monitor.lastDiscoveryError,
      source: "discovery sync",
      createdAt:
        normalizeIso(monitor.lastDiscoveryFinishedAt || monitor.lastDiscoveryStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (mapperNameSync.lastError) {
    alerts.push({
      id: "displayname-error",
      level: "warn",
      title: "Display-name sync needs attention",
      body: mapperNameSync.lastError,
      source: "displayname sync",
      createdAt:
        normalizeIso(mapperNameSync.lastFinishedAt || mapperNameSync.lastStartedAt) || new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (integrations?.trackerDisplayname?.enabled && !integrations?.trackerDisplayname?.relayAvailable) {
    alerts.push({
      id: "displayname-relay-unavailable",
      level: "warn",
      title: "Displayname relay is unavailable",
      body: integrations?.trackerDisplayname?.lastRelayError || "Tracker displayname relay is not currently available.",
      source: "integration",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Advanced",
      actionTarget: "#advanced",
    });
  }
  if (trackerStatus?.error) {
    alerts.push({
      id: "tracker-status-error",
      level: "warn",
      title: "Tracker status is unavailable",
      body: trackerStatus.error,
      source: "tracker",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Sync Center",
      actionTarget: "#sync",
    });
  }
  if (opsOverview?.scheduler?.lastError) {
    alerts.push({
      id: "ops-scheduler-error",
      level: "error",
      title: "Ops scheduler failed recently",
      body: opsOverview.scheduler.lastError,
      source: "ops scheduler",
      createdAt:
        normalizeIso(opsOverview.scheduler.lastFinishedAt || opsOverview.scheduler.lastStartedAt) ||
        new Date().toISOString(),
      actionLabel: "Open Settings",
      actionTarget: "#settings",
    });
  }
  if (pendingNaming > 0) {
    alerts.push({
      id: "naming-backlog",
      level: "info",
      title: "Naming review backlog",
      body: `${pendingNaming} map names still need manual review.`,
      source: "naming review",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Maps",
      actionTarget: "#maps?view=naming",
    });
  }
  if (queuedRequests > 0) {
    alerts.push({
      id: "update-requests",
      level: "info",
      title: "Pending update requests",
      body: `${queuedRequests} update requests are still queued.`,
      source: "update requests",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Maps",
      actionTarget: "#maps?view=requests",
    });
  }
  if (pollErrors > 0 || Number(counts.queuedBotCommands || 0) > 0) {
    alerts.push({
      id: "ops-backlog",
      level: pollErrors > 0 ? "warn" : "info",
      title: "Operational backlog detected",
      body: `${pollErrors} recent poll errors | ${Number(counts.queuedBotCommands || 0)} queued bot commands`,
      source: "ops",
      createdAt: new Date().toISOString(),
      actionLabel: "Open Operations",
      actionTarget: "#operations",
    });
  }

  return alerts;
}

function buildRecentEvents({ hookRuns, opsRuns, opsEvents, trackerRuns, liveStatus }) {
  const monitor = liveStatus?.monitor || {};
  const mapperNameSync = liveStatus?.mapperNameSync || {};
  const events = [];

  (Array.isArray(hookRuns) ? hookRuns.slice(0, 4) : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `hook-run:${run.runId}`,
        kind: "job",
        title: "Club full sync completed",
        subtitle: "Altered club snapshot",
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "club-full-sync",
        status: String(run.status || "").toLowerCase() === "error" ? "error" : "success",
        summary: summarizeHookRun(run),
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0),
          campaignsSeen: Number(run.campaignsSeen || 0),
          mapsSeen: Number(run.mapsSeen || 0),
        },
      })
    );
  });

  (Array.isArray(opsRuns) ? opsRuns.slice(0, 4) : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `ops-run:${run.runId}`,
        kind: "poll-run",
        title: "Ops poll run completed",
        subtitle: `Schedule ${run.scheduleId || "-"}`,
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "ops-scheduler",
        status: String(run.status || "").toLowerCase() === "ok" ? "success" : "warn",
        summary: `${Number(run.mapsChecked || run.mapsTotal || 0)} maps checked | ${Number(run.mapsChanged || 0)} changed`,
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0),
          scheduleId: Number(run.scheduleId || 0) || null,
          userId: Number(run.userId || 0) || null,
        },
      })
    );
  });

  (Array.isArray(opsEvents) ? opsEvents.slice(0, 6) : []).forEach((event) => {
    const hasError = Boolean(event?.error);
    const changed = Boolean(event?.changed || event?.wrChanged);
    events.push(
      buildEvent({
        id: `ops-event:${event.eventId || event.runId || event.mapUid || Math.random()}`,
        kind: hasError ? "error" : changed ? "wr-change" : "scheduler",
        title: hasError ? "Map check failed" : changed ? "WR changed" : "Map checked",
        subtitle: toText(event.mapName || event.mapUid) || "Unknown map",
        createdAt: event.checkedAt || event.createdAt,
        mapUid: event.mapUid,
        status: hasError ? "error" : changed ? "success" : "info",
        summary: hasError
          ? toText(event.error)
          : changed
            ? `${Number(event.oldWrMs || 0)} -> ${Number(event.newWrMs || 0)}`
            : "No WR change recorded",
        detail: hasError ? toText(event.error) : null,
        meta: {
          runId: Number(event.runId || 0) || null,
          scheduleId: Number(event.scheduleId || 0) || null,
          userId: Number(event.userId || 0) || null,
        },
      })
    );
  });

  (Array.isArray(trackerRuns) ? trackerRuns.slice(0, 2) : []).forEach((run, index) => {
    events.push(
      buildEvent({
        id: `tracker-run:${run.runId || index + 1}`,
        kind: "job",
        title: "Tracker push completed",
        subtitle: "WR tracker",
        createdAt: run.finishedAt,
        jobKey: "tracker-run",
        status: "success",
        summary: `${Number(run.mapsChecked || 0)} maps checked | ${Number(run.wrChanges || 0)} WR changes`,
        detail: toText(run.reason) || null,
        meta: {
          runId: Number(run.runId || 0) || null,
        },
      })
    );
  });

  appendMonitoringSummaryEvents(events, monitor, mapperNameSync);

  return sortEvents(events).slice(0, 14);
}

function buildOperationsFeedPayload({ context, kind = "all", mapUid = "", jobKey = "", cursor = 0, limit = 50 }) {
  const monitor = context.liveStatus?.monitor || {};
  const mapperNameSync = context.liveStatus?.mapperNameSync || {};
  const events = [];

  (Array.isArray(context.hookRuns) ? context.hookRuns : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `hook-run:${run.runId}`,
        kind: "job",
        title:
          String(run.status || "").toLowerCase() === "error" ? "Club full sync failed" : "Club full sync completed",
        subtitle: "Altered club snapshot",
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "club-full-sync",
        status: String(run.status || "").toLowerCase() === "error" ? "error" : "success",
        summary: summarizeHookRun(run),
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0) || null,
          campaignsSeen: Number(run.campaignsSeen || 0),
          mapsSeen: Number(run.mapsSeen || 0),
          mapsInserted: Number(run.mapsInserted || 0),
          mapsUpdated: Number(run.mapsUpdated || 0),
        },
      })
    );
  });

  (Array.isArray(context.opsRuns) ? context.opsRuns : []).forEach((run) => {
    events.push(
      buildEvent({
        id: `ops-run:${run.runId || run.finishedAt || run.startedAt || "latest"}`,
        kind: "poll-run",
        title: String(run.status || "").toLowerCase() === "ok" ? "Ops poll run completed" : "Ops poll run failed",
        subtitle: `Schedule ${run.scheduleId || "-"}`,
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "ops-scheduler",
        status: String(run.status || "").toLowerCase() === "ok" ? "success" : "error",
        summary: `${Number(run.mapsChecked || run.mapsTotal || 0)} maps checked | ${Number(run.mapsChanged || 0)} changed`,
        detail: toText(run.note) || null,
        meta: {
          runId: Number(run.runId || 0) || null,
          scheduleId: Number(run.scheduleId || 0) || null,
          userId: Number(run.userId || 0) || null,
        },
      })
    );
  });

  (Array.isArray(context.opsEvents) ? context.opsEvents : []).forEach((event) => {
    const hasError = Boolean(event?.error);
    const changed = Boolean(event?.changed || event?.wrChanged);
    events.push(
      buildEvent({
        id: `ops-event:${event.eventId || event.runId || event.mapUid || Math.random()}`,
        kind: hasError ? "error" : changed ? "wr-change" : "scheduler",
        title: hasError ? "Map check failed" : changed ? "WR changed" : "Map checked",
        subtitle: toText(event.mapName || event.mapUid) || "Unknown map",
        createdAt: event.checkedAt || event.createdAt,
        mapUid: event.mapUid,
        jobKey: "ops-scheduler",
        status: hasError ? "error" : changed ? "success" : "info",
        summary: hasError
          ? toText(event.error)
          : changed
            ? `${Number(event.oldWrMs || 0)} -> ${Number(event.newWrMs || 0)}`
            : "No WR change recorded",
        detail: hasError ? toText(event.error) : null,
        meta: {
          runId: Number(event.runId || 0) || null,
          scheduleId: Number(event.scheduleId || 0) || null,
          userId: Number(event.userId || 0) || null,
          oldWrHolder: toText(event.oldWrHolder) || null,
          newWrHolder: toText(event.newWrHolder) || null,
        },
      })
    );
  });

  (Array.isArray(context.trackerRuns) ? context.trackerRuns : []).forEach((run, index) => {
    events.push(
      buildEvent({
        id: `tracker-run:${run.runId || index + 1}`,
        kind: "job",
        title: "Tracker push completed",
        subtitle: "WR tracker",
        createdAt: run.finishedAt || run.startedAt,
        jobKey: "tracker-run",
        status: "success",
        summary: `${Number(run.mapsChecked || 0)} maps checked | ${Number(run.wrChanges || 0)} WR changes`,
        detail: toText(run.reason) || null,
        meta: {
          runId: Number(run.runId || 0) || null,
        },
      })
    );
  });

  appendMonitoringSummaryEvents(events, monitor, mapperNameSync);

  const safeMapUid = toText(mapUid).toLowerCase();
  const safeJobKey = toText(jobKey).toLowerCase();
  const safeKind = toText(kind, "all").toLowerCase();
  const filtered = sortEvents(events).filter((event) => {
    if (safeMapUid) {
      const candidate = toText(event.mapUid).toLowerCase();
      if (!candidate || candidate !== safeMapUid) return false;
    }
    if (safeJobKey) {
      const candidate = toText(event.jobKey).toLowerCase();
      if (!candidate || candidate !== safeJobKey) return false;
    }
    if (safeKind === "all" || !safeKind) return true;
    if (safeKind === "error") return event.kind === "error" || event.status === "error";
    if (safeKind === "scheduler") return event.kind === "scheduler" || event.jobKey === "ops-scheduler";
    return event.kind === safeKind;
  });
  const pageItems = filtered.slice(cursor, cursor + limit);
  const hasMore = cursor + pageItems.length < filtered.length;
  return {
    generatedAt: context.generatedAt,
    kind: safeKind || "all",
    mapUid: safeMapUid || null,
    jobKey: safeJobKey || null,
    total: filtered.length,
    cursor,
    limit,
    hasMore,
    nextCursor: hasMore ? cursor + pageItems.length : null,
    events: pageItems,
  };
}
export { appendMonitoringSummaryEvents, buildAlerts, buildOperationsFeedPayload, buildRecentEvents };
