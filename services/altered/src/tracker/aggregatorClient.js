import { AggregatorClient as SharedAggregatorClient } from "../../../shared/aggregatorClient.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";

class AggregatorClient extends SharedAggregatorClient {
  constructor(options = {}) {
    super({
      ...options,
      accountIdNormalizer: normalizeAccountId,
      logLabel: "altered-aggregator-client",
      defaultIngestSource: "altered-mapper-sync",
      defaultProjectKey: "altered-mapper-displayname",
      defaultProjectName: "Altered Mapper Displayname",
    });
  }

  async getDisplayNames(accountIds = []) {
    const normalized = this.normalizeAccountIds(accountIds);
    if (!normalized.length) {
      return { ok: true, data: { names: [], count: 0 } };
    }
    return super.getDisplayNames(normalized);
  }
}

export { AggregatorClient };
