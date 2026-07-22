export function createMatchEventBus({ helpers } = {}) {
  const { jsonTryParse, nowMs } = helpers;

  const sseStreams = new Map();

  function sseKey(accountId, matchUid) {
    return `${accountId}::${matchUid}`;
  }

  function roomEventScope(joinCode) {
    const code = String(joinCode || "").trim();
    return code ? `room:${code}` : "";
  }

  function publishMatchUpdate(accountId, matchUid, payload) {
    const key = sseKey(accountId, matchUid);
    const peers = sseStreams.get(key);
    if (!peers || !peers.size) return;
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of [...peers]) {
      try {
        res.write(message);
      } catch {
        peers.delete(res);
      }
    }
    if (!peers.size) sseStreams.delete(key);
  }

  function publishMapSwitchProgress({ accountId, matchUid, step, state = "running", detail = "" }) {
    if (!accountId || !matchUid || !step) return;
    publishMatchUpdate(accountId, matchUid, {
      mapSwitchProgress: {
        step,
        state,
        detail,
        updatedAt: nowMs(),
      },
    });
  }

  function roomBindingPath(roomBinding) {
    const stored = jsonTryParse(roomBinding?.path_json, []);
    if (Array.isArray(stored) && stored.length) return stored;
    return [];
  }

  function buildClaimStatus(binding) {
    if (!binding) {
      return {
        title: "Waiting for map selection",
        body: "Choose a tile to aim your room and start verified improvement checks.",
      };
    }
    const status = String(binding.status || "idle");
    const mapName = binding.selected_map_name ? ` on ${binding.selected_map_name}` : "";
    if (status === "switching") {
      return {
        title: "Switching your console room",
        body: `The bridge is moving your club room${mapName}. Join it on console once the path updates.`,
      };
    }
    if (status === "verifying") {
      return {
        title: "Verifying your latest record",
        body: `The bridge is checking Nadeo for a confirmed improvement${mapName}.`,
      };
    }
    if (status === "submitted") {
      return {
        title: "Verified claim sent",
        body: binding.last_verified_time
          ? `A verified improvement (${formatTime(binding.last_verified_time)}) was submitted to Bingo${mapName}.`
          : `A verified improvement was submitted to Bingo${mapName}.`,
      };
    }
    if (status === "unchanged") {
      return {
        title: "No new verified improvement yet",
        body: `The bridge did not find a better Nadeo record${mapName} during the last check.`,
      };
    }
    if (status === "failed") {
      return {
        title: "Verification could not be completed",
        body: `The bridge could not verify an improvement${mapName} yet. Use the button again after the record appears.`,
      };
    }
    return {
      title: "Ready to monitor your map",
      body: `Your console room is prepared${mapName}. The bridge will check again automatically in the background.`,
    };
  }

  function formatTime(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value < 0) return "-";
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centis = Math.floor((value % 1000) / 10);
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
  }

  return {
    sseStreams,
    sseKey,
    roomEventScope,
    publishMatchUpdate,
    publishMapSwitchProgress,
    roomBindingPath,
    buildClaimStatus,
    formatTime,
  };
}
