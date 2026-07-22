import { sanitizeResolvedDisplayName } from "../../../shared/displayNameResolution.js";
import { normalizeAccountId, normalizeBaseUrl } from "../../../shared/valueUtils.js";

function buildHeaders({ adminToken = "", sessionCookie = "", hasBody = false } = {}) {
  const headers = {};
  if (hasBody) headers["content-type"] = "application/json";
  if (adminToken) headers["x-admin-token"] = adminToken;
  if (sessionCookie) headers.cookie = sessionCookie;
  return headers;
}

class TrackerClient {
  constructor({
    publicBaseUrl,
    adminBaseUrl,
    adminToken = "",
    adminUsername = "",
    adminPassword = "",
    timeoutMs = 15000,
    logger = console,
  }) {
    this.publicBaseUrl = normalizeBaseUrl(publicBaseUrl);
    this.adminBaseUrl = normalizeBaseUrl(adminBaseUrl);
    this.adminToken = String(adminToken || "").trim();
    this.adminUsername = String(adminUsername || "").trim();
    this.adminPassword = String(adminPassword || "");
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 15000);
    this.logger = logger;
    this.adminSessionCookie = "";
    this.adminSessionExpiresAtMs = 0;
    this.pendingLoginPromise = null;
  }

  hasAdminCredentials() {
    return Boolean(this.adminUsername && this.adminPassword);
  }

  async ensureAdminSession({ forceRefresh = false } = {}) {
    if (this.adminToken) return true;
    if (!this.hasAdminCredentials()) return false;

    const nowMs = Date.now();
    if (!forceRefresh && this.adminSessionCookie && this.adminSessionExpiresAtMs - nowMs > 30000) {
      return true;
    }
    if (this.pendingLoginPromise) return this.pendingLoginPromise;

    this.pendingLoginPromise = (async () => {
      const loginUrl = `${normalizeBaseUrl(this.adminBaseUrl)}/auth/login`;
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: this.adminUsername,
          password: this.adminPassword,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Tracker admin login failed (${response.status}).`);
      }
      const setCookie = String(response.headers.get("set-cookie") || "").trim();
      const cookiePair = setCookie.split(";")[0]?.trim() || "";
      if (!cookiePair) {
        throw new Error("Tracker admin login did not return a session cookie.");
      }
      this.adminSessionCookie = cookiePair;
      const expiresAt = Date.parse(String(payload?.session?.expiresAt || ""));
      this.adminSessionExpiresAtMs = Number.isFinite(expiresAt) ? expiresAt : Date.now() + 10 * 60 * 60 * 1000;
      return true;
    })();

    try {
      return await this.pendingLoginPromise;
    } finally {
      this.pendingLoginPromise = null;
    }
  }

  async request(baseUrl, relativePath, { method = "GET", body, admin = false, timeoutMs = null } = {}) {
    const safePath = String(relativePath || "").replace(/^\/+/, "");
    const targetUrl = `${normalizeBaseUrl(baseUrl)}/${safePath}`;
    const safeTimeoutMs = Math.max(250, Number(timeoutMs ?? this.timeoutMs) || this.timeoutMs);
    const perform = async (attempt = 0) => {
      if (admin && !this.adminToken && this.hasAdminCredentials()) {
        try {
          await this.ensureAdminSession({
            forceRefresh: attempt > 0,
          });
        } catch (error) {
          const message = error?.message || "Tracker admin session login failed.";
          this.logger.warn(`[altered-tracker-client] admin login failed: ${message}`);
          return {
            ok: false,
            status: 0,
            error: message,
          };
        }
      }

      try {
        const response = await fetch(targetUrl, {
          method,
          headers: buildHeaders({
            adminToken: admin ? this.adminToken : "",
            sessionCookie: admin && !this.adminToken ? this.adminSessionCookie : "",
            hasBody: body !== undefined,
          }),
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(safeTimeoutMs),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          if (admin && !this.adminToken && this.hasAdminCredentials() && response.status === 401 && attempt < 1) {
            this.adminSessionCookie = "";
            this.adminSessionExpiresAtMs = 0;
            return perform(attempt + 1);
          }
          const message = payload?.error || payload?.detail || `Tracker request failed (${response.status}).`;
          return {
            ok: false,
            status: response.status,
            error: message,
          };
        }
        return {
          ok: true,
          status: response.status,
          data: payload,
        };
      } catch (error) {
        const message = error?.message || "Tracker request failed.";
        this.logger.warn(`[altered-tracker-client] ${method} ${targetUrl} failed: ${message}`);
        return {
          ok: false,
          status: 0,
          error: message,
        };
      }
    };

    return perform(0);
  }

  async getTrackerStatus({ timeoutMs = null } = {}) {
    return this.request(this.publicBaseUrl, "tracker/status", { timeoutMs });
  }

  async getWrFeed(limit = 24) {
    return this.request(this.publicBaseUrl, `wr/latest?limit=${Math.max(1, Number(limit) || 24)}`);
  }

  async getTrackerRuns(limit = 50, { timeoutMs = null } = {}) {
    return this.request(this.publicBaseUrl, `tracker/runs?limit=${Math.max(1, Number(limit) || 50)}`, { timeoutMs });
  }

  async getTrackedMaps(limit = 2000) {
    return this.request(this.publicBaseUrl, `tracked/maps?limit=${Math.max(1, Number(limit) || 2000)}`);
  }

  async getMapInfo(mapUid) {
    const safeMapUid = encodeURIComponent(String(mapUid || "").trim());
    return this.request(this.publicBaseUrl, `maps/info/${safeMapUid}`);
  }

  async getMedalLeaderboards(limit = 50) {
    return this.request(
      this.publicBaseUrl,
      `leaderboards/medals?limit=${Math.max(1, Number(limit) || 50)}&tracked_only=1`
    );
  }

  async getLeaderboardWrLeaderboards({
    overallLimit = 300,
    overallOffset = 0,
    perBucketLimit = 10,
    includeBuckets = true,
  } = {}) {
    const params = new URLSearchParams({
      overall_limit: String(Math.max(1, Number(overallLimit) || 300)),
      overall_offset: String(Math.max(0, Number(overallOffset) || 0)),
      per_bucket_limit: String(Math.max(1, Number(perBucketLimit) || 10)),
      tracked_only: "1",
      include_buckets: includeBuckets === false ? "0" : "1",
    });
    return this.request(this.publicBaseUrl, `leaderboards/wrs?${params.toString()}`);
  }

  async getTopWrAccounts(limit = 200) {
    return this.request(
      this.publicBaseUrl,
      `players/top-accounts?limit=${Math.max(1, Number(limit) || 200)}&tracked_only=1`
    );
  }

  async getLeaderboardCoverage({ trackedOnly = true } = {}) {
    return this.request(this.publicBaseUrl, `leaderboards/coverage?tracked_only=${trackedOnly === false ? 0 : 1}`);
  }

  async getPlayerNames(accountIds = [], { chunkSize = 50 } = {}) {
    const normalizedAccountIds = [];
    const seen = new Set();
    for (const rawAccountId of Array.isArray(accountIds) ? accountIds : []) {
      const accountId = normalizeAccountId(rawAccountId);
      if (!accountId || seen.has(accountId)) continue;
      seen.add(accountId);
      normalizedAccountIds.push(accountId);
    }
    if (!normalizedAccountIds.length) {
      return {
        ok: true,
        requested: 0,
        resolved: 0,
        namesByAccountId: {},
        warnings: [],
      };
    }

    const safeChunkSize = Math.max(1, Math.min(Number(chunkSize) || 50, 200));
    const namesByAccountId = {};
    const warnings = [];

    for (let offset = 0; offset < normalizedAccountIds.length; offset += safeChunkSize) {
      const chunk = normalizedAccountIds.slice(offset, offset + safeChunkSize);
      // Express's default query parser can drop very long repeated `accountId[]` params.
      // The tracker API accepts `accountId` as a delimited string, so send a single param.
      const query = `accountId=${encodeURIComponent(chunk.join(","))}`;
      const response = await this.request(this.publicBaseUrl, `players/names?${query}`);
      if (!response?.ok) {
        warnings.push(response?.error || `Failed player-name lookup for chunk at offset ${offset}.`);
        continue;
      }

      const payload = response.data || {};
      const map =
        payload.namesByAccountId && typeof payload.namesByAccountId === "object" ? payload.namesByAccountId : {};
      for (const [rawAccountId, rawDisplayName] of Object.entries(map)) {
        const accountId = normalizeAccountId(rawAccountId);
        const displayName = sanitizeResolvedDisplayName(rawDisplayName, { accountId });
        if (!accountId || !displayName) continue;
        namesByAccountId[accountId] = displayName;
      }
    }

    return {
      ok: warnings.length === 0,
      requested: normalizedAccountIds.length,
      resolved: Object.keys(namesByAccountId).length,
      namesByAccountId,
      warnings,
      error: warnings.length ? warnings[0] : null,
    };
  }

  async runTrackerNow() {
    return this.request(this.adminBaseUrl, "tracker/run-now", {
      method: "POST",
      body: {},
      admin: true,
    });
  }

  async bulkUpsertMaps(maps = []) {
    return this.request(this.adminBaseUrl, "maps/bulk-upsert", {
      method: "POST",
      body: { maps: Array.isArray(maps) ? maps : [] },
      admin: true,
    });
  }

  async bulkUpsertPlayerNames(players = [], source = "altered-mapper-sync") {
    return this.request(this.adminBaseUrl, "players/names/bulk-upsert", {
      method: "POST",
      body: {
        players: Array.isArray(players) ? players : [],
        source: String(source || "").trim() || "altered-mapper-sync",
      },
      admin: true,
    });
  }

  async updateMapTracking(mapUid, payload = {}) {
    return this.request(this.adminBaseUrl, `maps/${encodeURIComponent(mapUid)}/tracking`, {
      method: "POST",
      body: payload,
      admin: true,
    });
  }
}

export { TrackerClient };
