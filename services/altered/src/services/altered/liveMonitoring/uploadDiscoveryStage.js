import {
  extractUploadBuckets,
  extractUploadDescriptorFromActivity,
  firstPositiveInt,
  mergeUploadBuckets,
} from "../serviceSupport.js";

class UploadDiscoveryStage {
  collectCandidates({ activities = [], catalogBuckets = [] } = {}) {
    const activityBuckets = activities.map((activity) => extractUploadDescriptorFromActivity(activity)).filter(Boolean);
    return mergeUploadBuckets(activityBuckets, catalogBuckets);
  }

  async discover({
    liveClient,
    clubId,
    candidates = [],
    shouldHydrate = () => true,
    onHydrationWarning = null,
    onBucketProcessed = null,
  }) {
    const hydratedBuckets = [];
    let detailsLoaded = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const bucket = candidates[index];
      const bucketId = firstPositiveInt([bucket?.bucketId]);
      let hydrated = bucket;

      if (bucketId && shouldHydrate(bucket)) {
        try {
          const detailPayload = await liveClient.getClubBucketById(clubId, bucketId);
          const parsedBuckets = extractUploadBuckets([detailPayload]);
          if (parsedBuckets.length) {
            hydrated = mergeUploadBuckets([bucket], parsedBuckets)[0];
          }
          detailsLoaded += 1;
        } catch (error) {
          onHydrationWarning?.({ bucket, bucketId, error });
        }
      }

      hydratedBuckets.push(hydrated);
      onBucketProcessed?.({
        bucket: hydrated,
        bucketId: bucketId || null,
        index: index + 1,
        total: candidates.length,
        detailsLoaded,
      });
    }

    const uploadBuckets = mergeUploadBuckets(hydratedBuckets);
    const uploadMapsLoaded = uploadBuckets.reduce(
      (sum, bucket) => sum + (Array.isArray(bucket?.maps) ? bucket.maps.length : 0),
      0
    );
    return {
      uploadBuckets,
      uploadBucketDetailsLoaded: detailsLoaded,
      uploadMapsLoaded,
    };
  }
}

export { UploadDiscoveryStage };
