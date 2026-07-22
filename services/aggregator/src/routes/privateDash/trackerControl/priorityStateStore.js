import fs from "node:fs/promises";
import path from "node:path";

function createPriorityStateStore({ logDir = "." } = {}) {
  const stateFile = path.join(logDir, "dash-tracker-priority-state.json");
  let snapshot = null;
  let meta = null;

  function getPriorityState() {
    return { snapshot, meta };
  }

  function setPriorityState(next = {}) {
    snapshot = next.snapshot ?? null;
    meta = next.meta ?? null;
  }

  async function loadPriorityState() {
    try {
      const parsed = JSON.parse(String((await fs.readFile(stateFile, "utf8")) || ""));
      snapshot = parsed?.snapshot && typeof parsed.snapshot === "object" ? parsed.snapshot : null;
      meta = parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : null;
    } catch {
      snapshot = null;
      meta = null;
    }
    return getPriorityState();
  }

  async function ensurePriorityStateLoaded() {
    return snapshot ? getPriorityState() : loadPriorityState();
  }

  async function persistPriorityState() {
    try {
      if (!snapshot) {
        await fs.rm(stateFile, { force: true });
        return;
      }
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      await fs.writeFile(stateFile, JSON.stringify({ snapshot, meta: meta || null }, null, 2), "utf8");
    } catch {}
  }

  return Object.freeze({
    ensurePriorityStateLoaded,
    getPriorityState,
    loadPriorityState,
    persistPriorityState,
    setPriorityState,
  });
}

export { createPriorityStateStore };
