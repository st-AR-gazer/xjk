const SIM_PLAYERS = [
  "Xephi",
  "Nyota",
  "Sphynx",
  "Ari",
  "Kizaru",
  "Lynx",
  "Toki",
  "Kov",
  "Mira",
  "Polaris",
  "Sora",
  "Nova",
  "Haku",
  "Valk",
];

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

class TrackerService {
  constructor(repository, { trackerEngine = null } = {}) {
    this.repository = repository;
    this.trackerEngine = trackerEngine;
  }

  getMeta() {
    const summary = this.repository.getSummary();
    const runtime = this.trackerEngine ? this.trackerEngine.getStatus() : null;
    return {
      service: "altered-tracker",
      generatedAt: new Date().toISOString(),
      summary,
      tracker: runtime
        ? {
            provider: runtime.provider,
            tickSeconds: runtime.tickSeconds,
            enabled: runtime.enabled,
            timerActive: runtime.timerActive,
          }
        : null,
    };
  }

  getDashboard() {
    const maps = this.repository.getMaps({
      campaign: "all",
      trackedOnly: false,
      sort: "wr_recent",
      limit: 1200,
    });
    const wrFeed = this.repository.getWrFeed(24);
    const campaigns = this.repository.getCampaignNames();
    const summary = this.repository.getSummary();
    const mapOptions = this.repository.getMapOptions();
    const tracker = this.getTrackerStatus();
    return { maps, wrFeed, campaigns, summary, mapOptions, tracker };
  }

  getMaps(query) {
    return this.repository.getMaps(query);
  }

  getTrackedMaps(query) {
    return this.repository.getTrackedMaps(query);
  }

  getTrackedMapsApi(query) {
    const nowMs = Date.now();
    const runtimeMaxInterval = Math.max(
      0,
      Number(this.trackerEngine?.getStatus?.().maxCheckIntervalSeconds || 0)
    );
    return this.repository.getTrackedMaps(query).map((map) => {
      const frequencyRaw = Math.max(0, Number(map.checkFrequency || 0));
      const frequency =
        runtimeMaxInterval > 0
          ? Math.min(frequencyRaw || runtimeMaxInterval, runtimeMaxInterval)
          : frequencyRaw;
      const lastMs = Date.parse(map.lastCheckedAt || "");
      if (!Number.isFinite(lastMs)) {
        return {
          ...map,
          dueNow: true,
          nextCheckAt: null,
          nextCheckInSeconds: 0,
        };
      }
      const nextMs = lastMs + frequency * 1000;
      const dueNow = nextMs <= nowMs;
      return {
        ...map,
        dueNow,
        nextCheckAt: new Date(nextMs).toISOString(),
        nextCheckInSeconds: dueNow ? 0 : Math.ceil((nextMs - nowMs) / 1000),
      };
    });
  }

  getWrFeed(limit) {
    return this.repository.getWrFeed(limit);
  }

  getMapInfo(mapUid) {
    return this.repository.getMapInfo(mapUid);
  }

  getTrackerStatus() {
    const runtime = this.trackerEngine ? this.trackerEngine.getStatus() : null;
    return {
      runtime,
      latestRun: this.repository.getLatestTrackerRun(),
      summary: this.repository.getSummary(),
      trackedDueNow: this.getTrackedMapsApi({ q: "", limit: 500 }).filter((map) => map.dueNow).length,
    };
  }

  getTrackerRuns(limit) {
    return this.repository.getTrackerRuns(limit);
  }

  async runTrackerNow() {
    if (!this.trackerEngine) {
      return { error: "Tracker runtime is not enabled." };
    }
    const result = await this.trackerEngine.runNow({ reason: "manual-api" });
    return { run: result };
  }

  updateMapCampaign({ mapUid, campaignName, slot, clubId }) {
    if (!campaignName || !String(campaignName).trim()) {
      return { error: "campaignName is required." };
    }

    const updated = this.repository.updateMapCampaign({
      mapUid,
      campaignName: String(campaignName).trim(),
      slot: Number(slot) || 1,
      clubId: Number(clubId) || 558282,
    });
    if (!updated) return { error: "Map not found." };
    return { updated };
  }

  updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const hasTracked = typeof tracked === "boolean";
    const hasStatus = typeof status === "string";
    const hasFrequency = Number.isFinite(checkFrequency);
    if (!hasTracked && !hasStatus && !hasFrequency) {
      return { error: "Nothing to update. Provide tracked/status/checkFrequency." };
    }

    const updated = this.repository.updateMapTracking({
      mapUid,
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status).toLowerCase() : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });
    if (!updated) return { error: "Map not found." };
    return { updated };
  }

  simulateWr({ mapUid }) {
    let selected = null;
    if (mapUid) {
      selected = this.repository.getMapByUid(mapUid);
      if (!selected) return { error: "Map not found." };
    } else {
      const candidates = this.repository.getTrackedLiveCandidates();
      selected = pickRandom(candidates);
      if (!selected) return { error: "No tracked live maps available for simulation." };
    }

    const current = Math.max(1, Number(selected.wrMs || 0));
    const gain = 45 + Math.floor(Math.random() * 260);
    const recordTime = Math.max(20000, current - gain);
    const previousHolder = String(selected.wrHolder || "").trim();
    const holderPool = SIM_PLAYERS.filter((name) => name !== previousHolder);
    const displayName = pickRandom(holderPool) || previousHolder || "Unknown";
    const accountId = `acc-${displayName.toLowerCase()}`;

    const event = this.repository.insertWrEvent({
      mapUid: selected.uid,
      accountId,
      displayName,
      recordTime,
      timestamp: new Date().toISOString(),
    });
    if (!event) return { error: "Unable to insert simulated WR event." };
    return { event };
  }
}

export { TrackerService };
