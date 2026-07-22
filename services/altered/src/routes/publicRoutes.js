import { createHash } from "node:crypto";
import express from "express";
import { toText } from "../../../shared/valueUtils.js";

function parsePublicBoolean(value, fallback = undefined) {
  if (value === undefined) return fallback;
  const raw = toText(value).toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
}

function resolveRequestPath(req) {
  const raw = toText(req.originalUrl || req.baseUrl || req.url || "");
  const [pathOnly] = raw.split("?");
  return pathOnly || "/";
}

function resolveClientFingerprint(req) {
  const source = toText(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!source) return "";
  return createHash("sha256").update(source).digest("hex").slice(0, 20);
}

function resolveOrigin(req) {
  return toText(req.headers.origin || req.headers.referer || "");
}

function createPublicRoutes(service, { wrWebhookSecret = "" } = {}) {
  const router = express.Router();
  const safeWrWebhookSecret = toText(wrWebhookSecret);
  const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function parsePublicAccountIds(value) {
    return [
      ...new Set(
        (Array.isArray(value) ? value : [value])
          .flatMap((entry) => String(entry || "").split(/[\s,]+/))
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => ACCOUNT_ID_RE.test(entry))
      ),
    ];
  }

  function registerRoute(method, path, endpointKey, handler, { resolveMapUid = null } = {}) {
    router[method](path, async (req, res, next) => {
      const startedAt = Date.now();
      let logged = false;

      const finalize = () => {
        if (logged) return;
        logged = true;
        if (typeof service.catalog.recordPublicApiRequest !== "function") return;
        try {
          service.catalog.recordPublicApiRequest({
            endpointKey,
            requestPath: resolveRequestPath(req),
            method,
            statusCode: Number(res.statusCode || 200) || 200,
            mapUid: typeof resolveMapUid === "function" ? resolveMapUid(req) : "",
            origin: resolveOrigin(req),
            clientHash: resolveClientFingerprint(req),
            userAgent: toText(req.headers["user-agent"] || ""),
            durationMs: Date.now() - startedAt,
            createdAt: new Date().toISOString(),
          });
        } catch (error) {
          console.warn(`[altered-public-api] failed to log ${endpointKey}: ${error?.message || error}`);
        }
      };

      res.once("finish", finalize);
      res.once("close", finalize);

      try {
        await handler(req, res, next);
      } catch (error) {
        next(error);
      }
    });
  }

  registerRoute("get", "/public/endpoints", "public-api-catalog", async (_req, res) => {
    return res.json(service.catalog.getPublicApiCatalog());
  });

  registerRoute(
    "get",
    "/public/maps/:mapUid",
    "public-map-detail",
    async (req, res) => {
      const payload = service.catalog.getPublicMapDetail(req.params.mapUid, {
        wrHistoryLimit: req.query.wrHistoryLimit !== undefined ? Number(req.query.wrHistoryLimit) : undefined,
      });
      if (!payload?.exists) {
        return res.status(404).json({
          error: "Map not found.",
          mapUid: toText(req.params.mapUid),
        });
      }
      return res.json(payload);
    },
    {
      resolveMapUid: (req) => req.params.mapUid,
    }
  );

  registerRoute(
    "get",
    "/public/maps/:mapUid/viewer-diff",
    "public-map-viewer-diff",
    async (req, res) => {
      const payload = await service.maps.getMapViewerDiffPayload({
        targetMapUid: req.params.mapUid,
        referenceMapUid: req.query.referenceMapUid,
      });
      if (payload?.error) {
        const statusCode = /not found/i.test(String(payload.error || ""))
          ? 404
          : /required/i.test(String(payload.error || ""))
            ? 400
            : 409;
        return res.status(statusCode).json(payload);
      }
      return res.json(payload);
    },
    {
      resolveMapUid: (req) => req.params.mapUid,
    }
  );

  registerRoute("get", "/dashboard", "dashboard-summary", async (req, res) => {
    const query = req.query || {};
    const payload = await service.catalog.getDashboard({
      mapsLimit: query.mapsLimit !== undefined ? Number(query.mapsLimit) : undefined,
      mapsOffset: query.mapsOffset !== undefined ? Number(query.mapsOffset) : undefined,
      mapOptionsLimit: query.mapOptionsLimit !== undefined ? Number(query.mapOptionsLimit) : undefined,
      mapOptionsOffset: query.mapOptionsOffset !== undefined ? Number(query.mapOptionsOffset) : undefined,
      wrFeedLimit: query.wrFeedLimit !== undefined ? Number(query.wrFeedLimit) : undefined,
      includeMapOptions: parsePublicBoolean(query.includeMapOptions),
      includeTracker: parsePublicBoolean(query.includeTracker),
    });
    return res.json(payload);
  });

  registerRoute("get", "/latest-wr", "latest-wr", async (req, res) => {
    const query = req.query || {};
    const payload = await service.catalog.getLatestWr({
      includeRecent: parsePublicBoolean(query.includeRecent, true),
      limit: query.limit !== undefined ? Number(query.limit) : 24,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(payload);
  });

  registerRoute(
    "post",
    "/webhook/wr",
    "wr-webhook",
    async (req, res) => {
      if (!safeWrWebhookSecret) {
        return res.status(503).json({
          error: "WR webhook is not configured on this service.",
        });
      }

      const secret = toText(req.headers["x-webhook-secret"] || "");
      if (!secret || secret !== safeWrWebhookSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = req.body || {};
      const result = service.catalog.receiveWrWebhook({
        mapUid: body.mapUid ?? body.uid ?? body.map_uid,
        mapName: body.mapName ?? body.name ?? body.map_name,
        accountId: body.accountId ?? body.account_id,
        holder: body.holder ?? body.wrHolder ?? body.displayName,
        wrMs: body.wrMs ?? body.wr_ms ?? body.recordTime,
        recordedAt: body.recordedAt ?? body.at ?? body.timestamp,
      });
      if (result?.error) return res.status(400).json(result);
      return res.json(result);
    },
    {
      resolveMapUid: (req) => req.body?.mapUid ?? req.body?.uid ?? req.body?.map_uid,
    }
  );

  registerRoute(
    "get",
    "/maps/info/:mapUid",
    "legacy-map-info",
    async (req, res) => {
      const result = service.catalog.getLegacyMapInfo(req.params.mapUid);
      if (!result || result.exists === false) {
        return res.status(404).json({
          error: "Map not found.",
          mapUid: toText(req.params.mapUid),
        });
      }
      return res.json(result);
    },
    {
      resolveMapUid: (req) => req.params.mapUid,
    }
  );

  registerRoute("get", "/hook/altered", "hook-status", async (_req, res) => {
    const hook = service.catalog.getHookStatus();
    if (!hook) return res.status(404).json({ error: "Altered hook not configured." });
    return res.json({ hook });
  });

  registerRoute("get", "/hook/altered/maps", "hook-maps", async (req, res) => {
    const maps = service.catalog.getHookMaps({
      q: req.query.q || "",
      limit: Number(req.query.limit) || 1200,
    });
    return res.json({ maps, count: maps.length });
  });

  registerRoute("get", "/hook/altered/runs", "hook-runs", async (req, res) => {
    const runs = service.catalog.getHookRuns(Number(req.query.limit) || 30);
    return res.json({ runs, count: runs.length });
  });

  registerRoute("get", "/tracker/status", "tracker-status", async (_req, res) => {
    const payload = await service.tracker.getTrackerStatus();
    if (payload?.error) {
      return res.status(502).json({ error: payload.error });
    }
    return res.json(payload);
  });

  registerRoute("get", "/alterations/stats", "alterations-stats", async (_req, res) => {
    const payload = await service.catalog.getAlterationsStats();
    return res.json(payload);
  });

  registerRoute("get", "/alterations/maps/filters", "alterations-maps-filters", async (_req, res) => {
    const payload = service.catalog.getAlterationsMapFilters();
    return res.json(payload);
  });

  registerRoute("post", "/public/display-names/queue", "public-display-names-queue", async (req, res) => {
    const body = req.body || {};
    const accountIds = parsePublicAccountIds(body.accountIds ?? body.account_ids);
    const result = service.players.queuePriorityDisplayNameLookups(accountIds, {
      source: "public-maps-view",
    });
    return res.json({
      ok: true,
      accountIds,
      ...result,
    });
  });

  registerRoute("post", "/public/display-names/resolve", "public-display-names-resolve", async (req, res) => {
    const body = req.body || {};
    const accountIds = parsePublicAccountIds(body.accountIds ?? body.account_ids);
    const namesByAccountId = await service.players.resolvePlayerNamesByAccountIds(accountIds, {
      chunkSize: 100,
    });
    return res.json({
      ok: true,
      accountIds,
      namesByAccountId,
      resolved: Object.keys(namesByAccountId || {}).length,
    });
  });

  registerRoute("get", "/alterations/maps", "alterations-maps", async (req, res) => {
    const query = req.query || {};
    const payload = await service.catalog.getAlterationsMaps({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      q: query.q || "",
      sort: query.sort || query.order || "",
      campaignIds: query.campaignIds ?? query.campaign_ids,
      excludeCampaignIds: query.excludeCampaignIds ?? query.exclude_campaign_ids,
      status: query.status || "",
      statuses: query.statuses ?? query.status,
      excludeStatuses: query.excludeStatuses ?? query.exclude_statuses,
      season: query.season || "",
      year: query.year !== undefined ? Number(query.year) : undefined,
      alterationSlugs: query.alterationSlugs ?? query.alteration_slugs ?? query.alterations ?? query.alteration,
      excludeAlterationSlugs:
        query.excludeAlterationSlugs ??
        query.exclude_alteration_slugs ??
        query.excludeAlterations ??
        query.exclude_alterations,
      alterationIds: query.alterationIds ?? query.alteration_ids,
      mapNumber: query.mapNumber ?? query.map_number,
      environment: query.environment || "",
      environments: query.environments ?? query.environment,
      excludeEnvironments: query.excludeEnvironments ?? query.exclude_environments,
      mapType: query.mapType ?? query.map_type,
      mapTypes: query.mapTypes ?? query.map_types ?? query.mapType ?? query.map_type,
      excludeMapTypes: query.excludeMapTypes ?? query.exclude_map_types,
      hasWr: parsePublicBoolean(query.hasWr ?? query.has_wr),
      wrStates: query.wrStates ?? query.wr_states,
      excludeWrStates: query.excludeWrStates ?? query.exclude_wr_states,
      randomSeed: query.seed ?? query.randomSeed ?? query.random_seed,
    });
    return res.json(payload);
  });

  registerRoute("get", "/alterations/types", "alterations-types", async (_req, res) => {
    const payload = service.catalog.getAlterationTypes();
    return res.json(payload);
  });

  registerRoute("post", "/alterations/sync", "alterations-sync", async (req, res) => {
    const wait = parsePublicBoolean(req.query?.wait ?? req.query?.block);
    const payload = await service.catalog.queueAlterationsSync({
      reason: "public-api",
      wait: Boolean(wait),
    });
    return res.json(payload);
  });

  registerRoute("get", "/alterations/campaigns", "alterations-campaigns", async (req, res) => {
    const query = req.query || {};
    const payload = service.catalog.getAlterationsCampaigns({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
      catalogOnly: parsePublicBoolean(query.catalogOnly ?? query.catalog_only),
      linkedOnly: parsePublicBoolean(query.linkedOnly ?? query.linked_only),
      alterationSlugs: query.alterationSlugs ?? query.alteration_slugs ?? query.alterations ?? query.alteration,
      alterationIds: query.alterationIds ?? query.alteration_ids,
    });
    return res.json(payload);
  });

  registerRoute("get", "/alterations/uploads", "alterations-uploads", async (req, res) => {
    const query = req.query || {};
    const payload = service.catalog.getAlterationsUploads({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      offset: query.offset !== undefined ? Number(query.offset) : undefined,
    });
    return res.json(payload);
  });

  registerRoute("get", "/alterations/leaderboards", "alterations-leaderboards", async (req, res) => {
    const query = req.query || {};
    const payload = await service.catalog.getAlterationsLeaderboards({
      limit: query.limit !== undefined ? Number(query.limit) : undefined,
      mapsOffset: query.mapsOffset !== undefined ? Number(query.mapsOffset) : undefined,
      overallLimit: query.overallLimit !== undefined ? Number(query.overallLimit) : undefined,
      overallOffset: query.overallOffset !== undefined ? Number(query.overallOffset) : undefined,
      perBucketLimit: query.perBucketLimit !== undefined ? Number(query.perBucketLimit) : undefined,
      includeMaps: parsePublicBoolean(query.includeMaps),
      includeBuckets: parsePublicBoolean(query.includeBuckets),
      includeMedals: parsePublicBoolean(query.includeMedals),
    });
    return res.json(payload);
  });

  registerRoute("get", "/alterations/leaderboards/live", "alterations-leaderboards-live", async (req, res) => {
    const query = req.query || {};
    const payload = await service.catalog.getMonitorLeaderboardLive({
      leaderboardLimit: query.limit !== undefined ? Number(query.limit) : undefined,
      feedLimit: query.feedLimit !== undefined ? Number(query.feedLimit) : undefined,
    });
    return res.json(payload);
  });

  registerRoute(
    "post",
    "/request-update",
    "request-update",
    async (req, res) => {
      const body = req.body || {};
      const result = await service.catalog.submitUpdateRequest({
        uid: body.uid ?? body.mapUid ?? body.map_uid,
        name: body.name ?? body.mapName ?? body.map_name,
        reason: body.reason,
        requesterIp: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
        requesterUserAgent: req.headers["user-agent"] || "",
      });
      if (result?.error) return res.status(400).json(result);
      return res.json(result);
    },
    {
      resolveMapUid: (req) => req.body?.uid ?? req.body?.mapUid ?? req.body?.map_uid,
    }
  );

  return router;
}

export { createPublicRoutes };
