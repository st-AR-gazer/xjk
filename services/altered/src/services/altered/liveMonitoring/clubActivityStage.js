import { clampInt, extractActivities, extractMembers, extractUploadBuckets, uniqueBy } from "../serviceSupport.js";

class ClubActivityStage {
  async fetchAllActivities(liveClient, clubId, { activityPageSize, activeOnly, maxPages = 1200, onPageLoaded = null }) {
    const activities = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const maxPageCount = clampInt(maxPages, { min: 1, max: 5000, fallback: 1200 });
    let effectiveActiveOnly = Boolean(activeOnly);
    let forcedActiveOnlyFallback = false;

    while (page < maxPageCount) {
      let payload;
      try {
        payload = await liveClient.getClubActivities(clubId, {
          length: activityPageSize,
          offset,
          activeOnly: effectiveActiveOnly,
        });
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        const message = String(error?.message || "");
        const responseText = String(error?.responseText || "");
        const playerNotFound =
          message.includes("player:error-notFound") || responseText.includes("player:error-notFound");
        if (!effectiveActiveOnly && offset === 0 && statusCode === 404 && playerNotFound) {
          effectiveActiveOnly = true;
          forcedActiveOnlyFallback = true;
          continue;
        }
        throw error;
      }

      const pageActivities = extractActivities(payload);
      if (!pageActivities.length) break;
      activities.push(...pageActivities);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: pageActivities.length,
          totalLoaded: activities.length,
          activeOnly: effectiveActiveOnly,
          forcedFallback: forcedActiveOnlyFallback,
        });
      }
      if (pageActivities.length < activityPageSize) break;
      offset += pageActivities.length;
      page += 1;
    }

    return {
      activities,
      pagesLoaded,
      effectiveActiveOnly,
      forcedActiveOnlyFallback,
    };
  }

  async fetchAllMembers(liveClient, clubId, { pageSize = 250, onPageLoaded = null } = {}) {
    const result = await this.fetchPages({
      pageSize,
      fetchPage: ({ length, offset }) => liveClient.getClubMembers(clubId, { length, offset }),
      extractPage: extractMembers,
      onPageLoaded,
    });
    return {
      members: result.items,
      pagesLoaded: result.pagesLoaded,
    };
  }

  async fetchAllUploadBuckets(liveClient, clubId, { pageSize = 250, onPageLoaded = null } = {}) {
    const result = await this.fetchPages({
      pageSize,
      fetchPage: ({ length, offset }) =>
        liveClient.getClubBuckets({
          bucketType: "map",
          clubId,
          length,
          offset,
        }),
      extractPage: extractUploadBuckets,
      onPageLoaded,
    });
    return {
      buckets: uniqueBy(result.items, (bucket) => String(bucket.bucketId || 0)),
      pagesLoaded: result.pagesLoaded,
    };
  }

  async fetchPages({ pageSize, fetchPage, extractPage, onPageLoaded }) {
    const items = [];
    let offset = 0;
    let page = 0;
    let pagesLoaded = 0;
    const safePageSize = clampInt(pageSize, { min: 1, max: 250, fallback: 250 });

    while (page < 1200) {
      const payload = await fetchPage({ length: safePageSize, offset });
      const pageItems = extractPage(payload);
      if (!pageItems.length) break;
      items.push(...pageItems);
      pagesLoaded += 1;
      if (typeof onPageLoaded === "function") {
        onPageLoaded({
          page: page + 1,
          offset,
          pageSize: pageItems.length,
          totalLoaded: items.length,
        });
      }
      if (pageItems.length < safePageSize) break;
      offset += pageItems.length;
      page += 1;
    }

    return { items, pagesLoaded };
  }
}

export { ClubActivityStage };
