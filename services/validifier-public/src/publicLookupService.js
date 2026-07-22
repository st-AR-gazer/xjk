import { UpstreamHttpError } from "./internalClient.js";
import { upstreamIsUnavailable } from "./httpResponses.js";
import {
  bundleFromSubmission,
  mergeMapPayloadWithPendingSubmissions,
  normalizeMapVerdictList,
  normalizeRecordBundle,
  overlayRecordBundleWithSubmission,
} from "./verificationModel.js";

function internalTrackForPublicTrack(track) {
  return track === "deep" ? "runtime_validation" : "replay_validation";
}

export function createPublicLookupService({ internalClient, repository, responseCache } = {}) {
  if (!internalClient || !repository || !responseCache) {
    throw new Error("internalClient, repository, and responseCache are required for public lookups.");
  }

  async function getPrivateRecordBundle(recordId) {
    return responseCache.withValue(`record:${recordId}`, async () => {
      const payload = await internalClient.requestJson(`/v1/records/${encodeURIComponent(recordId)}/verdicts`);
      return normalizeRecordBundle(payload, recordId, { track: "all" });
    });
  }

  async function fetchMapTrackPayload(mapUid, track, limit) {
    try {
      const payload = await internalClient.requestJson(
        `/v1/maps/${encodeURIComponent(mapUid)}/verdicts?track=${encodeURIComponent(
          internalTrackForPublicTrack(track)
        )}`
      );
      return normalizeMapVerdictList(payload, mapUid, track, { limit });
    } catch (error) {
      if (!(error instanceof UpstreamHttpError) || error.statusCode !== 404 || track !== "deep") throw error;
      await internalClient.requestJson(
        `/v1/maps/${encodeURIComponent(mapUid)}/verdicts?track=${encodeURIComponent("replay_validation")}`
      );
      return normalizeMapVerdictList({ data: { map_uid: mapUid, verdicts: [] } }, mapUid, track, { limit });
    }
  }

  async function getPublicRecordLookup(recordId) {
    const submission = repository.getLatestSubmissionForRecord(recordId);
    try {
      const result = await getPrivateRecordBundle(recordId);
      return {
        cacheStatus: result.cacheStatus,
        payload: overlayRecordBundleWithSubmission(result.payload, submission),
      };
    } catch (error) {
      if (
        submission &&
        ((error instanceof UpstreamHttpError && error.statusCode === 404) || upstreamIsUnavailable(error))
      ) {
        return { cacheStatus: "local", payload: bundleFromSubmission(submission, "all") };
      }
      throw error;
    }
  }

  async function getPublicMapLookup(mapUid, track, limit) {
    const submissions = repository.listLatestSubmissionsForMap(mapUid, 5000);
    try {
      const result = await responseCache.withValue(`map:${mapUid}:track:${track}:limit:${limit}`, () =>
        fetchMapTrackPayload(mapUid, track, limit)
      );
      return {
        cacheStatus: submissions.length && result.cacheStatus === "hit" ? "hit+local" : result.cacheStatus,
        payload: mergeMapPayloadWithPendingSubmissions(result.payload, submissions, { track, limit }),
      };
    } catch (error) {
      if (
        submissions.length &&
        ((error instanceof UpstreamHttpError && error.statusCode === 404) || upstreamIsUnavailable(error))
      ) {
        return {
          cacheStatus: "local",
          payload: mergeMapPayloadWithPendingSubmissions({ map_uid: mapUid, track, items: [] }, submissions, {
            track,
            limit,
          }),
        };
      }
      throw error;
    }
  }

  return { getPrivateRecordBundle, getPublicMapLookup, getPublicRecordLookup };
}
