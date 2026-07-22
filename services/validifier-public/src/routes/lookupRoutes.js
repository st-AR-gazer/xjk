import { UpstreamHttpError } from "../internalClient.js";
import { mapErrorToResponse, sendSuccess, setPublicCacheHeaders } from "../httpResponses.js";
import {
  uniqueRecordIds,
  validateLimit,
  validateLookupValue,
  validateMapSort,
  validateMapStatus,
  validatePage,
  validateTrack,
} from "../requestValidation.js";
import {
  bundleFromSubmission,
  filterRecordBundleByTrack,
  overlayRecordBundleWithSubmission,
  paginateMapPayload,
} from "../verificationModel.js";

export function registerLookupRoutes(
  app,
  { cacheTtlMs, liveQueueService, logger = console, lookupService, repository } = {}
) {
  app.get("/api/v1/live", async (req, res) => {
    try {
      const payload = await liveQueueService.getLiveQueue({
        limit: validateLimit(req.query.limit, 250, 500),
        mapLimit: validateLimit(req.query.mapLimit, 18, 50),
      });
      res.setHeader("cache-control", "no-store");
      return sendSuccess(res, payload);
    } catch (error) {
      logger.error("[validifier-public] live queue failed:", error?.message || error);
      return mapErrorToResponse(res, error, "The public Validifier live queue is unavailable right now.");
    }
  });

  const handleRecordLookup = async (req, res) => {
    try {
      const recordId = validateLookupValue(req.params.recordId, "Record ID");
      const result = await lookupService.getPublicRecordLookup(recordId);
      setPublicCacheHeaders(res, cacheTtlMs, result.cacheStatus);
      return sendSuccess(res, result.payload);
    } catch (error) {
      logger.error(`[validifier-public] record lookup failed for "${req.params.recordId}":`, error?.message || error);
      return mapErrorToResponse(res, error, "No public verification data was found for that record.");
    }
  };
  app.get("/api/v1/records/:recordId", handleRecordLookup);
  app.get("/api/v1/records/:recordId/verdicts", handleRecordLookup);

  app.get("/api/v1/maps/:mapUid/verdicts", async (req, res) => {
    try {
      const mapUid = validateLookupValue(req.params.mapUid, "Map UID");
      const track = validateTrack(req.query.track, { fallback: "replay" });
      const limit = validateLimit(req.query.limit, 100);
      const result = await lookupService.getPublicMapLookup(mapUid, track, limit);
      const payload = paginateMapPayload(result.payload, {
        track,
        limit,
        page: validatePage(req.query.page, 1),
        sort: validateMapSort(req.query.sort, "rank_asc"),
        status: validateMapStatus(req.query.status, "all"),
      });
      setPublicCacheHeaders(res, cacheTtlMs, result.cacheStatus);
      return sendSuccess(res, payload);
    } catch (error) {
      logger.error(`[validifier-public] map lookup failed for "${req.params.mapUid}":`, error?.message || error);
      return mapErrorToResponse(res, error, "No public verification data was found for that map.");
    }
  });

  app.post("/api/v1/verdicts/batch", async (req, res) => {
    try {
      const recordIds = uniqueRecordIds(req.body?.record_ids);
      const trackMode = validateTrack(req.body?.track, { allowAll: true, fallback: "all" });
      const localSubmissions = new Map(
        repository.getLatestSubmissionsForRecordIds(recordIds).map((item) => [item.record_id, item])
      );
      const settled = await Promise.all(
        recordIds.map(async (recordId) => {
          const localSubmission = localSubmissions.get(recordId) || null;
          try {
            const result = await lookupService.getPrivateRecordBundle(recordId);
            return {
              kind: "found",
              recordId,
              cacheStatus: result.cacheStatus,
              bundle: filterRecordBundleByTrack(
                overlayRecordBundleWithSubmission(result.payload, localSubmission),
                trackMode
              ),
            };
          } catch (error) {
            if (error instanceof UpstreamHttpError && error.statusCode === 404) {
              if (localSubmission) {
                return {
                  kind: "found",
                  recordId,
                  cacheStatus: "local",
                  bundle: filterRecordBundleByTrack(bundleFromSubmission(localSubmission, "all"), trackMode),
                };
              }
              return { kind: "missing", recordId };
            }
            throw error;
          }
        })
      );
      const cacheStatus = settled.every((item) => item.kind !== "found" || item.cacheStatus === "hit")
        ? "hit"
        : settled.some((item) => item.cacheStatus === "local")
          ? "miss+local"
          : "miss";
      setPublicCacheHeaders(res, cacheTtlMs, cacheStatus);
      return sendSuccess(res, {
        records: settled.filter((item) => item.kind === "found").map((item) => item.bundle),
        missing_record_ids: settled.filter((item) => item.kind === "missing").map((item) => item.recordId),
      });
    } catch (error) {
      logger.error("[validifier-public] batch lookup failed:", error?.message || error);
      return mapErrorToResponse(res, error, "One or more records could not be found.");
    }
  });
}
