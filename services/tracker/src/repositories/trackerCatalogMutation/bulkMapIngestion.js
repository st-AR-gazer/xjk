import { withSqliteTransaction } from "../../../../shared/sqliteRuntime.js";
import { reconcileCampaignLink } from "./campaignReconciliation.js";
import { persistMap } from "./mapPersistence.js";
import { prepareMapStatements } from "./mapStatements.js";

function emptyResult() {
  return { inserted: 0, updated: 0, campaignLinks: 0, total: 0 };
}

function persistMapBatch(dependencies, inputMaps) {
  const statements = prepareMapStatements(dependencies.db);
  const result = emptyResult();
  for (const item of inputMaps) {
    const persisted = persistMap(statements, item);
    if (!persisted) continue;
    result[persisted.action] += 1;
    if (
      reconcileCampaignLink({ statements, linkMapToCampaign: dependencies.linkMapToCampaign }, item, persisted.mapUid)
    ) {
      result.campaignLinks += 1;
    }
  }
  result.total = result.inserted + result.updated;
  return result;
}

function bulkUpsertMaps(dependencies, { maps = [] } = {}) {
  const inputMaps = Array.isArray(maps) ? maps : [];
  if (!inputMaps.length) return emptyResult();
  return withSqliteTransaction(dependencies.db, () => persistMapBatch(dependencies, inputMaps), { mode: "DEFERRED" });
}

export { bulkUpsertMaps };
