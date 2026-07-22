import { mergeMapDetail, normalizeMapUid, uniqueBy } from "../serviceSupport.js";

class MapHydrationStage {
  async hydrate({ liveClient, campaigns = [], fetchMapDetails, onPrepared = null, onChunk = null }) {
    const mapUids = uniqueBy(
      campaigns.flatMap((campaign) => campaign.maps.map((map) => map.uid)),
      (uid) => String(uid).toLowerCase()
    );
    const mapDetailsByUid = new Map();
    onPrepared?.({ campaigns, mapUids });

    if (fetchMapDetails && mapUids.length) {
      const detailPayload = onChunk
        ? await liveClient.getMapsByUidList(mapUids, { onChunk })
        : await liveClient.getMapsByUidList(mapUids);
      for (const item of detailPayload) {
        const uid = normalizeMapUid(item?.uid || item?.mapUid || item?.map_uid);
        if (uid) mapDetailsByUid.set(uid.toLowerCase(), item);
      }
    }

    const enrichedCampaigns = campaigns.map((campaign) => ({
      ...campaign,
      maps: campaign.maps.map((map) => mergeMapDetail(map, mapDetailsByUid.get(String(map.uid || "").toLowerCase()))),
    }));

    return {
      campaigns: enrichedCampaigns,
      mapUids,
      mapDetailsByUid,
    };
  }
}

export { MapHydrationStage };
