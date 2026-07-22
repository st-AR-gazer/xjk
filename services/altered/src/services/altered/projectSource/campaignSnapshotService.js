import {
  resolveCanonicalWeeklyShortsWeek,
  resolveWeeklyGrandWeek,
  resolveWeeklyShortsEntry,
  resolveWeeklyShortsWeek,
  WEEKLY_SHORTS_SOURCE_KEY,
  WEEKLY_SHORTS_SOURCE_LABEL,
  WEEKLY_SHORTS_SOURCE_TYPE,
  WEEKLY_SHORTS_CAMPAIGN_TYPE,
  OFFICIAL_SEASONAL_SOURCE_KEY,
  OFFICIAL_SEASONAL_SOURCE_LABEL,
  OFFICIAL_SEASONAL_SOURCE_TYPE,
  OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
  TOTD_SOURCE_KEY,
  TOTD_SOURCE_LABEL,
  TOTD_SOURCE_TYPE,
  TOTD_CAMPAIGN_TYPE,
  WEEKLY_GRANDS_SOURCE_KEY,
  WEEKLY_GRANDS_SOURCE_LABEL,
  WEEKLY_GRANDS_SOURCE_TYPE,
  WEEKLY_GRANDS_CAMPAIGN_TYPE,
  COMPETITION_SOURCE_KEY,
  COMPETITION_SOURCE_LABEL,
  COMPETITION_SOURCE_TYPE,
  COMPETITION_CAMPAIGN_TYPE,
  DISCOVERY_SOURCE_KEY,
  DISCOVERY_SOURCE_LABEL,
  DISCOVERY_SOURCE_TYPE,
  DISCOVERY_CAMPAIGN_TYPE,
  DISCOVERY_SOURCE_CLUB_ID,
  LEGACY_SOURCE_KEY,
  LEGACY_SOURCE_LABEL,
  LEGACY_SOURCE_TYPE,
  LEGACY_CAMPAIGN_TYPE,
  LEGACY_SOURCE_CLUB_ID,
  LEGACY_SOURCE_CAMPAIGNS,
  clampInt,
  toText,
} from "../serviceSupport.js";

function buildPausedPlaylistMap({
  mapUid,
  index,
  slotValue,
  maxSlot = 999,
  mapDetailsByUid,
  sourceKey,
  sourceLabel,
  buildSourceMetadata,
}) {
  const uid = toText(mapUid);
  if (!uid) return null;
  const detail = mapDetailsByUid.get(uid.toLowerCase()) || null;
  const slot = clampInt(slotValue, { min: 1, max: maxSlot, fallback: index + 1 });
  return {
    ...(detail && typeof detail === "object" ? detail : {}),
    uid,
    mapUid: uid,
    name: toText(detail?.name || uid) || uid,
    downloadUrl: toText(detail?.fileUrl || detail?.downloadUrl || detail?.download_url) || null,
    thumbnailUrl: toText(detail?.thumbnailUrl || detail?.thumbnail_url) || null,
    tracked: false,
    status: "paused",
    slot,
    position: slot,
    raw: {
      ...(detail && typeof detail === "object" ? detail : {}),
      ...buildSourceMetadata({ slot, detail, mapUid: uid }),
      sourceKey,
      sourceLabel,
    },
  };
}

class CampaignSnapshotService {
  buildOfficialSeasonalCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const maps = playlist
          .map((item, index) =>
            buildPausedPlaylistMap({
              mapUid: item?.mapUid,
              index,
              slotValue: item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              mapDetailsByUid,
              sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
              sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
              buildSourceMetadata: ({ slot }) => ({
                officialSeasonal: {
                  seasonUid: toText(campaign?.seasonUid) || null,
                  position: slot,
                },
              }),
            })
          )
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || null,
          campaignType: OFFICIAL_SEASONAL_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            sourceKey: OFFICIAL_SEASONAL_SOURCE_KEY,
            sourceLabel: OFFICIAL_SEASONAL_SOURCE_LABEL,
            sourceType: OFFICIAL_SEASONAL_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildTotdCampaignSnapshots(rawMonths = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawMonths) ? rawMonths : [])
      .map((month) => {
        const year = clampInt(month?.year, { min: 2020, max: 2100, fallback: 0 }) || null;
        const monthNumber = clampInt(month?.month, { min: 1, max: 12, fallback: 0 }) || null;
        const name =
          year && monthNumber
            ? `TOTD ${String(year)}-${String(monthNumber).padStart(2, "0")}`
            : toText(month?.name) || null;
        const days = Array.isArray(month?.days) ? month.days : [];
        const maps = days
          .map((day, index) =>
            buildPausedPlaylistMap({
              mapUid: day?.mapUid,
              index,
              slotValue: day?.monthDay ?? day?.day ?? day?.position ?? index + 1,
              maxSlot: 31,
              mapDetailsByUid,
              sourceKey: TOTD_SOURCE_KEY,
              sourceLabel: TOTD_SOURCE_LABEL,
              buildSourceMetadata: ({ slot }) => ({
                totd: {
                  campaignId: Number(day?.campaignId || 0) || null,
                  monthDay: slot,
                  year,
                  month: monthNumber,
                  startTimestamp: day?.startTimestamp || null,
                  endTimestamp: day?.endTimestamp || null,
                },
              }),
            })
          )
          .filter(Boolean);

        return {
          id: year && monthNumber ? Number(`${year}${String(monthNumber).padStart(2, "0")}`) : null,
          name,
          campaignType: TOTD_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: maps[0]?.raw?.totd?.startTimestamp || null,
          endTimestamp: maps[maps.length - 1]?.raw?.totd?.endTimestamp || null,
          raw: {
            ...(month && typeof month === "object" ? month : {}),
            sourceKey: TOTD_SOURCE_KEY,
            sourceLabel: TOTD_SOURCE_LABEL,
            sourceType: TOTD_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildWeeklyGrandsCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const canonicalWeek = resolveWeeklyGrandWeek({
          campaignName: campaign?.name,
          campaignPayload: campaign,
        });
        const maps = playlist
          .map((item, index) =>
            buildPausedPlaylistMap({
              mapUid: item?.mapUid,
              index,
              slotValue: item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              mapDetailsByUid,
              sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
              sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
              buildSourceMetadata: () => ({
                weeklyGrand: {
                  seasonUid: toText(campaign?.seasonUid) || null,
                  week: clampInt(campaign?.week, { min: 1, max: 60, fallback: 0 }) || null,
                  canonicalWeek: canonicalWeek || null,
                  isCanonicalNadeoWeek: Boolean(canonicalWeek),
                  year: clampInt(campaign?.year, { min: 2020, max: 2100, fallback: 0 }) || null,
                },
              }),
            })
          )
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || null,
          campaignType: WEEKLY_GRANDS_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            weeklyGrand: {
              week: clampInt(campaign?.week, { min: 1, max: 60, fallback: 0 }) || null,
              canonicalWeek: canonicalWeek || null,
              isCanonicalNadeoWeek: Boolean(canonicalWeek),
            },
            sourceKey: WEEKLY_GRANDS_SOURCE_KEY,
            sourceLabel: WEEKLY_GRANDS_SOURCE_LABEL,
            sourceType: WEEKLY_GRANDS_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildDiscoveryCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((payload) => {
        const campaign = payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : payload;
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const maps = playlist
          .map((item, index) =>
            buildPausedPlaylistMap({
              mapUid: item?.mapUid,
              index,
              slotValue: item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              mapDetailsByUid,
              sourceKey: DISCOVERY_SOURCE_KEY,
              sourceLabel: DISCOVERY_SOURCE_LABEL,
              buildSourceMetadata: () => ({
                discovery: {
                  canonicalClubId: DISCOVERY_SOURCE_CLUB_ID,
                  canonicalCampaignId: Number(payload?.campaignId || campaign?.id || 0) || null,
                  mapsCount: Number(payload?.mapsCount || playlist.length || 0) || null,
                },
              }),
            })
          )
          .filter(Boolean);

        return {
          id: Number(payload?.campaignId || campaign?.id || 0) || null,
          name: toText(payload?.name || campaign?.name) || null,
          campaignType: DISCOVERY_CAMPAIGN_TYPE,
          published: true,
          startTimestamp:
            payload?.publicationTimestamp ?? campaign?.publicationTimestamp ?? campaign?.startTimestamp ?? null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(payload && typeof payload === "object" ? payload : {}),
            sourceKey: DISCOVERY_SOURCE_KEY,
            sourceLabel: DISCOVERY_SOURCE_LABEL,
            sourceType: DISCOVERY_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildLegacyCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((payload) => {
        const campaign = payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : payload;
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const descriptor = LEGACY_SOURCE_CAMPAIGNS.find(
          (d) => Number(d.campaignId) === Number(payload?.campaignId || campaign?.id || 0)
        );
        const campaignName = descriptor?.name || toText(payload?.name || campaign?.name) || null;
        const maps = playlist
          .map((item, index) =>
            buildPausedPlaylistMap({
              mapUid: item?.mapUid,
              index,
              slotValue: item?.position !== undefined ? Number(item.position) + 1 : index + 1,
              mapDetailsByUid,
              sourceKey: LEGACY_SOURCE_KEY,
              sourceLabel: LEGACY_SOURCE_LABEL,
              buildSourceMetadata: () => ({
                legacy: {
                  canonicalClubId: LEGACY_SOURCE_CLUB_ID,
                  canonicalCampaignId: Number(payload?.campaignId || campaign?.id || 0) || null,
                  mapsCount: Number(payload?.mapsCount || playlist.length || 0) || null,
                },
              }),
            })
          )
          .filter(Boolean);

        return {
          id: Number(payload?.campaignId || campaign?.id || 0) || null,
          name: campaignName,
          campaignType: LEGACY_CAMPAIGN_TYPE,
          published: true,
          startTimestamp:
            payload?.publicationTimestamp ?? campaign?.publicationTimestamp ?? campaign?.startTimestamp ?? null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(payload && typeof payload === "object" ? payload : {}),
            sourceKey: LEGACY_SOURCE_KEY,
            sourceLabel: LEGACY_SOURCE_LABEL,
            sourceType: LEGACY_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildCompetitionCampaignSnapshots(rawCampaigns = []) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const maps = (Array.isArray(campaign?.maps) ? campaign.maps : [])
          .map((map, index) => {
            const mapUid = toText(map?.uid || map?.mapUid || map?.map_uid);
            if (!mapUid) return null;
            const slot = clampInt(map?.slot ?? map?.position ?? index + 1, { min: 1, max: 999, fallback: index + 1 });
            return {
              ...(map && typeof map === "object" ? map : {}),
              uid: mapUid,
              mapUid,
              name: toText(map?.name || mapUid) || mapUid,
              downloadUrl: toText(map?.downloadUrl || map?.fileUrl || map?.download_url) || null,
              thumbnailUrl: toText(map?.thumbnailUrl || map?.thumbnail_url) || null,
              tracked: false,
              status: "paused",
              slot,
              position: slot,
              raw: {
                ...(map?.raw && typeof map.raw === "object" ? map.raw : map && typeof map === "object" ? map : {}),
                sourceKey: COMPETITION_SOURCE_KEY,
                sourceLabel: COMPETITION_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: Number(campaign?.campaignId || campaign?.id || 0) || null,
          name: toText(campaign?.name) || null,
          campaignType: COMPETITION_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign?.raw && typeof campaign.raw === "object"
              ? campaign.raw
              : campaign && typeof campaign === "object"
                ? campaign
                : {}),
            sourceKey: COMPETITION_SOURCE_KEY,
            sourceLabel: COMPETITION_SOURCE_LABEL,
            sourceType: COMPETITION_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => toText(campaign?.name) && campaign.maps.length > 0);
  }

  buildWeeklyShortsCampaignSnapshots(rawCampaigns = [], mapDetailsByUid = new Map()) {
    return (Array.isArray(rawCampaigns) ? rawCampaigns : [])
      .map((campaign) => {
        const week = resolveWeeklyShortsWeek({
          campaignName: campaign?.name,
          campaignPayload: campaign,
        });
        const canonicalWeek = resolveCanonicalWeeklyShortsWeek(week);
        const playlist = Array.isArray(campaign?.playlist) ? campaign.playlist : [];
        const maps = playlist
          .map((item, index) => {
            const mapUid = toText(item?.mapUid);
            if (!mapUid) return null;
            const detail = mapDetailsByUid.get(mapUid.toLowerCase()) || {};
            const slot = clampInt(item?.position !== undefined ? Number(item.position) + 1 : index + 1, {
              min: 1,
              max: 999,
              fallback: index + 1,
            });
            const weeklyEntry = resolveWeeklyShortsEntry({
              campaignName: campaign?.name,
              campaignPayload: campaign,
              mapPayload: detail,
              slot,
              mapName: detail?.name,
              filename: detail?.filename,
            });
            return {
              ...detail,
              uid: mapUid,
              mapUid,
              name: toText(detail?.name || weeklyEntry?.title || mapUid),
              tracked: Boolean(canonicalWeek),
              status: canonicalWeek ? "live" : "paused",
              slot,
              position: slot,
              raw: {
                ...(detail && typeof detail === "object" ? detail : {}),
                weeklyShorts: {
                  week: Number(week || 0) || null,
                  canonicalWeek: canonicalWeek || null,
                  isCanonicalNadeoWeek: Boolean(canonicalWeek),
                  position: slot,
                  absoluteMapNumber: Number(weeklyEntry?.mapNumber || 0) || null,
                  canonicalTitle: toText(weeklyEntry?.title) || null,
                },
                sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
                sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
              },
            };
          })
          .filter(Boolean);

        return {
          id: campaign?.id,
          name: toText(campaign?.name) || (week ? `Week ${week}` : "Weekly Shorts"),
          campaignType: WEEKLY_SHORTS_CAMPAIGN_TYPE,
          published: true,
          startTimestamp: campaign?.startTimestamp || null,
          endTimestamp: campaign?.endTimestamp || null,
          raw: {
            ...(campaign && typeof campaign === "object" ? campaign : {}),
            weeklyShorts: {
              week: Number(week || 0) || null,
              canonicalWeek: canonicalWeek || null,
              isCanonicalNadeoWeek: Boolean(canonicalWeek),
            },
            sourceKey: WEEKLY_SHORTS_SOURCE_KEY,
            sourceLabel: WEEKLY_SHORTS_SOURCE_LABEL,
            sourceType: WEEKLY_SHORTS_SOURCE_TYPE,
          },
          maps,
        };
      })
      .filter((campaign) => campaign.maps.length > 0);
  }
}

export { buildPausedPlaylistMap, CampaignSnapshotService };
