import { UpstreamHttpError } from "./internalClient.js";
import { upstreamIsUnavailable } from "./httpResponses.js";
import { buildLivePayload } from "./liveQueueModel.js";
import {
  bundleFromSubmission,
  extractVerdictItems,
  normalizeRecordBundle,
  overlayRecordBundleWithSubmission,
} from "./verificationModel.js";

export function createLiveQueueService({ internalClient, repository, lookupService, logger = console } = {}) {
  if (!internalClient || !repository || !lookupService) {
    throw new Error("internalClient, repository, and lookupService are required for live queues.");
  }

  async function getBundlesFromBatch(recordIds, localSubmissionsByRecordId) {
    const payload = await internalClient.requestJson("/v1/verdicts/batch", {
      method: "POST",
      body: { record_ids: recordIds },
    });
    const itemsByRecordId = new Map(recordIds.map((recordId) => [recordId, []]));
    for (const item of extractVerdictItems(payload)) {
      const recordId = String(item?.record_id ?? item?.recordId ?? "").trim();
      if (recordId && itemsByRecordId.has(recordId)) itemsByRecordId.get(recordId).push(item);
    }
    return recordIds.map((recordId) => {
      const submission = localSubmissionsByRecordId.get(recordId) || null;
      const itemPayload = { data: { record_id: recordId, verdicts: itemsByRecordId.get(recordId) || [] } };
      return overlayRecordBundleWithSubmission(
        normalizeRecordBundle(itemPayload, recordId, { track: "all" }),
        submission
      );
    });
  }

  async function getRecordBundles(recordIds, localSubmissionsByRecordId) {
    if (!recordIds.length) return [];
    try {
      return await getBundlesFromBatch(recordIds, localSubmissionsByRecordId);
    } catch (error) {
      logger.warn("[validifier-public] live batch lookup fell back to per-record fetch:", error?.message || error);
    }

    return Promise.all(
      recordIds.map(async (recordId) => {
        const submission = localSubmissionsByRecordId.get(recordId) || null;
        try {
          const result = await lookupService.getPublicRecordLookup(recordId);
          return overlayRecordBundleWithSubmission(result.payload, submission);
        } catch (error) {
          if (
            submission &&
            ((error instanceof UpstreamHttpError && error.statusCode === 404) || upstreamIsUnavailable(error))
          ) {
            return bundleFromSubmission(submission, "all");
          }
          throw error;
        }
      })
    );
  }

  async function getLiveQueue({ limit, mapLimit }) {
    const submissions = repository.listLatestSubmissions(limit);
    const localSubmissions = new Map(submissions.map((item) => [item.record_id, item]));
    const bundles = await getRecordBundles(
      submissions.map((item) => item.record_id),
      localSubmissions
    );
    return buildLivePayload(bundles, { limit, mapLimit });
  }

  return { getLiveQueue };
}
