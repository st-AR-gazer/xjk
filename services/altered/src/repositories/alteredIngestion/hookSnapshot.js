import { withSqliteTransaction } from "../../../../shared/sqliteRuntime.js";
import { utcNowIso } from "../alteredRepositorySupport.js";
import { createMapRecordUpserter } from "./mapRecordUpsert.js";
import { ingestCampaigns } from "./campaignStages.js";
import { createPositionStore } from "./positionStore.js";
import { createHookCounters, normalizeHookSnapshot } from "./snapshotInput.js";
import { ingestUploadBuckets } from "./uploadBucketStages.js";

function resolveHookContext(configurationRepository, options) {
  const requestedKey = String(options.hookKey || "").trim() || undefined;
  const existingHook =
    configurationRepository.getHookConfig(requestedKey) ||
    configurationRepository.ensureDefaultHookConfig(requestedKey ? { hookKey: requestedKey } : undefined);
  const context = normalizeHookSnapshot(options, existingHook);
  if (context.error) return context;
  const hook = configurationRepository.updateHookConfig({
    hookKey: context.hookKey,
    clubId: context.clubId,
    clubName: context.clubName,
    sourceLabel: context.sourceLabel,
  });
  return hook ? { ...context, hook } : { error: "Unable to initialize altered hook config." };
}

function persistHookSnapshot(dependencies, context, counters, touchedMapUids) {
  const upsertMapRecord = createMapRecordUpserter({
    db: dependencies.db,
    counters,
    touchedMapUids,
    trackedDefault: Boolean(context.hook.autoTrackNewMaps),
    mergeExistingPayload: true,
  });
  const positionStore = createPositionStore(dependencies.db);
  ingestCampaigns({
    campaigns: context.campaigns,
    campaignRepository: dependencies.campaignRepository,
    upsertMapRecord,
    positionStore,
    counters,
    context,
  });
  ingestUploadBuckets({
    buckets: context.uploadBuckets,
    campaignRepository: dependencies.campaignRepository,
    upsertMapRecord,
    positionStore,
    counters,
    context,
  });
}

function recordHookRun(campaignRepository, context, counters, status, note, finishedAt = utcNowIso()) {
  return campaignRepository.recordSyncRun({
    hookKey: context.hookKey,
    startedAt: context.startedAt,
    finishedAt,
    ...counters,
    status,
    note,
  });
}

function hookConfigUpdate(context, extra = {}) {
  return {
    hookKey: context.hookKey,
    clubId: context.clubId,
    clubName: context.clubName,
    sourceLabel: context.sourceLabel,
    ...extra,
  };
}

function handleHookFailure(dependencies, context, counters, error) {
  const message = error?.message || "Hook sync failed.";
  recordHookRun(dependencies.campaignRepository, context, counters, "error", message);
  const hook = dependencies.configurationRepository.updateHookConfig(hookConfigUpdate(context, { lastError: message }));
  return { error: message, hook, ...counters };
}

function buildHookSuccess(dependencies, context, counters, touchedMapUids) {
  const finishedAt = utcNowIso();
  const runId = recordHookRun(
    dependencies.campaignRepository,
    context,
    counters,
    "ok",
    String(context.note || context.sourceLabel || "manual-sync"),
    finishedAt
  );
  const hook = dependencies.configurationRepository.updateHookConfig(
    hookConfigUpdate(context, { lastSyncedAt: finishedAt, lastError: null })
  );
  return {
    hook,
    run: dependencies.monitoringRepository.listHookRuns(1, context.hookKey)[0] || { runId },
    mapsForTracker: dependencies.campaignRepository.getMapsForTracker([...touchedMapUids]),
    ...counters,
  };
}

function ingestHookSnapshot(dependencies, options = {}) {
  const context = resolveHookContext(dependencies.configurationRepository, options);
  if (context.error) return context;
  const counters = createHookCounters();
  const touchedMapUids = new Set();

  try {
    withSqliteTransaction(dependencies.db, () => persistHookSnapshot(dependencies, context, counters, touchedMapUids), {
      mode: "DEFERRED",
    });
  } catch (error) {
    return handleHookFailure(dependencies, context, counters, error);
  }
  return buildHookSuccess(dependencies, context, counters, touchedMapUids);
}

export { ingestHookSnapshot };
