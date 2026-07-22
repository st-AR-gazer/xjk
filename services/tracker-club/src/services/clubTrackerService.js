import { TrackerServiceRuntime } from "../../../shared/trackerServiceRuntime.js";

class ClubTrackerService extends TrackerServiceRuntime {
  constructor({
    enabled = true,
    aggregatorBaseUrl,
    aggregatorToken,
    projectKey,
    projectName,
    sourceLabel,
    requestTimeoutMs = 15000,
    logger = console,
  } = {}) {
    super({
      enabled,
      aggregatorBaseUrl,
      aggregatorToken,
      projectKey: projectKey || "tracker-club",
      projectName,
      sourceLabel: sourceLabel || "tracker-club",
      requestTimeoutMs,
      logger,
      logPrefix: "tracker-club",
    });

    this.lastIngestAt = null;
    this.lastError = null;
    this.lastSummary = null;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      projectKey: this.projectKey,
      projectName: this.projectName,
      sourceLabel: this.sourceLabel,
      aggregatorBaseUrl: this.aggregatorBaseUrl,
      hasAggregatorToken: Boolean(this.aggregatorToken),
      lastIngestAt: this.lastIngestAt,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
    };
  }

  setConfig({ enabled } = {}) {
    this.setEnabled(enabled);
    return this.getStatus();
  }

  async ingestSnapshot(snapshot = {}) {
    if (!this.enabled) return { error: "Club tracker is disabled." };

    const club = snapshot?.club || {};
    const clubId = Number(club?.id || club?.clubId || snapshot?.clubId || 0);
    if (!Number.isFinite(clubId) || clubId <= 0) {
      return { error: "club.id/clubId is required for club snapshot ingest." };
    }

    try {
      const payload = await this.requestJson(`${this.aggregatorBaseUrl}/ingest/club-snapshot`, {
        method: "POST",
        body: {
          projectKey: this.projectKey,
          projectName: this.projectName,
          sourceLabel: this.sourceLabel,
          observedAt: new Date().toISOString(),
          ...snapshot,
        },
      });

      this.lastIngestAt = new Date().toISOString();
      this.lastError = null;
      this.lastSummary = payload?.ingest || null;

      return payload?.ingest || {};
    } catch (error) {
      const message = error?.message || "Club snapshot ingest failed.";
      this.lastError = message;
      return { error: message };
    }
  }
}

export { ClubTrackerService };
