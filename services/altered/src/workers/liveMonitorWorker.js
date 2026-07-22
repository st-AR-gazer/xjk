import { parentPort, workerData } from "node:worker_threads";

import { DATA_DIR, DB_FILE } from "../config.js";
import { createAlteredServiceRuntime } from "../runtime/alteredRuntimeFactory.js";

function post(message) {
  if (!parentPort) return;
  parentPort.postMessage(message);
}

function attachProgressRelay(service, { job = "", reason = "" } = {}) {
  if (!service || typeof service.monitoring.updateLiveProgress !== "function") return service;
  const originalUpdateLiveProgress = service.monitoring.updateLiveProgress.bind(service);
  service.monitoring.updateLiveProgress = (partial = {}) => {
    const progress = originalUpdateLiveProgress(partial);
    post({
      type: "progress",
      job,
      reason,
      progress,
      liveStatus:
        typeof service.monitoring.getLiveMonitorStatus === "function"
          ? service.monitoring.getLiveMonitorStatus()
          : null,
    });
    return progress;
  };
  return service;
}

function createService() {
  return createAlteredServiceRuntime({
    databaseOptions: { filePath: DB_FILE },
    mapCopyConfig: {
      dataDir: DATA_DIR,
      enabled: false,
    },
    logger: console,
  }).alteredService;
}

async function main() {
  const job = String(workerData?.job || "").trim();
  const reason = String(workerData?.reason || "job-worker").trim() || "job-worker";
  const authContext = workerData?.authContext ?? null;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  post({ type: "started", job, reason, startedAt });

  if (job !== "monitor" && job !== "discovery") {
    post({
      type: "complete",
      ok: false,
      job,
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      error: "liveMonitorWorker job must be 'monitor' or 'discovery'.",
    });
    return;
  }

  try {
    const service = attachProgressRelay(createService(), { job, reason });
    const result =
      job === "discovery"
        ? await service.monitoring.runLiveDiscoveryCycle({ reason, authContext })
        : await service.monitoring.runLiveMonitorCycle({ reason, authContext });

    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    const status = service.monitoring.getLiveMonitorStatus?.() || null;

    post({
      type: "complete",
      ok: true,
      job,
      reason,
      startedAt,
      finishedAt,
      durationMs,
      result,
      liveStatus: status,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    post({
      type: "complete",
      ok: false,
      job,
      reason,
      startedAt,
      finishedAt,
      durationMs,
      error: error?.message || String(error || "Live job worker failed."),
    });
  }
}

main().catch((error) => {
  post({
    type: "complete",
    ok: false,
    job: String(workerData?.job || "").trim(),
    reason: String(workerData?.reason || "job-worker").trim(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    error: error?.message || String(error || "Live job worker crashed."),
  });
});
