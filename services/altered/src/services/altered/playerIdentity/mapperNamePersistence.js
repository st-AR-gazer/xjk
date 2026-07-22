import { normalizeAccountId } from "../serviceSupport.js";

async function persistResolvedMapperNames(context, { accountIds, namesByAccountId, source }) {
  const nameUpsert = context.repository.mappers.upsertMapperNames({ accountIds, namesByAccountId, source });
  if (nameUpsert?.error) return { error: nameUpsert.error };

  const mapLinks = context.repository.mappers.updateMapMapperDisplayNames({ namesByAccountId });
  if (mapLinks?.error) {
    context.logger.warn(`[altered-mapper-sync] map mapper-name link update failed: ${mapLinks.error}`);
  }
  const aggregatorIngest = await context.ingestDisplayNamesToAggregator(namesByAccountId, { source });
  return { nameUpsert, mapLinks, aggregatorIngest };
}

async function syncResolvedPlayersToTracker(context, namesByAccountId, source) {
  const observedAt = new Date().toISOString();
  const players = Object.entries(namesByAccountId)
    .map(([accountId, displayName]) => ({
      accountId: normalizeAccountId(accountId),
      displayName: String(displayName || "").trim(),
      observedAt,
    }))
    .filter((entry) => entry.accountId && entry.displayName);

  if (!players.length || !context.trackerClient?.bulkUpsertPlayerNames) {
    return { playersSynced: 0, warning: null };
  }
  const result = await context.trackerClient.bulkUpsertPlayerNames(players, source);
  if (!result?.ok) {
    return { playersSynced: 0, warning: result?.error || "Failed to sync player names to tracker." };
  }
  return {
    playersSynced: Number(result?.data?.playersSeen || result?.data?.synced?.playersSeen || players.length),
    warning: null,
  };
}

export { persistResolvedMapperNames, syncResolvedPlayersToTracker };
