import { fetchJson } from "../../../../shared/xjk-core/http.js?v=2";
import { fetchPagedCollection } from "../../shared/paged-collection.js?v=2";

const API = Object.freeze({
  stats: "/api/v1/alterations/stats",
  alterations: "/api/v1/alterations/types",
  campaigns: "/api/v1/alterations/campaigns",
  maps: "/api/v1/alterations/maps",
  mapDetail: "/api/v1/public/maps",
});

function createAlterationsTransport({ fetchJsonImpl = fetchJson, resolveUrl = (value) => value } = {}) {
  const fetchPage = (url) => fetchJsonImpl(url);

  async function loadInitialData() {
    const [stats, alterations, campaigns] = await Promise.all([
      fetchJsonImpl(resolveUrl(API.stats)),
      fetchJsonImpl(resolveUrl(API.alterations)),
      fetchJsonImpl(resolveUrl(`${API.campaigns}?limit=2000&offset=0&catalog_only=1&linked_only=1`)),
    ]);
    return { stats, alterations, campaigns };
  }

  function loadAlterationMaps(slug) {
    return fetchPagedCollection(API.maps, "maps", {
      fetchPage,
      resolveUrl,
      limit: 250,
      maxPages: 20,
      params: {
        alteration: slug,
        sort: "change_count",
      },
    });
  }

  function loadCampaignMaps(campaignId) {
    return fetchPagedCollection(API.maps, "maps", {
      fetchPage,
      resolveUrl,
      limit: 250,
      maxPages: 12,
      params: {
        campaignIds: campaignId,
        sort: "name",
      },
    });
  }

  function loadMapDetail(mapUid) {
    return fetchJsonImpl(resolveUrl(`${API.mapDetail}/${encodeURIComponent(mapUid)}`));
  }

  return { loadAlterationMaps, loadCampaignMaps, loadInitialData, loadMapDetail };
}

export { API, createAlterationsTransport };
