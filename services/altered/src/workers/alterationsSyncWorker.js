import { parentPort, workerData } from "node:worker_threads";
import { createDatabase } from "../db/index.js";
import { AlteredRepository } from "../repositories/alteredRepository.js";

function post(message) {
  if (!parentPort) return;
  parentPort.postMessage(message);
}

const dbFile = String(workerData?.dbFile || "").trim();

async function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  post({ type: "started", startedAt });

  if (!dbFile) {
    post({
      type: "complete",
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      error: "alterationsSyncWorker requires dbFile.",
    });
    return;
  }

  try {
    const db = createDatabase({ filePath: dbFile });
    const repository = new AlteredRepository(db);
    const summary = repository.catalog.syncAllCampaignAlterations({ cleanupUnused: true });

    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    post({
      type: "complete",
      ok: true,
      startedAt,
      finishedAt,
      durationMs,
      summary,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - startedMs);
    post({
      type: "complete",
      ok: false,
      startedAt,
      finishedAt,
      durationMs,
      error: error?.message || String(error || "Alterations sync failed."),
    });
  }
}

main().catch((error) => {
  post({
    type: "complete",
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    error: error?.message || String(error || "Alterations sync worker failed."),
  });
});
