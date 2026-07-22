import { clampInt } from "../serviceSupport.js";

async function fetchAllPages({
  fetchPage,
  selectItems,
  length,
  maxPages,
  defaultLength,
  maxLength = 100,
  defaultMaxPages,
  onPageLoaded,
}) {
  const items = [];
  const safeLength = clampInt(length, { min: 1, max: maxLength, fallback: defaultLength });
  const safeMaxPages = clampInt(maxPages, { min: 1, max: 500, fallback: defaultMaxPages });
  let offset = 0;

  for (let page = 0; page < safeMaxPages; page += 1) {
    const payload = await fetchPage({ length: safeLength, offset });
    const pageItems = selectItems(payload);
    if (!pageItems.length) break;
    items.push(...pageItems);

    if (typeof onPageLoaded === "function") {
      onPageLoaded({
        page: page + 1,
        offset,
        pageSize: pageItems.length,
        totalLoaded: items.length,
        totalKnown: Number(payload?.itemCount || 0) || null,
      });
    }

    offset += pageItems.length;
    const totalKnown = Number(payload?.itemCount || 0);
    if (pageItems.length < safeLength || (totalKnown > 0 && items.length >= totalKnown)) break;
  }

  return items;
}

function selectCampaigns(payload) {
  return Array.isArray(payload?.campaignList) ? payload.campaignList : [];
}

class ProjectSourceApi {
  async fetchAllOfficialSeasonalCampaigns(liveClient, { length = 25, maxPages = 100, onPageLoaded = null } = {}) {
    return fetchAllPages({
      fetchPage: ({ length: pageLength, offset }) =>
        liveClient.getOfficialSeasonalCampaignsV2({ length: pageLength, offset }),
      selectItems: selectCampaigns,
      length,
      maxPages,
      defaultLength: 25,
      defaultMaxPages: 100,
      onPageLoaded,
    });
  }

  async fetchAllTotdMonths(liveClient, { length = 12, maxPages = 200, onPageLoaded = null } = {}) {
    return fetchAllPages({
      fetchPage: ({ length: pageLength, offset }) =>
        liveClient.getTotdMonths({ length: pageLength, offset, royal: false }),
      selectItems: (payload) => (Array.isArray(payload?.monthList) ? payload.monthList : []),
      length,
      maxPages,
      defaultLength: 12,
      defaultMaxPages: 200,
      onPageLoaded,
    });
  }

  async fetchAllWeeklyGrandsCampaigns(liveClient, { length = 25, maxPages = 200, onPageLoaded = null } = {}) {
    return fetchAllPages({
      fetchPage: ({ length: pageLength, offset }) =>
        liveClient.getWeeklyGrandsCampaigns({ length: pageLength, offset }),
      selectItems: selectCampaigns,
      length,
      maxPages,
      defaultLength: 25,
      defaultMaxPages: 200,
      onPageLoaded,
    });
  }

  async fetchAllWeeklyShortsCampaigns(liveClient, { length = 10, maxPages = 100, onPageLoaded = null } = {}) {
    return fetchAllPages({
      fetchPage: ({ length: pageLength, offset }) =>
        liveClient.getWeeklyShortsCampaigns({ length: pageLength, offset }),
      selectItems: selectCampaigns,
      length,
      maxPages,
      defaultLength: 10,
      maxLength: 50,
      defaultMaxPages: 100,
      onPageLoaded,
    });
  }
}

export { fetchAllPages, ProjectSourceApi };
