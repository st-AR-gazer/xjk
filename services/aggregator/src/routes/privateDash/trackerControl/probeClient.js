import { clampInt, normalizeBaseUrl } from "../../../../../shared/valueUtils.js";
import { buildServiceUrl } from "../routeSupport.js";
import { getLocalProbeBaseUrl, probePaths } from "./definitions.js";

function getProbeTargets(tracker, mode, env) {
  const safeMode = String(mode || "all")
    .trim()
    .toLowerCase();
  const targets = [];
  const addTarget = (scope, baseUrl) => {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedBaseUrl) return;
    if (targets.some((item) => item.scope === scope && item.baseUrl === normalizedBaseUrl)) return;
    targets.push({ scope, baseUrl: normalizedBaseUrl });
  };

  if (safeMode === "all" || safeMode === "local") addTarget("local", getLocalProbeBaseUrl(tracker, env));
  if (safeMode === "all" || safeMode === "configured") addTarget("configured", tracker?.baseUrl);
  if (!targets.length && tracker?.baseUrl) addTarget("configured", tracker.baseUrl);
  return targets;
}

async function probeRoute(fetchImpl, { tracker, target, routePath, timeoutMs }) {
  const url = buildServiceUrl(target?.baseUrl, routePath);
  const startedAt = Date.now();
  const identity = {
    tracker: tracker?.key || "",
    scope: target?.scope || "configured",
    baseUrl: target?.baseUrl || "",
    path: routePath,
    url,
  };
  if (!url) {
    return { ...identity, ok: false, statusCode: 0, durationMs: 0, bytes: 0, error: "Probe URL is not configured." };
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 10000)),
    });
    const responseText = await response.text();
    return {
      ...identity,
      ok: response.ok,
      statusCode: Number(response.status || 0),
      durationMs: Date.now() - startedAt,
      bytes: Buffer.byteLength(responseText || "", "utf8"),
      error: response.ok ? null : String(responseText || response.statusText || "Request failed.").slice(0, 240),
    };
  } catch (error) {
    return {
      ...identity,
      ok: false,
      statusCode: 0,
      durationMs: Date.now() - startedAt,
      bytes: 0,
      error: error?.message || "Probe request failed.",
    };
  }
}

async function runProbeTasks(tasks, concurrency) {
  const safeConcurrency = clampInt(concurrency, { min: 1, max: 12, fallback: 4 });
  const results = new Array(tasks.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  };
  const workers = Array.from({ length: Math.min(safeConcurrency, Math.max(1, tasks.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function createTrackerProbeClient({ trackers, fetchImpl = fetch, env = process.env }) {
  async function probeTrackers({ mode = "all", timeoutMs = 10000, concurrency = 4 } = {}) {
    const tasks = [];
    for (const tracker of Object.values(trackers)) {
      for (const target of getProbeTargets(tracker, mode, env)) {
        for (const routePath of probePaths) {
          tasks.push(() => probeRoute(fetchImpl, { tracker, target, routePath, timeoutMs }));
        }
      }
    }
    return runProbeTasks(tasks, concurrency);
  }

  return Object.freeze({ probeTrackers });
}

export { createTrackerProbeClient };
