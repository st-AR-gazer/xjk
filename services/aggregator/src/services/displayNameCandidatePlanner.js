import { sanitizeResolvedDisplayName } from "../../../shared/displayNameResolution.js";
import { normalizeAccountId } from "../../../shared/valueUtils.js";

const CANDIDATE_SCORES = Object.freeze({
  missingAccount: 120,
  staleAccount: 10,
  clubMember: 90,
  clubCampaignAuthor: 70,
  clubUploadAuthor: 65,
  projectWrHolder: 50,
  oldMapEventHolder: 45,
  newMapEventHolder: 46,
  mapPopularityDivisor: 200,
  maximumMapPopularityBoost: 25,
});

function parseTimestampMs(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function timestampToIso(timestamp) {
  return Number(timestamp) > 0 ? new Date(Number(timestamp)).toISOString() : null;
}

function rowsFor(evidence, key) {
  return Array.isArray(evidence?.[key]) ? evidence[key] : [];
}

function planDisplayNameCandidates(evidence, { staleAfterSeconds = 86400, nowMs } = {}) {
  const planningTimeMs = Number(nowMs);
  if (!Number.isFinite(planningTimeMs)) {
    throw new TypeError("A finite nowMs value is required to plan display-name candidates.");
  }

  const staleThresholdMs = Math.max(0, Number(staleAfterSeconds) || 0) * 1000;
  const accountMetadata = new Map();
  for (const row of rowsFor(evidence, "accounts")) {
    const accountId = normalizeAccountId(row?.accountId);
    if (!accountId) continue;
    const displayName = sanitizeResolvedDisplayName(row?.displayName, { accountId });
    accountMetadata.set(accountId, {
      observedAtMs: displayName ? parseTimestampMs(row?.observedAt) : 0,
      accountLastSeenMs: parseTimestampMs(row?.accountLastSeenAt),
    });
  }

  const candidates = new Map();
  const addCandidate = (rawAccountId, score, seenAtMs = 0) => {
    const accountId = normalizeAccountId(rawAccountId);
    if (!accountId) return;

    const metadata = accountMetadata.get(accountId) || { observedAtMs: 0, accountLastSeenMs: 0 };
    const missing = metadata.observedAtMs <= 0;
    if (!missing && planningTimeMs - metadata.observedAtMs <= staleThresholdMs) return;

    const candidate = candidates.get(accountId) || {
      score: 0,
      lastSeenMs: 0,
      observedAtMs: metadata.observedAtMs,
    };
    candidate.score += Number(score || 0);
    candidate.lastSeenMs = Math.max(
      candidate.lastSeenMs,
      Number(seenAtMs || 0),
      Number(metadata.accountLastSeenMs || 0)
    );
    candidate.observedAtMs = Math.max(Number(candidate.observedAtMs || 0), Number(metadata.observedAtMs || 0));
    candidates.set(accountId, candidate);
  };

  for (const [accountId, metadata] of accountMetadata.entries()) {
    const missing = metadata.observedAtMs <= 0;
    addCandidate(
      accountId,
      missing ? CANDIDATE_SCORES.missingAccount : CANDIDATE_SCORES.staleAccount,
      metadata.accountLastSeenMs
    );
  }

  const addEvidenceRows = (key, scoreForRow) => {
    for (const row of rowsFor(evidence, key)) {
      addCandidate(row?.accountId, scoreForRow(row), parseTimestampMs(row?.seenAt));
    }
  };
  addEvidenceRows("clubMembers", () => CANDIDATE_SCORES.clubMember);
  addEvidenceRows("clubCampaignAuthors", (row) => {
    const popularityBoost = Math.min(
      CANDIDATE_SCORES.maximumMapPopularityBoost,
      Math.floor(Number(row?.playersTotal || 0) / CANDIDATE_SCORES.mapPopularityDivisor)
    );
    return CANDIDATE_SCORES.clubCampaignAuthor + popularityBoost;
  });
  addEvidenceRows("clubUploadAuthors", (row) => {
    const popularityBoost = Math.min(
      CANDIDATE_SCORES.maximumMapPopularityBoost,
      Math.floor(Number(row?.playersTotal || 0) / CANDIDATE_SCORES.mapPopularityDivisor)
    );
    return CANDIDATE_SCORES.clubUploadAuthor + popularityBoost;
  });
  addEvidenceRows("projectWrHolders", () => CANDIDATE_SCORES.projectWrHolder);
  addEvidenceRows("oldMapEventHolders", () => CANDIDATE_SCORES.oldMapEventHolder);
  addEvidenceRows("newMapEventHolders", () => CANDIDATE_SCORES.newMapEventHolder);

  return [...candidates.entries()]
    .map(([accountId, candidate]) => {
      const observedAtMs = Number(candidate.observedAtMs || 0);
      return {
        accountId,
        score: Number(candidate.score || 0),
        lastSeenAt: timestampToIso(candidate.lastSeenMs),
        observedAt: timestampToIso(observedAtMs),
        ageSeconds: observedAtMs > 0 ? Math.max(0, Math.floor((planningTimeMs - observedAtMs) / 1000)) : null,
        missing: observedAtMs <= 0,
        stale: observedAtMs <= 0 || planningTimeMs - observedAtMs > staleThresholdMs,
      };
    })
    .sort((a, b) => {
      const scoreDifference = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDifference !== 0) return scoreDifference;
      const timeDifference = parseTimestampMs(b.lastSeenAt) - parseTimestampMs(a.lastSeenAt);
      return timeDifference || String(a.accountId || "").localeCompare(String(b.accountId || ""));
    });
}

export { CANDIDATE_SCORES, planDisplayNameCandidates };
