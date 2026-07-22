import assert from "node:assert/strict";
import test from "node:test";
import { DetachedJobService } from "../src/services/altered/liveMonitoring/detachedJobService.js";

function createService(overrides = {}) {
  const progress = [];
  const service = new DetachedJobService({
    liveMonitor: { running: false, discoveryRunning: false },
    logger: { warn() {} },
    getAlterationsSync: () => ({ running: false }),
    getMapCopy: () => ({ running: false }),
    runLiveMonitorCycle() {},
    runLiveDiscoveryCycle() {},
    updateLiveProgress: (payload) => progress.push(payload),
    ...overrides,
  });
  return { service, progress };
}

test("DetachedJobService reports one consistent blocker policy", () => {
  const { service } = createService({ getMapCopy: () => ({ running: true }) });
  assert.deepEqual(service.getDetachedJobBlocker(), {
    skipped: true,
    reason: "map-local-copy-backfill running",
  });
});

test("DetachedJobService forwards sanitized worker progress for both detached jobs", () => {
  const { service, progress } = createService();
  assert.equal(
    service.forwardWorkerProgress(
      { progress: { runId: 999, reason: "worker", phase: "maps", percent: 40 } },
      { runId: 2, reason: "manual", startedAt: "start" }
    ),
    true
  );
  assert.deepEqual(progress, [{ runId: 2, reason: "manual", startedAt: "start", phase: "maps", percent: 40 }]);
  assert.equal(service.forwardWorkerProgress({}, { reason: "manual", startedAt: "start" }), false);
});
