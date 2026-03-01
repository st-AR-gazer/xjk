class ClubTrackerService {
  constructor({
    enabled = true,
    aggregatorBaseUrl,
    aggregatorToken,
    projectKey,
    projectName,
    sourceLabel,
    requestTimeoutMs = 15000,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.aggregatorBaseUrl = String(aggregatorBaseUrl || "").replace(/\/+$/, "");
    this.aggregatorToken = String(aggregatorToken || "").trim();
    this.projectKey = String(projectKey || "tracker-club").trim();
    this.projectName = String(projectName || this.projectKey).trim();
    this.sourceLabel = String(sourceLabel || "tracker-club").trim();
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);

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

  async requestJson(url, { method = "GET", body } = {}) {
    const headers = {
      "content-type": "application/json",
    };
    if (this.aggregatorToken) {
      headers.authorization = `Bearer ${this.aggregatorToken}`;
      headers["x-ingest-token"] = this.aggregatorToken;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const details =
        payload?.error ||
        payload?.message ||
        String(text || "").trim() ||
        `HTTP ${response.status}`;
      throw new Error(`Request failed (${response.status}) for ${method} ${url}: ${details}`);
    }

    return payload;
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
