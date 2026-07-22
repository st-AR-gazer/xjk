const TIMELINE_SEASON_ORDER = Object.freeze({
  winter: 1,
  spring: 2,
  summer: 3,
  fall: 4,
});

const DISCOVERY_TIMELINE = Object.freeze({
  "snow-discovery": { season: "fall", year: 2023, offset: 0.5 },
  "rally-discovery": { season: "winter", year: 2024, offset: 0.5 },
  "desert-discovery": { season: "spring", year: 2024, offset: 0.5 },
  "stunt-discovery": { season: "summer", year: 2024, offset: 0.5 },
  "platform-discovery": { season: "fall", year: 2024, offset: 0.5 },
});

function createAlterationsState() {
  return {
    stats: null,
    alterations: [],
    campaigns: [],
    activeAlterationSlug: "",
    activeCampaignId: "",
    alterationSearch: "",
    mapSearch: "",
    mapSort: "name",
    alterationMaps: new Map(),
    campaignMaps: new Map(),
  };
}

function normalizeAlteration(item) {
  return {
    id: Number(item?.id || 0) || null,
    name: String(item?.name || "").trim(),
    slug: String(item?.slug || "").trim(),
    campaign_count: Number(item?.campaign_count || 0),
    map_count: Number(item?.map_count || 0),
  };
}

function getCampaignKey(campaign) {
  return String(campaign?.id || campaign?.campaign_external_id || campaign?.campaign_db_id || "");
}

function getAlterationBySlug(state, slug) {
  return state.alterations.find((item) => item.slug === slug) || null;
}

function getCampaignById(state, campaignId) {
  return state.campaigns.find((item) => getCampaignKey(item) === String(campaignId || "")) || null;
}

function getCampaignTimelineInfo(campaign) {
  const seasonKey = String(campaign?.season_key || "")
    .trim()
    .toLowerCase();
  if (DISCOVERY_TIMELINE[seasonKey]) {
    const special = DISCOVERY_TIMELINE[seasonKey];
    const seasonOrder = Number(TIMELINE_SEASON_ORDER[special.season] || 0);
    return {
      season: special.season,
      year: special.year,
      slot: seasonOrder + Number(special.offset || 0),
      value: special.year * 10 + seasonOrder + Number(special.offset || 0),
    };
  }

  const season = String(campaign?.season || "")
    .trim()
    .toLowerCase();
  const seasonYear = Number(campaign?.season_year || 0) || 0;
  if (TIMELINE_SEASON_ORDER[season] && seasonYear) {
    return {
      season,
      year: seasonYear,
      slot: TIMELINE_SEASON_ORDER[season],
      value: seasonYear * 10 + TIMELINE_SEASON_ORDER[season],
    };
  }

  const nameYear = Number(String(campaign?.name || "").match(/\b(20\d{2})\b/)?.[1] || 0) || 0;
  if (TIMELINE_SEASON_ORDER[season] && nameYear) {
    return {
      season,
      year: nameYear,
      slot: TIMELINE_SEASON_ORDER[season],
      value: nameYear * 10 + TIMELINE_SEASON_ORDER[season],
    };
  }

  return {
    season,
    year: seasonYear || nameYear || null,
    slot: null,
    value: null,
  };
}

function compareCampaignTimeline(left, right) {
  const leftTimeline = getCampaignTimelineInfo(left);
  const rightTimeline = getCampaignTimelineInfo(right);
  if (Number.isFinite(leftTimeline.value) && Number.isFinite(rightTimeline.value)) {
    const difference = rightTimeline.value - leftTimeline.value;
    if (difference !== 0) return difference;
  } else if (Number.isFinite(leftTimeline.value)) {
    return -1;
  } else if (Number.isFinite(rightTimeline.value)) {
    return 1;
  }

  const timestampDifference = Number(right?.sort_timestamp_ms || 0) - Number(left?.sort_timestamp_ms || 0);
  if (timestampDifference !== 0) return timestampDifference;
  return String(right?.id || "").localeCompare(String(left?.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getAlterationCampaigns(state, slug) {
  return state.campaigns
    .filter(
      (campaign) => Array.isArray(campaign?.alterations) && campaign.alterations.some((item) => item?.slug === slug)
    )
    .sort(compareCampaignTimeline);
}

function getAlterationStats(state, slug) {
  const campaigns = getAlterationCampaigns(state, slug);
  const alterationMaps = state.alterationMaps.get(String(slug || "")) || [];
  return {
    campaignCount: campaigns.length,
    mapCount: alterationMaps.length || campaigns.reduce((sum, campaign) => sum + Number(campaign?.map_count || 0), 0),
    trackedCount: alterationMaps.length
      ? alterationMaps.filter((map) => map?.tracking_status === "active" || map?.tracking_status === "live").length
      : campaigns.reduce((sum, campaign) => sum + Number(campaign?.map_count || 0), 0),
    wrChangeCount: alterationMaps.reduce((sum, map) => sum + Number(map?.change_count || 0), 0),
    latestSeason: campaigns.find((campaign) => campaign?.season_label)?.season_label || campaigns[0]?.name || "—",
  };
}

function getActiveCampaignMaps(state) {
  return state.campaignMaps.get(String(state.activeCampaignId || "")) || [];
}

function filterAndSortCampaignMaps(state, maps) {
  let filtered = [...maps];
  const query = state.mapSearch.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((map) => {
      const haystack = [map.name, map.author, map.wr_holder, map.map_uid, map.campaign_name]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }

  filtered.sort((left, right) => {
    if (state.mapSort === "wr_ms") {
      return (left.wr_ms || Number.MAX_SAFE_INTEGER) - (right.wr_ms || Number.MAX_SAFE_INTEGER);
    }
    if (state.mapSort === "author_time") {
      return (left.author_time || Number.MAX_SAFE_INTEGER) - (right.author_time || Number.MAX_SAFE_INTEGER);
    }
    if (state.mapSort === "wr_updated_at") {
      return new Date(right.wr_updated_at || 0) - new Date(left.wr_updated_at || 0);
    }
    if (state.mapSort === "change_count") {
      return Number(right.change_count || 0) - Number(left.change_count || 0);
    }
    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  return filtered;
}

export {
  compareCampaignTimeline,
  createAlterationsState,
  filterAndSortCampaignMaps,
  getActiveCampaignMaps,
  getAlterationBySlug,
  getAlterationCampaigns,
  getAlterationStats,
  getCampaignById,
  getCampaignKey,
  getCampaignTimelineInfo,
  normalizeAlteration,
};
