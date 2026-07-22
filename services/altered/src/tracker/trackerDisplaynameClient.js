import { TrackerDisplaynameClient as SharedTrackerDisplaynameClient } from "../../../shared/trackerDisplaynameClient.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";

class TrackerDisplaynameClient extends SharedTrackerDisplaynameClient {
  constructor(options = {}) {
    super({
      ...options,
      accountIdNormalizer: normalizeAccountId,
      logLabel: "altered-displayname-client",
      defaultResolveReason: "altered-priority",
    });
  }
}

export { TrackerDisplaynameClient, normalizeAccountId };
