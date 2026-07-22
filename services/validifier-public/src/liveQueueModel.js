import { PUBLIC_TRACKS } from "./verificationModel.js";

function verificationByTrack(bundle) {
  const byTrack = new Map();
  for (const item of Array.isArray(bundle?.verifications) ? bundle.verifications : []) {
    const track = String(item?.track || "").trim();
    if (track) {
      byTrack.set(track, item);
    }
  }
  return byTrack;
}

function statusForTrack(bundle, track) {
  return verificationByTrack(bundle).get(track)?.status || "not_run";
}

function verificationForTrack(bundle, track) {
  return verificationByTrack(bundle).get(track) || null;
}

function isRemainingStatus(status) {
  return status === "pending" || status === "not_run";
}

function isBlockedStatus(status) {
  return status === "unavailable";
}

function isFinishedStatus(status) {
  return status === "pass" || status === "fail";
}

function liveActivityTime(verification) {
  const updatedAt = verification?.updated_at ? Date.parse(verification.updated_at) : 0;
  const checkedAt = verification?.checked_at ? Date.parse(verification.checked_at) : 0;
  return Math.max(updatedAt || 0, checkedAt || 0);
}

function latestActivityForBundle(bundle) {
  const activities = [];
  for (const track of PUBLIC_TRACKS) {
    const verification = verificationForTrack(bundle, track);
    if (!verification || verification.status === "not_run") {
      continue;
    }

    activities.push({
      record_id: bundle.record_id,
      map_uid: bundle.map_uid,
      rank: bundle.rank ?? null,
      track,
      status: verification.status,
      reason_code: verification.reason_code || null,
      checked_at: verification.checked_at || null,
      updated_at: verification.updated_at || verification.checked_at || bundle.updated_at || null,
      policy_version: verification.policy_version || null,
      confidence: verification.confidence || null,
      time_ms: liveActivityTime(verification),
    });
  }

  if (!activities.length) {
    const bundleTime = bundle?.updated_at ? Date.parse(bundle.updated_at) : 0;
    return {
      record_id: bundle.record_id,
      map_uid: bundle.map_uid,
      rank: bundle.rank ?? null,
      track: "replay",
      status: "not_run",
      reason_code: "not_run",
      checked_at: null,
      updated_at: bundle.updated_at || null,
      policy_version: null,
      confidence: null,
      time_ms: bundleTime || 0,
    };
  }

  activities.sort((left, right) => {
    if (right.time_ms !== left.time_ms) {
      return right.time_ms - left.time_ms;
    }
    return String(left.track || "").localeCompare(String(right.track || ""));
  });
  return activities[0];
}

function liveStatusPriority(status) {
  if (status === "pending") return 0;
  if (status === "not_run") return 1;
  if (status === "unavailable") return 2;
  if (status === "fail") return 3;
  if (status === "pass") return 4;
  return 5;
}

function compareLiveBundles(left, right) {
  const leftReplay = statusForTrack(left, "replay");
  const rightReplay = statusForTrack(right, "replay");
  const leftDeep = statusForTrack(left, "deep");
  const rightDeep = statusForTrack(right, "deep");

  const replayCompare = liveStatusPriority(leftReplay) - liveStatusPriority(rightReplay);
  if (replayCompare !== 0) return replayCompare;

  const deepCompare = liveStatusPriority(leftDeep) - liveStatusPriority(rightDeep);
  if (deepCompare !== 0) return deepCompare;

  const leftActivity = latestActivityForBundle(left);
  const rightActivity = latestActivityForBundle(right);
  if (rightActivity.time_ms !== leftActivity.time_ms) {
    return rightActivity.time_ms - leftActivity.time_ms;
  }

  const leftRank = Number.isInteger(left?.rank) ? left.rank : Number.MAX_SAFE_INTEGER;
  const rightRank = Number.isInteger(right?.rank) ? right.rank : Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;

  return String(left?.record_id || "").localeCompare(String(right?.record_id || ""));
}

function summarizeTrackCounts(bundles, track) {
  const summary = {
    remaining: 0,
    pending: 0,
    unavailable: 0,
    complete: 0,
  };

  for (const bundle of bundles || []) {
    const status = statusForTrack(bundle, track);
    if (isRemainingStatus(status)) {
      summary.remaining += 1;
    }
    if (status === "pending") {
      summary.pending += 1;
    }
    if (isBlockedStatus(status)) {
      summary.unavailable += 1;
    }
    if (isFinishedStatus(status)) {
      summary.complete += 1;
    }
  }

  return summary;
}

export function buildLivePayload(bundles, { limit, mapLimit }) {
  const sortedBundles = [...bundles].sort(compareLiveBundles);
  const recentActivity = sortedBundles
    .map((bundle) => latestActivityForBundle(bundle))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.time_ms !== left.time_ms) {
        return right.time_ms - left.time_ms;
      }
      return String(left.record_id || "").localeCompare(String(right.record_id || ""));
    })
    .slice(0, 12)
    .map(({ time_ms: _timeMs, ...activity }) => activity);

  const mapsByUid = new Map();
  for (const bundle of sortedBundles) {
    const mapUid = String(bundle?.map_uid || "").trim() || "(unknown map)";
    const existing = mapsByUid.get(mapUid) || [];
    existing.push(bundle);
    mapsByUid.set(mapUid, existing);
  }

  const mapsRemaining = [...mapsByUid.entries()]
    .map(([mapUid, mapBundles]) => {
      const unresolvedRecords = mapBundles.filter((bundle) => {
        const replayStatus = statusForTrack(bundle, "replay");
        const deepStatus = statusForTrack(bundle, "deep");
        return (
          isRemainingStatus(replayStatus) ||
          isRemainingStatus(deepStatus) ||
          isBlockedStatus(replayStatus) ||
          isBlockedStatus(deepStatus)
        );
      });

      const replay = summarizeTrackCounts(mapBundles, "replay");
      const deep = summarizeTrackCounts(mapBundles, "deep");
      const latestUpdate = unresolvedRecords.length
        ? unresolvedRecords
            .map((bundle) => latestActivityForBundle(bundle))
            .sort((left, right) => right.time_ms - left.time_ms)[0]?.updated_at || null
        : mapBundles
            .map((bundle) => latestActivityForBundle(bundle))
            .sort((left, right) => right.time_ms - left.time_ms)[0]?.updated_at || null;

      return {
        map_uid: mapUid,
        total_records: mapBundles.length,
        unresolved_records: unresolvedRecords.length,
        updated_at: latestUpdate,
        replay_remaining: replay.remaining,
        replay_pending: replay.pending,
        replay_unavailable: replay.unavailable,
        deep_remaining: deep.remaining,
        deep_pending: deep.pending,
        deep_unavailable: deep.unavailable,
        records: [...unresolvedRecords].sort(compareLiveBundles),
      };
    })
    .filter((item) => item.unresolved_records > 0)
    .sort((left, right) => {
      const leftRemaining =
        left.replay_remaining + left.deep_remaining + left.replay_unavailable + left.deep_unavailable;
      const rightRemaining =
        right.replay_remaining + right.deep_remaining + right.replay_unavailable + right.deep_unavailable;
      if (rightRemaining !== leftRemaining) {
        return rightRemaining - leftRemaining;
      }
      const leftTime = left.updated_at ? Date.parse(left.updated_at) : 0;
      const rightTime = right.updated_at ? Date.parse(right.updated_at) : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return String(left.map_uid || "").localeCompare(String(right.map_uid || ""));
    })
    .slice(0, mapLimit);

  const replayTotals = summarizeTrackCounts(sortedBundles, "replay");
  const deepTotals = summarizeTrackCounts(sortedBundles, "deep");
  const latestActivity = recentActivity[0] || null;

  return {
    live_at: new Date().toISOString(),
    latest_activity: latestActivity,
    recent_activity: recentActivity,
    totals: {
      known_records: sortedBundles.length,
      known_maps: mapsByUid.size,
      replay_remaining: replayTotals.remaining,
      replay_pending: replayTotals.pending,
      replay_unavailable: replayTotals.unavailable,
      deep_remaining: deepTotals.remaining,
      deep_pending: deepTotals.pending,
      deep_unavailable: deepTotals.unavailable,
    },
    records: sortedBundles.slice(0, limit),
    maps_remaining: mapsRemaining,
  };
}
