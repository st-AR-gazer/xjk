import { toIso, utcNowIso } from "../../../../shared/valueUtils.js";
import {
  normalizeArray,
  normalizeClubId,
  normalizeMaybeString,
  normalizeProjectKey,
} from "../support/repositoryValues.js";

function createClubSnapshotCounters() {
  return {
    campaignsSeen: 0,
    campaignMapsSeen: 0,
    uploadsSeen: 0,
    uploadMapsSeen: 0,
    membersSeen: 0,
  };
}

function normalizeClubSnapshot(payload = {}, receivedAt = utcNowIso()) {
  const club = payload.club && typeof payload.club === "object" ? payload.club : payload;
  const clubId = normalizeClubId(club.clubId || club.club_id || club.id || payload.clubId || payload.club_id);
  if (!clubId) return { error: "clubId is required." };

  const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
  return {
    receivedAt,
    projectKey,
    projectName: String(payload.projectName || payload.project?.name || projectKey || "tracker-club").trim(),
    sourceLabel: normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel),
    observedAt: toIso(payload.observedAt || payload.observed_at, receivedAt),
    club,
    clubId,
    clubName: normalizeMaybeString(club.clubName || club.club_name || club.name),
    campaigns: normalizeArray(payload.campaigns || club.campaigns),
    uploads: normalizeArray(payload.uploads || payload.uploadBuckets || club.uploads || club.uploadBuckets),
    members: normalizeArray(payload.members || club.members),
  };
}

function buildClubSnapshotResult(snapshot, counters) {
  return {
    projectKey: snapshot.projectKey || null,
    sourceLabel: snapshot.sourceLabel,
    clubId: snapshot.clubId,
    clubName: snapshot.clubName,
    observedAt: snapshot.observedAt,
    ...counters,
    receivedAt: snapshot.receivedAt,
  };
}

export { buildClubSnapshotResult, createClubSnapshotCounters, normalizeClubSnapshot };
