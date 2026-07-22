import { JsonServiceClient, normalizeVersionedApiPath } from "../../../shared/jsonServiceClient.js";

class TrackerClubClient extends JsonServiceClient {
  constructor(options = {}) {
    super({
      ...options,
      logLabel: "altered-club-client",
      notConfiguredMessage: "Tracker club base URL is not configured.",
      requestFailedMessage: "Tracker club request failed.",
      pathNormalizer: normalizeVersionedApiPath,
    });
  }

  async getStatus() {
    return this.request("status");
  }

  async ingestSnapshot(snapshot = {}) {
    return this.request("snapshot/ingest", {
      method: "POST",
      body: snapshot,
    });
  }
}

export { TrackerClubClient };
