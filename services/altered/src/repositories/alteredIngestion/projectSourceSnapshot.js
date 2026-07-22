import { withSqliteTransaction } from "../../../../shared/sqliteRuntime.js";
import { utcNowIso } from "../alteredRepositorySupport.js";
import { createMapRecordUpserter } from "./mapRecordUpsert.js";
import { ingestCampaigns, selectRawPayload } from "./campaignStages.js";
import { createPositionStore } from "./positionStore.js";
import { createProjectCounters, normalizeProjectSnapshot } from "./snapshotInput.js";

function sourceMetadata(context) {
  return {
    sourceKey: context.sourceKey,
    sourceLabel: context.sourceLabel,
    sourceType: context.sourceType,
    campaignType: context.campaignType,
  };
}

function registerProjectSource(configurationRepository, context) {
  configurationRepository.upsertProjectSource({
    sourceKey: context.sourceKey,
    sourceType: context.sourceType,
    displayName: context.displayName,
    sourceLabel: context.sourceLabel,
    enabled: true,
    lastError: null,
    metadata: {
      campaignType: context.campaignType,
      storageClubId: context.clubId,
    },
  });
}

function persistProjectSnapshot(dependencies, context, counters, touchedMapUids) {
  const upsertMapRecord = createMapRecordUpserter({
    db: dependencies.db,
    counters,
    touchedMapUids,
    trackedDefault: context.trackedDefault,
    mergeExistingPayload: false,
  });
  const metadata = sourceMetadata(context);
  ingestCampaigns({
    campaigns: context.campaigns,
    campaignRepository: dependencies.campaignRepository,
    upsertMapRecord,
    positionStore: createPositionStore(dependencies.db),
    counters,
    context,
    decorateCampaignPayload: (campaign) => ({ ...selectRawPayload(campaign), ...metadata }),
    decorateMapPayload: (map) => ({ ...selectRawPayload(map), ...metadata }),
  });
}

function recordProjectRun(campaignRepository, context, counters, status, note) {
  campaignRepository.recordSyncRun({
    hookKey: `source:${context.sourceKey}`,
    startedAt: context.startedAt,
    finishedAt: utcNowIso(),
    ...counters,
    status,
    note,
  });
}

function ingestProjectSourceSnapshot(dependencies, options = {}) {
  const context = normalizeProjectSnapshot(options);
  if (context.error) return context;
  const counters = createProjectCounters();
  const touchedMapUids = new Set();
  registerProjectSource(dependencies.configurationRepository, context);

  try {
    withSqliteTransaction(
      dependencies.db,
      () => persistProjectSnapshot(dependencies, context, counters, touchedMapUids),
      { mode: "IMMEDIATE" }
    );
  } catch (error) {
    const message = error?.message || "Project source sync failed.";
    recordProjectRun(dependencies.campaignRepository, context, counters, "error", message);
    return { error: message, ...counters };
  }

  recordProjectRun(dependencies.campaignRepository, context, counters, "ok", context.note || context.sourceLabel);
  return {
    source: dependencies.configurationRepository.getProjectSource(context.sourceKey),
    mapsForTracker: dependencies.campaignRepository.getMapsForTracker([...touchedMapUids]),
    ...counters,
  };
}

export { ingestProjectSourceSnapshot };
