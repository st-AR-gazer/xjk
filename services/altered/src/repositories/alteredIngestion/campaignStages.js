import { normalizeCampaignSlotValue, toText } from "../alteredRepositorySupport.js";
import { linkCampaignPosition } from "./positionStore.js";

function objectPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function selectRawPayload(value) {
  const raw = objectPayload(value?.raw);
  if (Object.keys(raw).length) return raw;
  const payload = objectPayload(value?.payload);
  if (Object.keys(payload).length) return payload;
  return objectPayload(value);
}

function campaignInput(campaign, context, payload) {
  return {
    clubId: context.clubId,
    campaignName: toText(campaign?.name || campaign?.campaignName),
    externalCampaignId: campaign?.externalCampaignId ?? campaign?.campaignId ?? campaign?.campaign_id ?? campaign?.id,
    activityId: campaign?.activityId ?? campaign?.activity_id ?? campaign?.activity?.id,
    activityType: campaign?.activityType ?? campaign?.activity_type ?? campaign?.activity?.type,
    campaignType: context.campaignType || campaign?.campaignType || campaign?.campaign_type || campaign?.type,
    startTimestamp: campaign?.startTimestamp ?? campaign?.startDate ?? campaign?.start_date ?? campaign?.startsAt,
    endTimestamp: campaign?.endTimestamp ?? campaign?.endDate ?? campaign?.end_date ?? campaign?.endsAt,
    published: campaign?.published ?? campaign?.isPublished ?? context.publishedDefault,
    leaderboardGroupUid: campaign?.leaderboardGroupUid ?? campaign?.leaderboard_group_uid ?? campaign?.leaderboardUid,
    payload,
  };
}

function ingestCampaignMaps({ maps, campaignId, upsertMapRecord, positionStore, counters, decorateMapPayload }) {
  for (let index = 0; index < maps.length; index += 1) {
    const map = maps[index] || {};
    const stored = upsertMapRecord(map, { payload: decorateMapPayload(map) });
    if (!stored) continue;
    const slot = normalizeCampaignSlotValue({
      slot: map.slot,
      order: map.order,
      position: map.position ?? map?.payload?.campaignMap?.position,
      fallbackSlot: index + 1,
      max: 999,
    });
    if (
      linkCampaignPosition(positionStore, {
        mapUid: stored.mapUid,
        campaignId,
        slot,
        updatedAt: stored.now,
      })
    ) {
      counters.mapsLinked += 1;
    }
  }
}

function ingestCampaigns({
  campaigns,
  campaignRepository,
  upsertMapRecord,
  positionStore,
  counters,
  context,
  decorateCampaignPayload = selectRawPayload,
  decorateMapPayload = selectRawPayload,
}) {
  for (const campaign of campaigns) {
    const name = toText(campaign?.name || campaign?.campaignName);
    if (!name) continue;
    const saved = campaignRepository.upsertCampaign(
      campaignInput(campaign, context, decorateCampaignPayload(campaign))
    );
    const campaignId = Number(saved?.campaignId || 0);
    if (!campaignId) continue;
    counters.campaignsSeen += 1;
    ingestCampaignMaps({
      maps: Array.isArray(campaign?.maps) ? campaign.maps : [],
      campaignId,
      upsertMapRecord,
      positionStore,
      counters,
      decorateMapPayload,
    });
  }
}

export { ingestCampaigns, selectRawPayload };
