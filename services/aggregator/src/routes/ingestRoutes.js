import express from "express";

const ARL_PROJECT_KEY = "arl-player-directory";
const ARL_PROJECT_NAME = "Arbitrary Record Loader Player Directory";
const ARL_SOURCE_LABEL = "arl-player-directory";
const ARL_MAX_BATCH_SIZE = 500;
const OPENPLANET_TOKEN_MAX_AGE_SECONDS = 10 * 60;

function countDisplayNameEntries(payload = {}) {
  const names = Array.isArray(payload?.names) ? payload.names.filter(Boolean) : [];
  const namesByAccountId =
    payload?.namesByAccountId && typeof payload.namesByAccountId === "object" && !Array.isArray(payload.namesByAccountId)
      ? Object.keys(payload.namesByAccountId)
      : [];
  return Math.max(names.length, namesByAccountId.length);
}

async function validateOpenplanetPluginToken({
  token = "",
  secret = "",
  validateUrl = "https://openplanet.dev/api/auth/validate",
} = {}) {
  const safeToken = String(token || "").trim();
  const safeSecret = String(secret || "").trim();
  const safeUrl = String(validateUrl || "").trim();

  if (!safeToken) {
    return { ok: false, status: 401, error: "Missing Openplanet auth token." };
  }
  if (!safeSecret) {
    return { ok: false, status: 503, error: "ARL Openplanet auth secret is not configured." };
  }

  const body = new URLSearchParams();
  body.set("token", safeToken);
  body.set("secret", safeSecret);

  try {
    const response = await fetch(safeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      return {
        ok: false,
        status: response.status || 401,
        error: payload?.error || `Openplanet auth validation failed (${response.status}).`,
      };
    }

    const tokenTime = Number(payload?.token_time || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!tokenTime || Math.abs(nowSeconds - tokenTime) > OPENPLANET_TOKEN_MAX_AGE_SECONDS) {
      return {
        ok: false,
        status: 401,
        error: "Openplanet auth token is too old.",
      };
    }

    return {
      ok: true,
      status: response.status || 200,
      accountId: String(payload?.account_id || "").trim().toLowerCase(),
      displayName: String(payload?.display_name || "").trim(),
      tokenTime,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error?.message || "Openplanet auth validation request failed.",
    };
  }
}

function createIngestRoutes(repository, { ingestToken = "", arlOpenplanetAuthSecret = "", openplanetValidateUrl = "" } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.path === "/display-names/arl") return next();
    if (!ingestToken) return next();
    const supplied =
      req.headers["x-ingest-token"] ||
      req.headers["x-admin-token"] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      "";
    if (String(supplied).trim() !== String(ingestToken).trim()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  });

  const handleIngest = (req, res) => {
    try {
      const result = repository.ingestTrackerRun(req.body || {});
      if (result?.error) {
        return res.status(400).json(result);
      }
      return res.json({
        ok: true,
        ingest: result,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest tracker payload.",
      });
    }
  };

  router.post("/tracker-run", handleIngest);
  router.post("/tracker-runs", handleIngest);

  router.post("/instance/register", (req, res) => {
    try {
      const result = repository.registerInstance(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, registration: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to register tracker instance.",
      });
    }
  });

  router.post("/instance/heartbeat", (req, res) => {
    try {
      const result = repository.heartbeatInstance(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, heartbeat: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest tracker heartbeat.",
      });
    }
  });

  router.post("/display-names", (req, res) => {
    try {
      const result = repository.ingestDisplayNames(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest display-name payload.",
      });
    }
  });

  router.post("/display-names/arl", async (req, res) => {
    if (!arlOpenplanetAuthSecret) {
      return res.status(503).json({
        error: "ARL Openplanet auth secret is not configured.",
      });
    }

    const body = req.body || {};
    const authResult = await validateOpenplanetPluginToken({
      token: body.opToken || body.openplanetToken || body.authToken,
      secret: arlOpenplanetAuthSecret,
      validateUrl: openplanetValidateUrl,
    });

    if (!authResult.ok) {
      return res.status(authResult.status || 401).json({
        error: authResult.error || "Openplanet auth validation failed.",
      });
    }

    const acceptedProjectKey = String(body.projectKey || "").trim();
    const acceptedSourceLabel = String(body.sourceLabel || "").trim();
    if (acceptedProjectKey && acceptedProjectKey !== ARL_PROJECT_KEY) {
      return res.status(400).json({ error: "Invalid ARL projectKey." });
    }
    if (acceptedSourceLabel && acceptedSourceLabel !== ARL_SOURCE_LABEL) {
      return res.status(400).json({ error: "Invalid ARL sourceLabel." });
    }

    const entryCount = countDisplayNameEntries(body);
    if (entryCount <= 0) {
      return res.status(400).json({ error: "No valid display-name entries provided." });
    }
    if (entryCount > ARL_MAX_BATCH_SIZE) {
      return res.status(413).json({ error: `ARL display-name batch too large (${entryCount} > ${ARL_MAX_BATCH_SIZE}).` });
    }

    try {
      const result = repository.ingestDisplayNames({
        projectKey: ARL_PROJECT_KEY,
        projectName: ARL_PROJECT_NAME,
        sourceLabel: ARL_SOURCE_LABEL,
        observedAt: body.observedAt,
        names: body.names,
        namesByAccountId: body.namesByAccountId,
      });
      if (result?.error) return res.status(400).json(result);

      return res.json({
        ok: true,
        ingest: result,
        auth: {
          accountId: authResult.accountId || null,
          displayName: authResult.displayName || null,
          tokenTime: authResult.tokenTime || null,
        },
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest ARL display-name payload.",
      });
    }
  });

  router.post("/club-snapshot", (req, res) => {
    try {
      const result = repository.ingestClubSnapshot(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest club snapshot payload.",
      });
    }
  });

  const handleEventsIngest = (req, res) => {
    try {
      const result = repository.ingestEvents(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest event payload.",
      });
    }
  };

  router.post("/event", handleEventsIngest);
  router.post("/events", handleEventsIngest);

  const handleTrafficIngest = (req, res) => {
    try {
      const result = repository.ingestTraffic(req.body || {});
      if (result?.error) return res.status(400).json(result);
      return res.json({ ok: true, ingest: result });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "Failed to ingest traffic payload.",
      });
    }
  };

  router.post("/traffic", handleTrafficIngest);
  router.post("/traffic/batch", handleTrafficIngest);

  return router;
}

export { createIngestRoutes };
