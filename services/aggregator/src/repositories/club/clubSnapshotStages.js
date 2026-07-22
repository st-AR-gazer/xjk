import { normalizeDisplayNameQuery, sanitizeResolvedDisplayName } from "../../../../shared/displayNameResolution.js";
import { clampInt, normalizeAccountId } from "../../../../shared/valueUtils.js";
import { normalizeArray, normalizeMaybeString } from "../support/repositoryValues.js";

const INTEGER_ID_OPTIONS = { min: 1, max: 2147483647, fallback: 0 };
const OPTIONAL_INTEGER_OPTIONS = { min: 0, max: 2147483647, fallback: 0 };

const COLLECTION_SPECS = {
  campaign: {
    itemsKey: "campaigns",
    seenKey: "campaignsSeen",
    mapsSeenKey: "campaignMapsSeen",
    getId: (item) => clampInt(item?.campaignId ?? item?.campaign_id ?? item?.id, INTEGER_ID_OPTIONS),
    getMaps: (item) => normalizeArray(item?.maps || item?.playlist),
    getName: (item) => normalizeMaybeString(item?.name || item?.campaignName),
  },
  upload: {
    itemsKey: "uploads",
    seenKey: "uploadsSeen",
    mapsSeenKey: "uploadMapsSeen",
    getId: (item) =>
      clampInt(item?.uploadId ?? item?.upload_id ?? item?.bucketId ?? item?.bucket_id ?? item?.id, INTEGER_ID_OPTIONS),
    getMaps: (item) => normalizeArray(item?.maps || item?.mapList),
    getName: (item) => normalizeMaybeString(item?.name || item?.uploadName || item?.bucketName),
  },
};

function optionalInteger(value) {
  return clampInt(value, OPTIONAL_INTEGER_OPTIONS) || null;
}

function persistClub(snapshot, { upsertClub }) {
  upsertClub.run(
    snapshot.clubId,
    snapshot.clubName,
    snapshot.sourceLabel,
    snapshot.observedAt,
    snapshot.observedAt,
    JSON.stringify(snapshot.club || {})
  );
}

function persistCollectionRecord(snapshot, item, id, maps, statements, spec) {
  statements.upsertCollection.run(
    snapshot.clubId,
    id,
    optionalInteger(item?.activityId ?? item?.activity_id),
    spec.getName(item),
    optionalInteger(item?.publicationTimestamp ?? item?.publication_ts),
    optionalInteger(item?.creationTimestamp ?? item?.creation_ts),
    maps.length,
    snapshot.sourceLabel,
    JSON.stringify(item || {}),
    snapshot.observedAt
  );
}

function normalizeMapRecord(map, index) {
  const mapUid = String(map?.uid || map?.mapUid || map?.map_uid || "").trim();
  if (!mapUid) return null;
  return {
    mapUid,
    mapName: normalizeMaybeString(map?.name || map?.mapName),
    authorAccountId: normalizeAccountId(
      map?.authorAccountId || map?.author_account_id || map?.author || map?.submitter
    ),
    position: clampInt(map?.position ?? map?.slot ?? index + 1, {
      min: 0,
      max: 100000,
      fallback: index + 1,
    }),
    playersTotal: optionalInteger(map?.playersTotal ?? map?.playerCount ?? map?.player_count),
  };
}

function persistCollectionMap(snapshot, collectionId, map, index, coreStatements, collectionStatements) {
  const record = normalizeMapRecord(map, index);
  if (!record) return false;
  const { mapUid, mapName, authorAccountId, position, playersTotal } = record;

  if (authorAccountId) {
    coreStatements.upsertAccount.run(authorAccountId, snapshot.observedAt, snapshot.observedAt);
  }
  coreStatements.upsertMapRegistry.run(mapUid, mapName, snapshot.observedAt, snapshot.observedAt);
  collectionStatements.upsertMap.run(
    snapshot.clubId,
    collectionId,
    mapUid,
    mapName,
    position,
    authorAccountId || null,
    playersTotal,
    snapshot.sourceLabel,
    JSON.stringify(map || {}),
    snapshot.observedAt
  );
  return true;
}

function persistCollection(snapshot, counters, statements, spec) {
  for (const item of snapshot[spec.itemsKey]) {
    const id = spec.getId(item);
    if (!id) continue;
    const maps = spec.getMaps(item);
    persistCollectionRecord(snapshot, item, id, maps, statements.collection, spec);
    counters[spec.seenKey] += 1;

    for (let index = 0; index < maps.length; index += 1) {
      if (persistCollectionMap(snapshot, id, maps[index] || {}, index, statements.core, statements.collection)) {
        counters[spec.mapsSeenKey] += 1;
      }
    }
  }
}

function persistClubCollections(snapshot, counters, statements) {
  for (const [kind, spec] of Object.entries(COLLECTION_SPECS)) {
    persistCollection(snapshot, counters, { core: statements.core, collection: statements[kind] }, spec);
  }
}

function persistMemberName(snapshot, accountId, displayName, statements) {
  if (!displayName) return;
  const normalizedName = normalizeDisplayNameQuery(displayName);
  const current = statements.getCurrentName.get(accountId);
  if (!current || String(current.displayName || "") !== displayName) {
    statements.closeHistoryName.run(snapshot.observedAt, accountId);
    statements.upsertHistoryName.run(
      accountId,
      displayName,
      normalizedName,
      snapshot.sourceLabel,
      snapshot.observedAt,
      snapshot.observedAt
    );
  }
  statements.upsertCurrentName.run(
    accountId,
    displayName,
    normalizedName,
    snapshot.sourceLabel,
    snapshot.observedAt,
    snapshot.receivedAt
  );
}

function persistClubMembers(snapshot, counters, coreStatements, memberStatements) {
  for (const member of snapshot.members) {
    const accountId = normalizeAccountId(member?.accountId || member?.account_id || member?.id || member?.playerId);
    if (!accountId) continue;
    const displayName = sanitizeResolvedDisplayName(member?.displayName || member?.display_name || member?.name || "", {
      accountId,
    });
    coreStatements.upsertAccount.run(accountId, snapshot.observedAt, snapshot.observedAt);
    memberStatements.upsertMember.run(
      snapshot.clubId,
      accountId,
      normalizeMaybeString(member?.role || member?.status || member?.memberRole || member?.member_role),
      snapshot.sourceLabel,
      JSON.stringify(member || {}),
      snapshot.observedAt
    );
    counters.membersSeen += 1;
    persistMemberName(snapshot, accountId, displayName, memberStatements);
  }
}

export { persistClub, persistClubCollections, persistClubMembers };
