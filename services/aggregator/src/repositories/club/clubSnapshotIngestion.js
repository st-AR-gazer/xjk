import { withSqliteTransaction } from "../../../../shared/sqliteRuntime.js";
import { buildClubSnapshotResult, createClubSnapshotCounters, normalizeClubSnapshot } from "./clubSnapshotInput.js";
import { persistClub, persistClubCollections, persistClubMembers } from "./clubSnapshotStages.js";
import { prepareClubSnapshotStatements } from "./clubSnapshotStatements.js";

function recordClubSnapshotEvent(eventsRepository, snapshot, counters) {
  eventsRepository.appendAggregatorEvent({
    projectKey: snapshot.projectKey,
    projectName: snapshot.projectName,
    sourceLabel: snapshot.sourceLabel,
    occurredAt: snapshot.observedAt,
    eventType: "club.snapshot",
    detail1: `club: ${snapshot.clubName || snapshot.clubId}`,
    detail2: `campaigns: ${counters.campaignsSeen}, uploads: ${counters.uploadsSeen}, members: ${counters.membersSeen}`,
    detail3: `maps: ${counters.campaignMapsSeen + counters.uploadMapsSeen}`,
    payload: {
      clubId: snapshot.clubId,
      clubName: snapshot.clubName,
      ...counters,
    },
  });
}

function persistClubSnapshot({ db, eventsRepository }, snapshot, counters) {
  const statements = prepareClubSnapshotStatements(db);
  if (snapshot.projectKey) {
    eventsRepository.upsertProjectSeen(
      snapshot.projectKey,
      snapshot.projectName,
      snapshot.sourceLabel,
      snapshot.receivedAt
    );
  }
  persistClub(snapshot, statements.core);
  persistClubCollections(snapshot, counters, statements);
  persistClubMembers(snapshot, counters, statements.core, statements.member);
  recordClubSnapshotEvent(eventsRepository, snapshot, counters);
}

function ingestClubSnapshot(dependencies, payload = {}) {
  const snapshot = normalizeClubSnapshot(payload);
  if (snapshot.error) return snapshot;
  const counters = createClubSnapshotCounters();

  withSqliteTransaction(dependencies.db, () => persistClubSnapshot(dependencies, snapshot, counters), {
    mode: "DEFERRED",
  });
  return buildClubSnapshotResult(snapshot, counters);
}

export { ingestClubSnapshot };
