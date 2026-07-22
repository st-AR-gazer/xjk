import { TrackmaniaOAuthClient as SharedTrackmaniaOAuthClient } from "../../../shared/trackmaniaOAuthClient.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";

class TrackmaniaOAuthClient extends SharedTrackmaniaOAuthClient {
  constructor(options = {}) {
    super({
      userAgent: "altered.xjk.yt/1.0 (+https://xjk.yt/)",
      ...options,
      throttleLabel: "altered-oauth",
    });
  }
}

export { TrackmaniaOAuthClient, normalizeAccountId };
