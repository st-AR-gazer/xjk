class MapCampaignService {
  constructor({ repository, assignStoredMapMetadata, assignStoredMapNumbersBySimilarity }) {
    this.repository = repository;
    this.assignStoredMapMetadata = assignStoredMapMetadata;
    this.assignStoredMapNumbersBySimilarity = assignStoredMapNumbersBySimilarity;
  }

  updateHookConfig(payload = {}) {
    const hook = this.repository.configuration.updateHookConfig({
      hookKey: payload.hookKey || "altered-club",
      clubId: payload.clubId,
      clubName: payload.clubName,
      sourceLabel: payload.sourceLabel,
      enabled: payload.enabled,
      autoTrackNewMaps: payload.autoTrackNewMaps,
    });
    if (!hook) return { error: "Unable to update altered hook config." };
    return { hook };
  }

  async updateMapCampaign({ mapUid, campaignName, slot }) {
    if (!campaignName || !String(campaignName).trim()) {
      return { error: "campaignName is required." };
    }
    const updated = this.repository.campaigns.updateMapCampaign({
      mapUid,
      campaignName: String(campaignName).trim(),
      slot: Number(slot) || 1,
    });
    if (!updated) return { error: "Map not found." };

    const metadata = this.assignStoredMapMetadata({ mapUids: [mapUid], limit: 1 });
    const similarity = await this.assignStoredMapNumbersBySimilarity({
      mapUids: [mapUid],
      limit: 1,
      persistCandidates: true,
    });
    const refreshed = this.repository.maps.getMapInfo(mapUid);
    const warnings = [
      metadata?.error || null,
      similarity?.ok === false ? "Content similarity assignment failed." : null,
    ]
      .filter(Boolean)
      .join(" | ");
    return {
      updated: refreshed?.exists ? refreshed : updated,
      metadata: metadata?.error ? null : metadata,
      similarity: similarity?.ok === false ? null : similarity,
      warning: warnings || null,
    };
  }
}

export { MapCampaignService };
