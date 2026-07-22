import { TrackmaniaOAuthClient as SharedTrackmaniaOAuthClient } from "../../../shared/trackmaniaOAuthClient.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";

class TrackmaniaOAuthClient extends SharedTrackmaniaOAuthClient {
  constructor(options = {}) {
    super({
      userAgent: "trackers.xjk.yt-displayname/1.0 (+https://xjk.yt/)",
      ...options,
      throttleLabel: "tracker-displayname-oauth",
      telemetryService: "tracker-displayname",
    });
  }
}

export { TrackmaniaOAuthClient, normalizeAccountId };
