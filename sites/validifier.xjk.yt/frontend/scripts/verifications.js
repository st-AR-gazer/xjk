import { TRACKS } from "./constants.js";

export function createDefaultVerification(track) {
  return {
    track,
    status: "not_run",
    checked_at: null,
    confidence: null,
    reason_code: "not_run",
    policy_version: null,
    updated_at: null,
  };
}

export function verificationMap(verifications) {
  const map = {
    replay: createDefaultVerification("replay"),
    deep: createDefaultVerification("deep"),
  };

  if (!Array.isArray(verifications)) {
    return map;
  }

  for (const item of verifications) {
    const track = String(item?.track || "").trim();
    if (!TRACKS.includes(track)) {
      continue;
    }

    map[track] = {
      ...createDefaultVerification(track),
      ...item,
    };
  }

  return map;
}

export function headlineFor(track, verification) {
  if (track === "replay") {
    if (verification.status === "pass") return "Replay verified";
    if (verification.status === "fail") return "Replay failed verification";
    if (verification.status === "pending" && verification.reason_code === "manual_review") {
      return "Replay verification pending review";
    }
    if (verification.status === "pending") return "Replay verification pending";
    if (verification.status === "unavailable") return "Replay verification unavailable";
    return "Replay verification not run yet";
  }

  if (verification.status === "pass") return "Deep verification passed";
  if (verification.status === "fail") return "Deep verification failed";
  if (verification.status === "pending" && verification.reason_code === "manual_review") {
    return "Deep verification pending review";
  }
  if (verification.status === "pending") return "Deep verification pending";
  if (verification.status === "unavailable") return "Deep verification unavailable";
  return "Deep verification not run yet";
}

export function detailFor(track, verification) {
  if (verification.reason_code === "verified") {
    return track === "replay"
      ? "This run passed the current replay verification checks."
      : "This run passed the current deep verification checks.";
  }

  if (verification.reason_code === "failed_verification") {
    return track === "replay"
      ? "This run did not pass the current replay verification checks."
      : "This run did not pass the current deep verification checks.";
  }

  if (verification.reason_code === "awaiting_processing") {
    return track === "replay"
      ? "Replay verification is still being processed."
      : "Deep verification is still being processed.";
  }

  if (verification.reason_code === "manual_review") {
    return track === "replay"
      ? "Replay verification is pending because the public service does not have a final automated result yet."
      : "Deep verification is pending because the public service does not have a final automated result yet.";
  }

  if (verification.reason_code === "artifacts_missing") {
    return "The data needed to complete this verification is not available yet.";
  }

  if (verification.reason_code === "unsupported") {
    return "This run comes from a version that is not supported by public verification yet.";
  }

  if (verification.reason_code === "service_error") {
    return "The verification service could not complete this check right now.";
  }

  if (verification.reason_code === "not_run") {
    return track === "replay"
      ? "Replay verification has not been run for this record yet."
      : "Deep verification has not been run for this record yet.";
  }

  return track === "replay"
    ? "Replay verification is not available for this record right now."
    : "Deep verification is not available for this record right now.";
}

export function shortLineFor(track, verification) {
  if (track === "replay") {
    if (verification.status === "pass") return "Replay verified";
    if (verification.status === "fail") return "Replay failed";
    if (verification.status === "pending") return "Replay pending";
    if (verification.status === "unavailable") return "Replay unavailable";
    return "Replay not run";
  }

  if (verification.status === "pass") return "Deep passed";
  if (verification.status === "fail") return "Deep failed";
  if (verification.status === "pending") return "Deep pending";
  if (verification.status === "unavailable") return "Deep unavailable";
  return "Deep not run";
}
