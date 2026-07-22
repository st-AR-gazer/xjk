import { normalizeCampaignRequest } from "./mapInput.js";

function campaignMatches(current, desired) {
  return (
    String(current?.campaignName || "")
      .trim()
      .toLowerCase() === desired.campaignName.toLowerCase() &&
    Number(current?.slot || 0) === desired.slot &&
    Number(current?.clubId || 0) === desired.clubId
  );
}

function reconcileCampaignLink({ statements, linkMapToCampaign }, item, mapUid) {
  const desired = normalizeCampaignRequest(item);
  if (!desired) return false;
  const current = statements.selectLatestCampaign.get(mapUid);
  if (current && campaignMatches(current, desired)) return false;
  return Boolean(linkMapToCampaign({ mapUid, ...desired }));
}

export { campaignMatches, reconcileCampaignLink };
