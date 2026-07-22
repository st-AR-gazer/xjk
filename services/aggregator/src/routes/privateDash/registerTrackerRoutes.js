import { clampInt } from "../../../../shared/valueUtils.js";
import { upstreamErrorStatus } from "./routeSupport.js";

function prioritySummary(controller) {
  const { snapshot, meta } = controller.getPriorityState();
  return {
    active: Boolean(meta?.active),
    restoreAvailable: Boolean(snapshot),
    target: meta?.targetKey || null,
    updatedAt: meta?.updatedAt || null,
    lastError: meta?.lastError || null,
    rollbackErrors: Array.isArray(meta?.rollbackErrors) ? meta.rollbackErrors : [],
  };
}

function registerStatusRoutes(router, repository, controller) {
  router.get("/trackers/status", async (_req, res) => {
    await controller.ensurePriorityStateLoaded();
    const statusSnapshot = repository.getTrackerStatusSnapshots();
    return res.json({
      generatedAt: new Date().toISOString(),
      trackers: statusSnapshot.trackers || {},
      source: statusSnapshot.source || "database",
      priority: prioritySummary(controller),
    });
  });

  router.get("/trackers/status-probe", async (req, res) => {
    const requestedMode = String(req.query.mode || "all")
      .trim()
      .toLowerCase();
    const mode = requestedMode === "local" || requestedMode === "configured" ? requestedMode : "all";
    const timeoutMs = clampInt(req.query.timeout_ms, { min: 1000, max: 15000, fallback: 10000 });
    const concurrency = clampInt(req.query.concurrency, { min: 1, max: 12, fallback: 4 });
    const probes = await controller.probeTrackers({ mode, timeoutMs, concurrency });
    const failed = probes.filter((item) => !item.ok);
    return res.json({
      generatedAt: new Date().toISOString(),
      mode,
      timeoutMs,
      concurrency,
      source: "live-route-probe",
      probes,
      summary: { total: probes.length, ok: probes.length - failed.length, failed: failed.length },
    });
  });
}

function registerControlRoute(router, controller) {
  router.post("/trackers/control", async (req, res) => {
    const body = req.body || {};
    const trackerKey = String(body.tracker || "")
      .trim()
      .toLowerCase();
    const action = String(body.action || "")
      .trim()
      .toLowerCase();
    const tracker = controller.getTracker(trackerKey);

    if (!tracker) {
      return res.status(400).json({ error: "Unknown tracker. Use wr, leaderboard, displayname, or club." });
    }
    if (!tracker.baseUrl) return res.status(400).json({ error: `Tracker '${trackerKey}' is not configured.` });

    try {
      if (action !== "run-now" && action !== "enable" && action !== "disable" && action !== "set") {
        return res.status(400).json({ error: "Unsupported action. Use run-now, enable, disable, or set." });
      }
      const result = await controller.sendControlRequest(tracker, action, body.payload);
      return res.json({
        ok: true,
        tracker: trackerKey,
        action,
        result,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(upstreamErrorStatus(error)).json({
        error: error?.message || "Tracker control request failed.",
      });
    }
  });
}

async function restorePriority(controller, res) {
  await controller.ensurePriorityStateLoaded();
  const { snapshot, meta } = controller.getPriorityState();
  if (!snapshot) {
    return res.status(400).json({ error: "No saved tracker snapshot yet. Apply priority once before restore." });
  }

  const restoreResult = await controller.restorePrioritySnapshot(snapshot);
  const statusResults = await controller.fetchAllStatuses();
  if (restoreResult.ok) {
    controller.setPriorityState({
      snapshot: null,
      meta: {
        active: false,
        targetKey: null,
        updatedAt: new Date().toISOString(),
        lastError: null,
        rollbackErrors: [],
      },
    });
    await controller.persistPriorityState();
    return res.json({
      ok: true,
      action: "restore",
      generatedAt: new Date().toISOString(),
      trackers: statusResults,
      priority: { active: false, restoreAvailable: false },
    });
  }

  controller.setPriorityState({
    snapshot,
    meta: {
      active: false,
      targetKey: meta?.targetKey || null,
      updatedAt: new Date().toISOString(),
      lastError: "Restore failed.",
      rollbackErrors: restoreResult.errors || [],
    },
  });
  await controller.persistPriorityState();
  return res.status(502).json({
    error: "Tracker restore failed.",
    details: restoreResult.errors || [],
    generatedAt: new Date().toISOString(),
    trackers: statusResults,
    priority: {
      active: false,
      restoreAvailable: true,
      rollbackErrors: restoreResult.errors || [],
    },
  });
}

function validatePriorityTarget(targetKey, targetTracker, statusResults, pauseOthers) {
  const targetStatus = statusResults[targetKey];
  if (!targetStatus?.configured || !targetStatus?.ok) {
    return {
      error: `Tracker '${targetKey}' must have a healthy status response before priority mode can be applied safely.`,
    };
  }
  if (pauseOthers) {
    const unhealthyPeers = Object.entries(statusResults)
      .filter(([key, entry]) => key !== targetKey && entry?.configured && !entry?.ok)
      .map(([key]) => key);
    if (unhealthyPeers.length) {
      return {
        error: `Cannot apply priority mode safely while tracker status is unavailable for: ${unhealthyPeers.join(", ")}.`,
      };
    }
  }
  return { targetTracker };
}

async function configurePriorityTarget(controller, targetKey, targetTracker, intervalSeconds) {
  if (targetKey === "wr" || targetKey === "leaderboard") {
    await controller.sendControlRequest(targetTracker, "set", { enabled: true, tickSeconds: intervalSeconds });
    await controller.sendControlRequest(targetTracker, "run-now", {});
    return;
  }
  if (targetKey === "displayname") {
    await controller.sendControlRequest(targetTracker, "set", {
      enabled: true,
      schedulerEnabled: true,
      maintenanceIntervalSeconds: intervalSeconds,
      minRequestGapMs: intervalSeconds * 1000,
    });
    await controller.sendControlRequest(targetTracker, "run-now", {
      forceCandidates: true,
      prioritizeAccountIds: true,
    });
    return;
  }
  if (targetKey === "club") await controller.sendControlRequest(targetTracker, "enable", {});
}

async function pausePeerTrackers(controller, targetKey, snapshot) {
  for (const key of ["wr", "leaderboard", "displayname", "club"]) {
    if (key === targetKey || !snapshot?.[key]?.configured) continue;
    await controller.sendControlRequest(controller.getTracker(key), "disable", {});
  }
}

async function priorityFailureResponse(controller, res, { error, snapshot, targetKey, intervalSeconds, pauseOthers }) {
  const restoreResult = await controller.restorePrioritySnapshot(snapshot);
  const trackers = await controller.fetchAllStatuses();
  if (restoreResult.ok) {
    controller.setPriorityState({
      snapshot: null,
      meta: {
        active: false,
        targetKey,
        intervalSeconds,
        pauseOthers,
        updatedAt: new Date().toISOString(),
        lastError: error?.message || "Priority mode failed.",
        rollbackErrors: [],
      },
    });
    await controller.persistPriorityState();
    return res.status(502).json({
      error: error?.message || "Priority mode failed.",
      rollback: "restored",
      generatedAt: new Date().toISOString(),
      trackers,
      priority: { active: false, restoreAvailable: false },
    });
  }

  controller.setPriorityState({
    snapshot,
    meta: {
      active: false,
      targetKey,
      intervalSeconds,
      pauseOthers,
      updatedAt: new Date().toISOString(),
      lastError: error?.message || "Priority mode failed.",
      rollbackErrors: restoreResult.errors || [],
    },
  });
  await controller.persistPriorityState();
  return res.status(502).json({
    error: error?.message || "Priority mode failed.",
    rollback: "failed",
    rollbackErrors: restoreResult.errors || [],
    generatedAt: new Date().toISOString(),
    trackers,
    priority: {
      active: false,
      restoreAvailable: true,
      rollbackErrors: restoreResult.errors || [],
    },
  });
}

async function applyPriority(controller, req, res) {
  const body = req.body || {};
  const targetKey = String(body.target || "")
    .trim()
    .toLowerCase();
  const intervalSeconds = clampInt(body.intervalSeconds, { min: 3, max: 3600, fallback: 3 });
  const pauseOthers = body.pauseOthers === undefined ? true : Boolean(body.pauseOthers);
  const targetTracker = controller.getTracker(targetKey);
  if (!targetTracker) {
    return res.status(400).json({
      error: "Unknown tracker target. Use wr, leaderboard, displayname, or club.",
    });
  }
  const statusResults = await controller.fetchAllStatuses();
  const validation = validatePriorityTarget(targetKey, targetTracker, statusResults, pauseOthers);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const snapshot = controller.buildPrioritySnapshot(statusResults);
  try {
    await configurePriorityTarget(controller, targetKey, validation.targetTracker, intervalSeconds);
    if (pauseOthers) await pausePeerTrackers(controller, targetKey, snapshot);

    const meta = {
      active: true,
      targetKey,
      intervalSeconds,
      pauseOthers,
      updatedAt: new Date().toISOString(),
      lastError: null,
      rollbackErrors: [],
    };
    controller.setPriorityState({ snapshot, meta });
    await controller.persistPriorityState();
    const trackers = await controller.fetchAllStatuses();
    return res.json({
      ok: true,
      action: "apply",
      generatedAt: new Date().toISOString(),
      trackers,
      priority: {
        active: true,
        target: targetKey,
        intervalSeconds,
        pauseOthers,
        restoreAvailable: true,
        updatedAt: meta.updatedAt,
      },
    });
  } catch (error) {
    return priorityFailureResponse(controller, res, {
      error,
      snapshot,
      targetKey,
      intervalSeconds,
      pauseOthers,
    });
  }
}

function registerPriorityRoute(router, controller) {
  router.post("/trackers/priority", async (req, res) => {
    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();
    if (action !== "apply" && action !== "restore") {
      return res.status(400).json({ error: "Unsupported action. Use apply or restore." });
    }
    try {
      return action === "restore" ? await restorePriority(controller, res) : await applyPriority(controller, req, res);
    } catch (error) {
      return res.status(upstreamErrorStatus(error)).json({
        error: error?.message || "Tracker priority request failed.",
      });
    }
  });
}

function registerTrackerRoutes(router, repository, controller) {
  registerStatusRoutes(router, repository, controller);
  registerControlRoute(router, controller);
  registerPriorityRoute(router, controller);
}

export { registerTrackerRoutes };
