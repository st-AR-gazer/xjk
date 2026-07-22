import { buildCampaignSnapshot, uniqueBy } from "../serviceSupport.js";

function campaignIdentity(campaign = {}) {
  return campaign.campaignId ? `id:${campaign.campaignId}` : `name:${String(campaign.name || "").toLowerCase()}`;
}

class CampaignDiscoveryStage {
  async discover({
    liveClient,
    clubId,
    descriptors = [],
    keepCampaign = () => true,
    recoverHydrationError = null,
    onCampaignProcessed = null,
  }) {
    const campaigns = [];
    const discoveredMapUids = new Set();
    let campaignsWithMaps = 0;
    let mapsFromCampaigns = 0;

    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index];
      let campaignPayload = descriptor.raw || {};
      if (descriptor.campaignId) {
        try {
          campaignPayload = await liveClient.getClubCampaignById(clubId, descriptor.campaignId);
        } catch (error) {
          if (!recoverHydrationError) throw error;
          recoverHydrationError({ descriptor, error });
        }
      }

      const campaign = buildCampaignSnapshot({ descriptor, campaignPayload });
      if (campaign.maps.length) {
        campaignsWithMaps += 1;
        mapsFromCampaigns += campaign.maps.length;
        for (const map of campaign.maps) {
          if (map?.uid) discoveredMapUids.add(String(map.uid).toLowerCase());
        }
      }
      if (keepCampaign(campaign, descriptor)) campaigns.push(campaign);

      onCampaignProcessed?.({
        campaign,
        descriptor,
        index: index + 1,
        total: descriptors.length,
        campaignsWithMaps,
        mapsFromCampaigns,
        mapUidsDiscovered: discoveredMapUids.size,
      });
    }

    return {
      campaigns: uniqueBy(campaigns, campaignIdentity),
      campaignsProcessed: descriptors.length,
      campaignsWithMaps,
      mapsFromCampaigns,
      mapUidsDiscovered: discoveredMapUids.size,
    };
  }
}

export { CampaignDiscoveryStage };
