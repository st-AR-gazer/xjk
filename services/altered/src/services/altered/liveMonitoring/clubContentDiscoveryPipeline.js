import { extractCampaignDescriptorFromObject, extractCampaignFromActivity, uniqueBy } from "../serviceSupport.js";
import { CampaignDiscoveryStage } from "./campaignDiscoveryStage.js";
import { MapHydrationStage } from "./mapHydrationStage.js";
import { UploadDiscoveryStage } from "./uploadDiscoveryStage.js";

function campaignDescriptorIdentity(descriptor = {}) {
  return descriptor.campaignId ? `id:${descriptor.campaignId}` : `name:${String(descriptor.name || "").toLowerCase()}`;
}

class ClubContentDiscoveryPipeline {
  constructor({ uploadStage, campaignStage, mapStage } = {}) {
    this.uploadStage = uploadStage || new UploadDiscoveryStage();
    this.campaignStage = campaignStage || new CampaignDiscoveryStage();
    this.mapStage = mapStage || new MapHydrationStage();
  }

  collectUploadCandidates(options = {}) {
    return this.uploadStage.collectCandidates(options);
  }

  collectCampaignDescriptors({ activities = [], campaignEntries = [] } = {}) {
    return uniqueBy(
      [
        ...activities.map((activity) => extractCampaignFromActivity(activity)).filter(Boolean),
        ...campaignEntries.map((campaign) => extractCampaignDescriptorFromObject(campaign)).filter(Boolean),
      ],
      campaignDescriptorIdentity
    );
  }

  async discover({ liveClient, clubId, uploads = {}, campaigns = {}, maps = {}, lifecycle = {} }) {
    const uploadResult = await this.uploadStage.discover({
      liveClient,
      clubId,
      ...uploads,
    });
    lifecycle.uploadsDiscovered?.(uploadResult);

    const campaignResult = await this.campaignStage.discover({
      liveClient,
      clubId,
      ...campaigns,
    });
    lifecycle.campaignsDiscovered?.(campaignResult);

    const mapResult = await this.mapStage.hydrate({
      liveClient,
      campaigns: campaignResult.campaigns,
      ...maps,
    });

    return {
      ...uploadResult,
      ...campaignResult,
      campaigns: mapResult.campaigns,
      mapUids: mapResult.mapUids,
      mapDetailsByUid: mapResult.mapDetailsByUid,
    };
  }
}

export { ClubContentDiscoveryPipeline };
