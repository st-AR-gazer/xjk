import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { readGlobalNadeoQueueSnapshot } from "../../../shared/nadeoGlobalThrottle.js";

function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = String(path || "").trim().replace(/^\/+/, "");
  if (!base || !suffix) return "";
  return `${base}/${suffix}`;
}

function normalizeLogDir(value) {
  const resolved = path.resolve(String(value || "").trim() || ".");
  return resolved;
}

function normalizeStateFilePath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return path.resolve(text);
}

function parseLogFilename(fileName) {
  const match = /^(.*)-(out|error)\.log$/i.exec(String(fileName || "").trim());
  if (!match) return null;
  const service = String(match[1] || "").trim();
  const stream = String(match[2] || "").trim().toLowerCase();
  if (!service || (stream !== "out" && stream !== "error")) return null;
  return { service, stream };
}

function parseLocalLogFilename(fileName) {
  const match = /^(.*)-(\d{8}-\d{6})\.log$/i.exec(String(fileName || "").trim());
  if (!match) return null;
  const service = String(match[1] || "").trim();
  if (!service) return null;
  return { service, stream: "out" };
}

async function collectServiceLogs(logDir) {
  const resolvedLogDir = normalizeLogDir(logDir);
  let entries = [];
  try {
    entries = await fs.readdir(resolvedLogDir, { withFileTypes: true });
  } catch (error) {
    return {
      logDir: resolvedLogDir,
      services: [],
      error: `Cannot read log directory: ${error?.message || "unknown error"}`,
    };
  }

  const serviceMap = new Map();
  for (const entry of entries) {
    if (!entry || !entry.isFile?.()) continue;
    const parsed = parseLogFilename(entry.name);
    if (parsed) {
      const serviceKey = parsed.service.toLowerCase();
      if (!serviceMap.has(serviceKey)) {
        serviceMap.set(serviceKey, {
          service: parsed.service,
          hasOut: false,
          hasError: false,
          outSizeBytes: 0,
          errorSizeBytes: 0,
          outUpdatedAt: null,
          errorUpdatedAt: null,
          fileCandidates: { out: [], error: [] },
          files: {},
        });
      }
      const row = serviceMap.get(serviceKey);
      row.fileCandidates[parsed.stream].push(path.join(resolvedLogDir, entry.name));
      continue;
    }

    const localParsed = parseLocalLogFilename(entry.name);
    if (!localParsed) continue;

    const serviceKey = localParsed.service.toLowerCase();
    if (!serviceMap.has(serviceKey)) {
      serviceMap.set(serviceKey, {
        service: localParsed.service,
        hasOut: false,
        hasError: false,
        outSizeBytes: 0,
        errorSizeBytes: 0,
        outUpdatedAt: null,
        errorUpdatedAt: null,
        fileCandidates: { out: [], error: [] },
        files: {},
      });
    }
    const row = serviceMap.get(serviceKey);
    row.fileCandidates.out.push(path.join(resolvedLogDir, entry.name));
  }

  const services = [...serviceMap.values()].sort((a, b) => a.service.localeCompare(b.service));
  await Promise.all(
    services.flatMap((service) =>
      ["out", "error"].map(async (stream) => {
        const candidates = Array.isArray(service.fileCandidates?.[stream])
          ? service.fileCandidates[stream]
          : [];
        if (!candidates.length) {
          if (stream === "out") {
            service.hasOut = false;
            service.outSizeBytes = 0;
            service.outUpdatedAt = null;
          } else {
            service.hasError = false;
            service.errorSizeBytes = 0;
            service.errorUpdatedAt = null;
          }
          return;
        }

        let best = null;
        for (const filePath of candidates) {
          try {
            const stats = await fs.stat(filePath);
            const mtimeMs = Number(stats.mtimeMs || 0);
            if (!best || mtimeMs > best.mtimeMs) {
              best = {
                filePath,
                mtimeMs,
                size: Number(stats.size || 0),
                mtimeIso: stats.mtime?.toISOString?.() || null,
              };
            }
          } catch {
            // ignore unreadable files
          }
        }

        if (!best) {
          if (stream === "out") {
            service.hasOut = false;
            service.outSizeBytes = 0;
            service.outUpdatedAt = null;
          } else {
            service.hasError = false;
            service.errorSizeBytes = 0;
            service.errorUpdatedAt = null;
          }
          return;
        }

        service.files[stream] = best.filePath;
        if (stream === "out") {
          service.hasOut = true;
          service.outSizeBytes = best.size;
          service.outUpdatedAt = best.mtimeIso;
        } else {
          service.hasError = true;
          service.errorSizeBytes = best.size;
          service.errorUpdatedAt = best.mtimeIso;
        }
      })
    )
  );

  return {
    logDir: resolvedLogDir,
    services: services.map((service) => ({
      ...service,
      fileCandidates: undefined,
    })),
    error: null,
  };
}

function countNewLines(buffer) {
  let count = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 10) count += 1;
  }
  return count;
}

async function readLogTail(filePath, { lines = 200, maxBytes = 1024 * 1024 } = {}) {
  const safeLines = clampInt(lines, { min: 10, max: 2000, fallback: 200 });
  const safeMaxBytes = clampInt(maxBytes, { min: 16 * 1024, max: 4 * 1024 * 1024, fallback: 1024 * 1024 });

  const fileHandle = await fs.open(filePath, "r");
  try {
    const stats = await fileHandle.stat();
    const totalSize = Number(stats.size || 0);
    if (totalSize <= 0) {
      return {
        lines: [],
        truncated: false,
        totalSizeBytes: totalSize,
      };
    }

    let position = totalSize;
    let bytesCollected = 0;
    let newlineCount = 0;
    const chunks = [];

    while (position > 0 && bytesCollected < safeMaxBytes && newlineCount <= safeLines) {
      const readSize = Math.min(64 * 1024, position, safeMaxBytes - bytesCollected);
      if (readSize <= 0) break;
      position -= readSize;

      const buffer = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, readSize, position);
      if (bytesRead <= 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      bytesCollected += bytesRead;
      newlineCount += countNewLines(chunk);
    }

    const combined = Buffer.concat(chunks).toString("utf8").replace(/\r\n/g, "\n");
    const rows = combined.split("\n");
    if (rows.length && rows[rows.length - 1] === "") rows.pop();
    const tailRows = rows.slice(-safeLines);

    return {
      lines: tailRows,
      truncated: position > 0 || rows.length > tailRows.length,
      totalSizeBytes: totalSize,
    };
  } finally {
    await fileHandle.close();
  }
}

async function fetchJsonWithTimeout(
  url,
  { method = "GET", body = undefined, headers = {}, timeoutMs = 15000 } = {}
) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 15000)),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      String(text || "").trim() ||
      `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.statusCode = Number(response.status || 0);
    throw error;
  }
  return payload;
}

function createPrivateDashRoutes(
  repository,
  { trackerControl = {}, alteredControl = {}, logsControl = {}, nadeoControl = {} } = {}
) {
  const router = express.Router();
  const trackerAdminToken = String(trackerControl?.adminToken || "").trim();
  const alteredBaseUrl = normalizeBaseUrl(alteredControl?.baseUrl);
  const alteredInternalToken = String(alteredControl?.internalToken || "").trim();
  const logDir = normalizeLogDir(logsControl?.logDir);
  const trackerPriorityStateFile = path.join(logDir, "dash-tracker-priority-state.json");
  const nadeoThrottleStateFile = normalizeStateFilePath(nadeoControl?.throttleStateFile);
  const nadeoMinRequestGapMs = clampInt(nadeoControl?.minRequestGapMs, {
    min: 0,
    max: 120000,
    fallback: 0,
  });
  const trackers = {
    wr: {
      key: "wr",
      baseUrl: normalizeBaseUrl(trackerControl?.wrBaseUrl),
      statusPaths: ["/api/v1/tracker/status", "/api/v1/status"],
      runNowPath: "/api/v1/admin/tracker/run-now",
      configPath: "/api/v1/admin/tracker/config",
      requiresAdminToken: true,
      supportsRunNow: true,
      supportsEnabledToggle: true,
    },
    leaderboard: {
      key: "leaderboard",
      baseUrl: normalizeBaseUrl(trackerControl?.leaderboardBaseUrl),
      statusPaths: ["/api/v1/tracker/status", "/api/v1/status"],
      runNowPath: "/api/v1/admin/tracker/run-now",
      configPath: "/api/v1/admin/tracker/config",
      requiresAdminToken: true,
      supportsRunNow: true,
      supportsEnabledToggle: true,
    },
    displayname: {
      key: "displayname",
      baseUrl: normalizeBaseUrl(trackerControl?.displaynameBaseUrl),
      statusPaths: ["/api/v1/status", "/api/v1/tracker/status"],
      runNowPath: "/api/v1/sync/run-now",
      configPath: "/api/v1/config",
      requiresAdminToken: false,
      supportsRunNow: true,
      supportsEnabledToggle: true,
    },
    club: {
      key: "club",
      baseUrl: normalizeBaseUrl(trackerControl?.clubBaseUrl),
      statusPaths: ["/api/v1/status", "/api/v1/tracker/status"],
      runNowPath: "",
      configPath: "/api/v1/config",
      requiresAdminToken: false,
      supportsRunNow: false,
      supportsEnabledToggle: true,
    },
  };
  const trackerProbePaths = [
    "/health",
    "/status",
    "/tracker/status",
    "/api/status",
    "/api/tracker/status",
    "/api/v1/status",
    "/api/v1/tracker/status",
  ];
  const trackerProbeLocalPorts = {
    wr: 3131,
    leaderboard: 3143,
    displayname: 3141,
    club: 3142,
  };
  const trackerProbeLocalEnvKeys = {
    wr: "DASH_TRACKER_WR_LOCAL_BASE_URL",
    leaderboard: "DASH_TRACKER_LEADERBOARD_LOCAL_BASE_URL",
    displayname: "DASH_TRACKER_DISPLAYNAME_LOCAL_BASE_URL",
    club: "DASH_TRACKER_CLUB_LOCAL_BASE_URL",
  };
  let trackerPrioritySnapshot = null;
  let trackerPriorityMeta = null;

  function getTrackerLocalProbeBaseUrl(tracker) {
    const key = String(tracker?.key || "").trim().toLowerCase();
    const envKey = trackerProbeLocalEnvKeys[key];
    const envBaseUrl = envKey ? normalizeBaseUrl(process.env[envKey]) : "";
    if (envBaseUrl) return envBaseUrl;

    const configuredBaseUrl = normalizeBaseUrl(tracker?.baseUrl);
    const defaultPort = trackerProbeLocalPorts[key];
    if (!defaultPort) return "";

    if (configuredBaseUrl.includes("/__remote/trackers")) {
      return `http://127.0.0.1:${defaultPort}`;
    }

    return "";
  }

  function getTrackerProbeTargets(tracker, mode = "all") {
    const safeMode = String(mode || "all").trim().toLowerCase();
    const targets = [];
    const addTarget = (scope, baseUrl) => {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
      if (!normalizedBaseUrl) return;
      if (targets.some((item) => item.scope === scope && item.baseUrl === normalizedBaseUrl)) return;
      targets.push({ scope, baseUrl: normalizedBaseUrl });
    };

    if (safeMode === "all" || safeMode === "local") {
      addTarget("local", getTrackerLocalProbeBaseUrl(tracker));
    }
    if (safeMode === "all" || safeMode === "configured") {
      addTarget("configured", tracker?.baseUrl);
    }

    if (!targets.length && tracker?.baseUrl) {
      addTarget("configured", tracker.baseUrl);
    }
    return targets;
  }

  async function probeTrackerRoute({ tracker, target, routePath, timeoutMs }) {
    const url = buildUrl(target?.baseUrl, routePath);
    const startedAt = Date.now();
    if (!url) {
      return {
        tracker: tracker?.key || "",
        scope: target?.scope || "configured",
        baseUrl: target?.baseUrl || "",
        path: routePath,
        url,
        ok: false,
        statusCode: 0,
        durationMs: 0,
        bytes: 0,
        error: "Probe URL is not configured.",
      };
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 10000)),
      });
      const text = await response.text();
      return {
        tracker: tracker?.key || "",
        scope: target?.scope || "configured",
        baseUrl: target?.baseUrl || "",
        path: routePath,
        url,
        ok: response.ok,
        statusCode: Number(response.status || 0),
        durationMs: Date.now() - startedAt,
        bytes: Buffer.byteLength(text || "", "utf8"),
        error: response.ok ? null : String(text || response.statusText || "Request failed.").slice(0, 240),
      };
    } catch (error) {
      return {
        tracker: tracker?.key || "",
        scope: target?.scope || "configured",
        baseUrl: target?.baseUrl || "",
        path: routePath,
        url,
        ok: false,
        statusCode: 0,
        durationMs: Date.now() - startedAt,
        bytes: 0,
        error: error?.message || "Probe request failed.",
      };
    }
  }

  async function runProbeTasks(tasks, { concurrency = 4 } = {}) {
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

    const workers = Array.from(
      { length: Math.min(safeConcurrency, Math.max(1, tasks.length)) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  async function loadTrackerPriorityState() {
    try {
      const raw = await fs.readFile(trackerPriorityStateFile, "utf8");
      const parsed = JSON.parse(String(raw || ""));
      trackerPrioritySnapshot =
        parsed?.snapshot && typeof parsed.snapshot === "object" ? parsed.snapshot : null;
      trackerPriorityMeta =
        parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : null;
    } catch {
      trackerPrioritySnapshot = null;
      trackerPriorityMeta = null;
    }
    return {
      snapshot: trackerPrioritySnapshot,
      meta: trackerPriorityMeta,
    };
  }

  async function persistTrackerPriorityState() {
    try {
      if (!trackerPrioritySnapshot) {
        await fs.rm(trackerPriorityStateFile, { force: true });
        return;
      }
      await fs.mkdir(path.dirname(trackerPriorityStateFile), { recursive: true });
      await fs.writeFile(
        trackerPriorityStateFile,
        JSON.stringify(
          {
            snapshot: trackerPrioritySnapshot,
            meta: trackerPriorityMeta || null,
          },
          null,
          2
        ),
        "utf8"
      );
    } catch {
      // Best-effort persistence only.
    }
  }

  function trackerEnabledForPriority(key, statusPayload) {
    if (!statusPayload || typeof statusPayload !== "object") return false;
    if (key === "wr" || key === "leaderboard") {
      return Boolean(statusPayload?.runtime?.enabled);
    }
    return Boolean(statusPayload.enabled);
  }

  function buildTrackerControlHeaders(tracker) {
    const headers = {
      "content-type": "application/json",
    };
    if (tracker?.requiresAdminToken) {
      if (!trackerAdminToken) {
        const error = new Error(
          `Tracker '${tracker?.key || "unknown"}' requires TRACKER_ADMIN_TOKEN, DASH_TRACKER_ADMIN_TOKEN, or DASH_ADMIN_TOKEN to control from dash.`
        );
        error.statusCode = 400;
        throw error;
      }
      headers["x-admin-token"] = trackerAdminToken;
      headers.authorization = `Bearer ${trackerAdminToken}`;
    }
    return headers;
  }

  async function fetchTrackerStatusEntry(tracker, { timeoutMs = 10000 } = {}) {
    if (!tracker?.baseUrl) {
      return {
        ok: false,
        configured: false,
        error: "Tracker base URL is not configured.",
        status: null,
      };
    }
    const paths = Array.isArray(tracker.statusPaths)
      ? tracker.statusPaths.filter(Boolean)
      : [tracker.statusPath].filter(Boolean);
    let payload = null;
    let lastError = null;

    for (const routePath of paths) {
      const statusUrl = buildUrl(tracker.baseUrl, routePath);
      try {
        payload = await fetchJsonWithTimeout(statusUrl, { method: "GET", timeoutMs });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (payload) {
      return {
        ok: true,
        configured: true,
        status: payload,
        error: null,
        baseUrl: tracker.baseUrl,
      };
    }

    return {
      ok: false,
      configured: true,
      status: null,
      error: lastError?.message || "Status request failed.",
      baseUrl: tracker.baseUrl,
    };
  }

  async function fetchAllTrackerStatuses() {
    const statusResults = {};
    for (const tracker of Object.values(trackers)) {
      statusResults[tracker.key] = await fetchTrackerStatusEntry(tracker);
    }
    return statusResults;
  }

  async function sendTrackerControlRequest(tracker, action, payload = {}) {
    if (!tracker) {
      const error = new Error("Unknown tracker.");
      error.statusCode = 400;
      throw error;
    }
    if (!tracker.baseUrl) {
      const error = new Error(`Tracker '${tracker.key}' is not configured.`);
      error.statusCode = 400;
      throw error;
    }

    if (action === "run-now") {
      if (!tracker.supportsRunNow || !tracker.runNowPath) {
        const error = new Error(`Tracker '${tracker.key}' does not support run-now.`);
        error.statusCode = 400;
        throw error;
      }
      const url = buildUrl(tracker.baseUrl, tracker.runNowPath);
      return fetchJsonWithTimeout(url, {
        method: "POST",
        headers: buildTrackerControlHeaders(tracker),
        body: payload && typeof payload === "object" ? payload : {},
        timeoutMs: 30000,
      });
    }

    if (action === "enable" || action === "disable" || action === "set") {
      if (!tracker.supportsEnabledToggle || !tracker.configPath) {
        const error = new Error(`Tracker '${tracker.key}' does not support config.`);
        error.statusCode = 400;
        throw error;
      }
      const enabledValue =
        action === "enable" ? true : action === "disable" ? false : Boolean(payload?.enabled);
      const configBody =
        action === "set" && payload && typeof payload === "object"
          ? { ...payload }
          : { enabled: enabledValue };
      if (tracker.key === "displayname" && configBody.enabled !== undefined) {
        if (configBody.schedulerEnabled === undefined) {
          configBody.schedulerEnabled = Boolean(configBody.enabled);
        }
      }
      const url = buildUrl(tracker.baseUrl, tracker.configPath);
      return fetchJsonWithTimeout(url, {
        method: "POST",
        headers: buildTrackerControlHeaders(tracker),
        body: configBody,
        timeoutMs: 15000,
      });
    }

    const error = new Error("Unsupported action. Use run-now, enable, disable, or set.");
    error.statusCode = 400;
    throw error;
  }

  function buildTrackerPrioritySnapshot(statusResults = {}) {
    const wrRuntime = statusResults?.wr?.status?.runtime || {};
    const lbRuntime = statusResults?.leaderboard?.status?.runtime || {};
    const dnStatus = statusResults?.displayname?.status || {};
    const clubStatus = statusResults?.club?.status || {};
    return {
      wr: {
        configured: Boolean(statusResults?.wr?.configured),
        enabled: Boolean(statusResults?.wr?.ok && trackerEnabledForPriority("wr", statusResults.wr.status)),
        tickSeconds: clampInt(wrRuntime.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
        batchSize: clampInt(wrRuntime.batchSize, { min: 1, max: 1000, fallback: 6 }),
        maxCheckIntervalSeconds: clampInt(wrRuntime.maxCheckIntervalSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 0,
        }),
        leaderboardTopN: clampInt(wrRuntime.leaderboardTopN, { min: 1, max: 1000, fallback: 1 }),
      },
      leaderboard: {
        configured: Boolean(statusResults?.leaderboard?.configured),
        enabled: Boolean(
          statusResults?.leaderboard?.ok &&
            trackerEnabledForPriority("leaderboard", statusResults.leaderboard.status)
        ),
        tickSeconds: clampInt(lbRuntime.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
        batchSize: clampInt(lbRuntime.batchSize, { min: 1, max: 1000, fallback: 6 }),
        maxCheckIntervalSeconds: clampInt(lbRuntime.maxCheckIntervalSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 0,
        }),
        leaderboardTopN: clampInt(lbRuntime.leaderboardTopN, {
          min: 1,
          max: 1000,
          fallback: 100,
        }),
      },
      displayname: {
        configured: Boolean(statusResults?.displayname?.configured),
        enabled: Boolean(
          statusResults?.displayname?.ok &&
            trackerEnabledForPriority("displayname", statusResults.displayname.status)
        ),
        schedulerEnabled: Boolean(dnStatus.schedulerEnabled),
        maintenanceIntervalSeconds: clampInt(dnStatus.maintenanceIntervalSeconds, {
          min: 3,
          max: 3600,
          fallback: 60,
        }),
        staleAfterSeconds: clampInt(dnStatus.staleAfterSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 86400,
        }),
        batchSize: clampInt(dnStatus.batchSize, { min: 1, max: 50, fallback: 50 }),
        maxAccountsPerCycle: clampInt(dnStatus.maxAccountsPerCycle, {
          min: 1,
          max: 5000,
          fallback: 200,
        }),
        minRequestGapMs: clampInt(dnStatus.minRequestGapMs, {
          min: 0,
          max: 120000,
          fallback: 5000,
        }),
      },
      club: {
        configured: Boolean(statusResults?.club?.configured),
        enabled: Boolean(statusResults?.club?.ok && trackerEnabledForPriority("club", clubStatus)),
      },
    };
  }

  async function restoreTrackerPrioritySnapshot(snapshot = null) {
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
    if (!safeSnapshot) {
      return { ok: false, error: "No saved tracker snapshot available." };
    }

    const errors = [];
    const attempt = async (key, action, payload) => {
      try {
        await sendTrackerControlRequest(trackers[key], action, payload);
      } catch (error) {
        errors.push(`${key}: ${error?.message || error}`);
      }
    };

    if (safeSnapshot.wr?.configured) {
      await attempt("wr", "set", {
        enabled: Boolean(safeSnapshot.wr.enabled),
        tickSeconds: clampInt(safeSnapshot.wr.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
        batchSize: clampInt(safeSnapshot.wr.batchSize, { min: 1, max: 1000, fallback: 6 }),
        maxCheckIntervalSeconds: clampInt(safeSnapshot.wr.maxCheckIntervalSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 0,
        }),
        leaderboardTopN: clampInt(safeSnapshot.wr.leaderboardTopN, {
          min: 1,
          max: 1000,
          fallback: 1,
        }),
      });
    }

    if (safeSnapshot.leaderboard?.configured) {
      await attempt("leaderboard", "set", {
        enabled: Boolean(safeSnapshot.leaderboard.enabled),
        tickSeconds: clampInt(safeSnapshot.leaderboard.tickSeconds, { min: 3, max: 3600, fallback: 20 }),
        batchSize: clampInt(safeSnapshot.leaderboard.batchSize, { min: 1, max: 1000, fallback: 6 }),
        maxCheckIntervalSeconds: clampInt(safeSnapshot.leaderboard.maxCheckIntervalSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 0,
        }),
        leaderboardTopN: clampInt(safeSnapshot.leaderboard.leaderboardTopN, {
          min: 1,
          max: 1000,
          fallback: 100,
        }),
      });
    }

    if (safeSnapshot.displayname?.configured) {
      await attempt("displayname", "set", {
        enabled: Boolean(safeSnapshot.displayname.enabled),
        schedulerEnabled: Boolean(safeSnapshot.displayname.schedulerEnabled),
        maintenanceIntervalSeconds: clampInt(safeSnapshot.displayname.maintenanceIntervalSeconds, {
          min: 3,
          max: 3600,
          fallback: 60,
        }),
        staleAfterSeconds: clampInt(safeSnapshot.displayname.staleAfterSeconds, {
          min: 0,
          max: 31_536_000,
          fallback: 86400,
        }),
        batchSize: clampInt(safeSnapshot.displayname.batchSize, { min: 1, max: 50, fallback: 50 }),
        maxAccountsPerCycle: clampInt(safeSnapshot.displayname.maxAccountsPerCycle, {
          min: 1,
          max: 5000,
          fallback: 200,
        }),
        minRequestGapMs: clampInt(safeSnapshot.displayname.minRequestGapMs, {
          min: 0,
          max: 120000,
          fallback: 5000,
        }),
      });
    }

    if (safeSnapshot.club?.configured) {
      await attempt("club", "set", {
        enabled: Boolean(safeSnapshot.club.enabled),
      });
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  function buildAlteredHeaders({ hasBody = false } = {}) {
    const headers = {};
    if (hasBody) headers["content-type"] = "application/json";
    if (alteredInternalToken) {
      headers["x-aggregator-token"] = alteredInternalToken;
    }
    return headers;
  }

  async function fetchAlteredJson(
    routePath,
    { method = "GET", body = undefined, timeoutMs = 15000, requiresInternalAuth = true } = {}
  ) {
    if (!alteredBaseUrl) {
      const error = new Error("Altered base URL is not configured.");
      error.statusCode = 400;
      throw error;
    }
    const url = buildUrl(alteredBaseUrl, routePath);
    return fetchJsonWithTimeout(url, {
      method,
      body,
      timeoutMs,
      headers: requiresInternalAuth
        ? buildAlteredHeaders({ hasBody: body !== undefined })
        : body !== undefined
          ? { "content-type": "application/json" }
          : {},
    });
  }

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });

  router.get("/meta", (_req, res) => {
    const summary = repository.getMeta();
    const metrics = repository.getMetricsOverview();
    return res.json({
      generatedAt: new Date().toISOString(),
      summary,
      metrics,
    });
  });

  router.get("/traffic/overview", (req, res) => {
    const overview = repository.getTrafficOverview({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      overview,
    });
  });

  router.get("/traffic/timeseries", (req, res) => {
    const series = repository.getTrafficTimeseries({
      bucket: req.query.bucket || "hour",
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      series,
    });
  });

  router.get("/traffic/top", (req, res) => {
    const top = repository.getTrafficTop({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
      direction: req.query.direction || "outgoing",
      dimension: req.query.dimension || "",
      limit: clampInt(req.query.limit, { min: 1, max: 200, fallback: 20 }),
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      top,
    });
  });

  router.get("/traffic/facets", (req, res) => {
    const facets = repository.getTrafficFacets({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      facets,
    });
  });

  router.get("/traffic/errors", (req, res) => {
    const errors = repository.getTrafficErrors({
      windowHours: clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 }),
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
      direction: req.query.direction || "",
      statusMin: clampInt(req.query.status_min, { min: 400, max: 599, fallback: 400 }),
      q: req.query.q || "",
      limit: clampInt(req.query.limit, { min: 1, max: 500, fallback: 50 }),
      page: clampInt(req.query.page, { min: 1, max: 100000, fallback: 1 }),
      offset: clampInt(req.query.offset, { min: 0, max: 100000000, fallback: 0 }),
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      errors,
    });
  });

  router.get("/nadeo/queue", (req, res) => {
    const snapshot = readGlobalNadeoQueueSnapshot({
      stateFile: nadeoThrottleStateFile,
      minGapMs: nadeoMinRequestGapMs,
      maxItems: clampInt(req.query.limit, { min: 10, max: 500, fallback: 120 }),
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      queue: snapshot,
    });
  });

  router.get("/nadeo/guardrail", (req, res) => {
    const windowHours = clampInt(req.query.window_hours, { min: 1, max: 24 * 90, fallback: 24 });
    const guardrail = repository.getNadeoGuardrailSnapshot({
      windowHours,
      projectKey: req.query.project_key || "",
      service: req.query.service || "",
    });
    const queue = readGlobalNadeoQueueSnapshot({
      stateFile: nadeoThrottleStateFile,
      minGapMs: nadeoMinRequestGapMs,
      maxItems: 20,
    });

    return res.json({
      generatedAt: new Date().toISOString(),
      guardrail: {
        ...guardrail,
        queue: {
          configured: queue.configured,
          pendingCount: queue.pendingCount,
          activeWaiterId: queue.activeWaiterId || null,
          lastGrantedAt: queue.lastGrantedAt || null,
          lastRequestAt: queue.lastRequestAt || null,
          secondsSinceLastRequest: queue.secondsSinceLastRequest,
          minGapMs: queue.minGapMs,
        },
      },
    });
  });

  router.get("/projects", (req, res) => {
    const projects = repository.listProjects({
      limit: clampInt(req.query.limit, { min: 1, max: 500, fallback: 120 }),
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      projects,
      count: projects.length,
    });
  });

  router.get("/altered/summary", (req, res) => {
    const syncRunsLimit = clampInt(req.query.sync_runs_limit, { min: 1, max: 100, fallback: 12 });
    const pollRunsLimit = clampInt(req.query.poll_runs_limit, { min: 1, max: 100, fallback: 20 });
    const summary = repository.getAlteredDashboardSummary({
      syncRunsLimit,
      pollRunsLimit,
    });
    return res.json({
      generatedAt: new Date().toISOString(),
      ...summary,
    });
  });

  router.get("/altered/check-history", (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const mapUid = String(req.query.map_uid || "").trim();
    const limit = clampInt(req.query.limit, { min: 1, max: 500, fallback: 120 });
    const events = repository.getAlteredCheckHistory({ q, mapUid, limit });
    return res.json({
      generatedAt: new Date().toISOString(),
      events,
      count: events.length,
      source: "database",
    });
  });

  router.post("/altered/run-full-sync", async (_req, res) => {
    try {
      const result = await fetchAlteredJson("/api/v1/admin/hook/altered/live/monitor/run", {
        method: "POST",
        body: {},
        timeoutMs: 30000,
      });
      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      const upstreamStatus = Number(error?.statusCode || 0);
      const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return res.status(statusCode).json({
        error: error?.message || "Failed to start altered full sync.",
      });
    }
  });

  router.post("/altered/run-discovery-sync", async (_req, res) => {
    try {
      const result = await fetchAlteredJson("/api/v1/admin/hook/altered/live/monitor/run-discovery", {
        method: "POST",
        body: {},
        timeoutMs: 30000,
      });
      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      const upstreamStatus = Number(error?.statusCode || 0);
      const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return res.status(statusCode).json({
        error: error?.message || "Failed to start altered discovery sync.",
      });
    }
  });

  router.get("/trackers/status", async (_req, res) => {
    if (!trackerPrioritySnapshot) {
      await loadTrackerPriorityState();
    }
    const statusSnapshot = repository.getTrackerStatusSnapshots();
    return res.json({
      generatedAt: new Date().toISOString(),
      trackers: statusSnapshot.trackers || {},
      source: statusSnapshot.source || "database",
      priority: {
        active: Boolean(trackerPriorityMeta?.active),
        restoreAvailable: Boolean(trackerPrioritySnapshot),
        target: trackerPriorityMeta?.targetKey || null,
        updatedAt: trackerPriorityMeta?.updatedAt || null,
        lastError: trackerPriorityMeta?.lastError || null,
        rollbackErrors: Array.isArray(trackerPriorityMeta?.rollbackErrors)
          ? trackerPriorityMeta.rollbackErrors
          : [],
      },
    });
  });

  router.get("/trackers/status-probe", async (req, res) => {
    const mode = String(req.query.mode || "all").trim().toLowerCase();
    const safeMode = mode === "local" || mode === "configured" ? mode : "all";
    const timeoutMs = clampInt(req.query.timeout_ms, {
      min: 1000,
      max: 15000,
      fallback: 10000,
    });
    const concurrency = clampInt(req.query.concurrency, {
      min: 1,
      max: 12,
      fallback: 4,
    });
    const probeTasks = [];

    for (const tracker of Object.values(trackers)) {
      for (const target of getTrackerProbeTargets(tracker, safeMode)) {
        for (const routePath of trackerProbePaths) {
          probeTasks.push(() => probeTrackerRoute({ tracker, target, routePath, timeoutMs }));
        }
      }
    }

    const probes = await runProbeTasks(probeTasks, { concurrency });
    const failed = probes.filter((item) => !item.ok);
    return res.json({
      generatedAt: new Date().toISOString(),
      mode: safeMode,
      timeoutMs,
      concurrency,
      source: "live-route-probe",
      probes,
      summary: {
        total: probes.length,
        ok: probes.length - failed.length,
        failed: failed.length,
      },
    });
  });

  router.post("/trackers/control", async (req, res) => {
    const body = req.body || {};
    const trackerKey = String(body.tracker || "").trim().toLowerCase();
    const action = String(body.action || "").trim().toLowerCase();
    const tracker = trackers[trackerKey];

    if (!tracker) {
      return res.status(400).json({ error: "Unknown tracker. Use wr, leaderboard, displayname, or club." });
    }
    if (!tracker.baseUrl) {
      return res.status(400).json({ error: `Tracker '${trackerKey}' is not configured.` });
    }

    try {
      if (action === "run-now" || action === "enable" || action === "disable" || action === "set") {
        const payload = await sendTrackerControlRequest(tracker, action, body.payload);
        return res.json({
          ok: true,
          tracker: trackerKey,
          action,
          result: payload,
          generatedAt: new Date().toISOString(),
        });
      }

      return res.status(400).json({
        error: "Unsupported action. Use run-now, enable, disable, or set.",
      });
    } catch (error) {
      const upstreamStatus = Number(error?.statusCode || 0);
      const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return res.status(statusCode).json({
        error: error?.message || "Tracker control request failed.",
      });
    }
  });

  router.post("/trackers/priority", async (req, res) => {
    const body = req.body || {};
    const action = String(body.action || "").trim().toLowerCase();

    if (action !== "apply" && action !== "restore") {
      return res.status(400).json({
        error: "Unsupported action. Use apply or restore.",
      });
    }

    try {
      if (action === "restore") {
        if (!trackerPrioritySnapshot) {
          await loadTrackerPriorityState();
        }
        if (!trackerPrioritySnapshot) {
          return res.status(400).json({
            error: "No saved tracker snapshot yet. Apply priority once before restore.",
          });
        }

        const restoreResult = await restoreTrackerPrioritySnapshot(trackerPrioritySnapshot);
        const statusResults = await fetchAllTrackerStatuses();
        if (restoreResult.ok) {
          trackerPrioritySnapshot = null;
          trackerPriorityMeta = {
            active: false,
            targetKey: null,
            updatedAt: new Date().toISOString(),
            lastError: null,
            rollbackErrors: [],
          };
          await persistTrackerPriorityState();
          return res.json({
            ok: true,
            action: "restore",
            generatedAt: new Date().toISOString(),
            trackers: statusResults,
            priority: {
              active: false,
              restoreAvailable: false,
            },
          });
        }

        trackerPriorityMeta = {
          active: false,
          targetKey: trackerPriorityMeta?.targetKey || null,
          updatedAt: new Date().toISOString(),
          lastError: "Restore failed.",
          rollbackErrors: restoreResult.errors || [],
        };
        await persistTrackerPriorityState();
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

      const targetKey = String(body.target || "").trim().toLowerCase();
      const intervalSeconds = clampInt(body.intervalSeconds, {
        min: 3,
        max: 3600,
        fallback: 3,
      });
      const pauseOthers =
        body.pauseOthers === undefined ? true : Boolean(body.pauseOthers);
      const targetTracker = trackers[targetKey];

      if (!targetTracker) {
        return res.status(400).json({
          error: "Unknown tracker target. Use wr, leaderboard, displayname, or club.",
        });
      }

      const statusResults = await fetchAllTrackerStatuses();
      const targetStatus = statusResults[targetKey];
      if (!targetStatus?.configured || !targetStatus?.ok) {
        return res.status(400).json({
          error: `Tracker '${targetKey}' must have a healthy status response before priority mode can be applied safely.`,
        });
      }

      if (pauseOthers) {
        const unhealthyPeers = Object.entries(statusResults)
          .filter(([key, entry]) => key !== targetKey && entry?.configured && !entry?.ok)
          .map(([key]) => key);
        if (unhealthyPeers.length) {
          return res.status(400).json({
            error: `Cannot apply priority mode safely while tracker status is unavailable for: ${unhealthyPeers.join(", ")}.`,
          });
        }
      }

      const snapshot = buildTrackerPrioritySnapshot(statusResults);
      try {
        if (targetKey === "wr" || targetKey === "leaderboard") {
          await sendTrackerControlRequest(targetTracker, "set", {
            enabled: true,
            tickSeconds: intervalSeconds,
          });
          await sendTrackerControlRequest(targetTracker, "run-now", {});
        } else if (targetKey === "displayname") {
          await sendTrackerControlRequest(targetTracker, "set", {
            enabled: true,
            schedulerEnabled: true,
            maintenanceIntervalSeconds: intervalSeconds,
            minRequestGapMs: intervalSeconds * 1000,
          });
          await sendTrackerControlRequest(targetTracker, "run-now", {
            forceCandidates: true,
            prioritizeAccountIds: true,
          });
        } else if (targetKey === "club") {
          await sendTrackerControlRequest(targetTracker, "enable", {});
        }

        if (pauseOthers) {
          for (const key of ["wr", "leaderboard", "displayname", "club"]) {
            if (key === targetKey) continue;
            if (!snapshot?.[key]?.configured) continue;
            await sendTrackerControlRequest(trackers[key], "disable", {});
          }
        }

        trackerPrioritySnapshot = snapshot;
        trackerPriorityMeta = {
          active: true,
          targetKey,
          intervalSeconds,
          pauseOthers,
          updatedAt: new Date().toISOString(),
          lastError: null,
          rollbackErrors: [],
        };
        await persistTrackerPriorityState();

        const updatedStatuses = await fetchAllTrackerStatuses();
        return res.json({
          ok: true,
          action: "apply",
          generatedAt: new Date().toISOString(),
          trackers: updatedStatuses,
          priority: {
            active: true,
            target: targetKey,
            intervalSeconds,
            pauseOthers,
            restoreAvailable: true,
            updatedAt: trackerPriorityMeta.updatedAt,
          },
        });
      } catch (error) {
        const restoreResult = await restoreTrackerPrioritySnapshot(snapshot);
        const updatedStatuses = await fetchAllTrackerStatuses();
        if (restoreResult.ok) {
          trackerPrioritySnapshot = null;
          trackerPriorityMeta = {
            active: false,
            targetKey,
            intervalSeconds,
            pauseOthers,
            updatedAt: new Date().toISOString(),
            lastError: error?.message || "Priority mode failed.",
            rollbackErrors: [],
          };
          await persistTrackerPriorityState();
          return res.status(502).json({
            error: error?.message || "Priority mode failed.",
            rollback: "restored",
            generatedAt: new Date().toISOString(),
            trackers: updatedStatuses,
            priority: {
              active: false,
              restoreAvailable: false,
            },
          });
        }

        trackerPrioritySnapshot = snapshot;
        trackerPriorityMeta = {
          active: false,
          targetKey,
          intervalSeconds,
          pauseOthers,
          updatedAt: new Date().toISOString(),
          lastError: error?.message || "Priority mode failed.",
          rollbackErrors: restoreResult.errors || [],
        };
        await persistTrackerPriorityState();
        return res.status(502).json({
          error: error?.message || "Priority mode failed.",
          rollback: "failed",
          rollbackErrors: restoreResult.errors || [],
          generatedAt: new Date().toISOString(),
          trackers: updatedStatuses,
          priority: {
            active: false,
            restoreAvailable: true,
            rollbackErrors: restoreResult.errors || [],
          },
        });
      }
    } catch (error) {
      const upstreamStatus = Number(error?.statusCode || 0);
      const statusCode = upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;
      return res.status(statusCode).json({
        error: error?.message || "Tracker priority request failed.",
      });
    }
  });

  router.get("/logs/services", async (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const result = await collectServiceLogs(logDir);
    if (result.error) {
      return res.status(503).json({
        error: result.error,
        logDir: result.logDir,
      });
    }

    const services = Array.isArray(result.services)
      ? result.services.filter((item) => {
          if (!q) return true;
          return String(item.service || "").toLowerCase().includes(q);
        })
      : [];

    return res.json({
      generatedAt: new Date().toISOString(),
      logDir: result.logDir,
      services: services.map((item) => ({
        service: item.service,
        hasOut: Boolean(item.hasOut),
        hasError: Boolean(item.hasError),
        outSizeBytes: Number(item.outSizeBytes || 0),
        errorSizeBytes: Number(item.errorSizeBytes || 0),
        outUpdatedAt: item.outUpdatedAt || null,
        errorUpdatedAt: item.errorUpdatedAt || null,
      })),
      count: services.length,
    });
  });

  router.get("/logs/service/:service", async (req, res) => {
    const stream = String(req.query.stream || "out").trim().toLowerCase();
    if (stream !== "out" && stream !== "error") {
      return res.status(400).json({ error: "Invalid stream. Use 'out' or 'error'." });
    }

    const requestedService = String(req.params.service || "").trim().toLowerCase();
    if (!requestedService) {
      return res.status(400).json({ error: "Missing service." });
    }

    const lines = clampInt(req.query.lines, { min: 10, max: 2000, fallback: 200 });
    const result = await collectServiceLogs(logDir);
    if (result.error) {
      return res.status(503).json({
        error: result.error,
        logDir: result.logDir,
      });
    }

    const service = (result.services || []).find(
      (item) => String(item.service || "").trim().toLowerCase() === requestedService
    );
    if (!service) {
      return res.status(404).json({ error: "Service logs not found." });
    }

    const filePath = service.files?.[stream];
    if (!filePath) {
      return res.status(404).json({ error: `No ${stream} log for this service.` });
    }

    try {
      const tail = await readLogTail(filePath, { lines });
      return res.json({
        generatedAt: new Date().toISOString(),
        logDir: result.logDir,
        service: service.service,
        stream,
        lines: tail.lines,
        lineCount: tail.lines.length,
        truncated: Boolean(tail.truncated),
        totalSizeBytes: Number(tail.totalSizeBytes || 0),
      });
    } catch (error) {
      return res.status(500).json({
        error: `Failed to read log: ${error?.message || "unknown error"}`,
      });
    }
  });

  return router;
}

export { createPrivateDashRoutes };
