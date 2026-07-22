export function createGameEventTransforms({ helpers } = {}) {
  const { nowMs } = helpers;

  function applyRunSubmitted(matchState, event) {
    if (!matchState || !Array.isArray(matchState.cells)) return;
    const targetCell = matchState.cells.find((cell) => Number(cell?.cell_id) === Number(event.cell_id));
    if (!targetCell) return;
    targetCell.claims = Array.isArray(targetCell.claims) ? targetCell.claims : [];
    targetCell.claims = targetCell.claims.filter(
      (claim) => Number(claim?.player?.uid) !== Number(event?.claim?.player?.uid)
    );
    targetCell.claims.push(event.claim);
    targetCell.claims.sort(
      (a, b) => Number(a?.time ?? Number.MAX_SAFE_INTEGER) - Number(b?.time ?? Number.MAX_SAFE_INTEGER)
    );
    if (targetCell.claims.length) {
      targetCell.claimant = targetCell.claims[0]?.team_id ?? targetCell.claimant ?? null;
    }
  }

  function runClaimTeamId(claim) {
    return Number(claim?.team_id ?? claim?.teamId ?? claim?.team?.base?.id ?? claim?.team?.id ?? -1);
  }

  function runClaimTime(claim) {
    return Number(claim?.time ?? claim?.result?.time ?? claim?.verified_time ?? claim?.verifiedTime ?? NaN);
  }

  function runClaimPlayerUid(claim) {
    return Number(claim?.player?.uid ?? claim?.player?.profile?.uid ?? claim?.profile?.uid ?? claim?.uid ?? -1);
  }

  function runClaimPlayerName(claim) {
    const profile = claim?.player?.profile || claim?.player || claim?.profile || claim || {};
    return String(
      profile.display_name ||
        profile.displayName ||
        profile.name ||
        profile.username ||
        claim?.display_name ||
        claim?.displayName ||
        profile.account_id ||
        profile.accountId ||
        "Unknown player"
    ).trim();
  }

  function runCellMapName(cell) {
    const map = cell?.map || {};
    if (String(map.type || "").toUpperCase() === "TMX") {
      return String(map.track_name || map.trackName || "TMX map").trim();
    }
    return `Campaign map #${map.map ?? "?"}`;
  }

  function runCellMapUid(cell) {
    const map = cell?.map || {};
    return String(map.uid || map.map_uid || map.mapUid || "").trim();
  }

  function sortedRunClaims(cell) {
    return (Array.isArray(cell?.claims) ? [...cell.claims] : []).sort((a, b) => {
      const aTime = runClaimTime(a);
      const bTime = runClaimTime(b);
      return (
        (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER)
      );
    });
  }

  function findRunTeam(matchState, teamId) {
    const target = Number(teamId);
    return (Array.isArray(matchState?.teams) ? matchState.teams : []).find(
      (team) => Number(team?.base?.id ?? team?.id) === target
    );
  }

  function runTeamName(team, teamId) {
    return String(
      team?.base?.name ||
        team?.name ||
        (Number.isFinite(Number(teamId)) && Number(teamId) >= 0 ? `Team ${teamId}` : "No team")
    ).trim();
  }

  function runTeamColor(team) {
    const color = team?.base?.color || team?.color;
    return Array.isArray(color) ? color.slice(0, 3).map((entry) => Number(entry)) : null;
  }

  function buildRunSubmittedNotification(matchState, event) {
    if (!matchState || !Array.isArray(matchState.cells)) return null;
    const position = Number(event?.position ?? 1);
    if (position !== 1) return null;

    const targetCell = matchState.cells.find((cell) => Number(cell?.cell_id) === Number(event?.cell_id));
    const claim = event?.claim || null;
    if (!targetCell || !claim) return null;

    const existingLeading = sortedRunClaims(targetCell)[0] || null;
    const teamId = runClaimTeamId(claim);
    const team = findRunTeam(matchState, teamId);
    const previousTeamId = existingLeading ? runClaimTeamId(existingLeading) : -1;
    const variant = existingLeading ? (previousTeamId === teamId ? "improve" : "reclaim") : "claim";
    const time = runClaimTime(claim);
    const previousTime = existingLeading ? runClaimTime(existingLeading) : null;
    const deltaMs =
      Number.isFinite(time) && Number.isFinite(previousTime) ? Math.max(0, Number(previousTime) - Number(time)) : null;
    const cellId = Number(event.cell_id);
    const playerUid = runClaimPlayerUid(claim);

    return {
      id: [
        "run",
        cellId,
        teamId,
        Number.isFinite(playerUid) ? playerUid : "player",
        Number.isFinite(time) ? time : Date.now(),
        variant,
      ].join(":"),
      event: "RunSubmitted",
      variant,
      title: variant === "reclaim" ? "Map Reclaimed" : variant === "improve" ? "Time Improved" : "Map Claimed",
      playerName: runClaimPlayerName(claim),
      teamId,
      teamName: runTeamName(team, teamId),
      teamColor: runTeamColor(team),
      mapName: runCellMapName(targetCell),
      mapUid: runCellMapUid(targetCell),
      cellId,
      time: Number.isFinite(time) ? time : null,
      previousTime: Number.isFinite(previousTime) ? previousTime : null,
      deltaMs: Number.isFinite(deltaMs) ? deltaMs : null,
      showRecordDetails: !Boolean(matchState?.config?.secret),
      createdAt: nowMs(),
    };
  }

  function applyMatchPlayerJoin(matchState, event) {
    if (!matchState || !Array.isArray(matchState.teams)) return;
    const teamId = Number(event?.team ?? event?.team_id ?? -1);
    const team = matchState.teams.find((entry) => Number(entry?.base?.id ?? entry?.id) === teamId);
    if (!team) return;
    team.members = Array.isArray(team.members) ? team.members : [];
    const exists = team.members.some(
      (member) => Number(member?.profile?.uid ?? member?.uid) === Number(event?.profile?.uid)
    );
    if (!exists) team.members.push({ profile: event.profile });
  }

  function applyPlayerDisconnect(matchState, event) {
    if (!matchState || !Array.isArray(matchState.teams)) return;
    for (const team of matchState.teams) {
      team.members = Array.isArray(team.members)
        ? team.members.filter((member) => Number(member?.profile?.uid ?? member?.uid) !== Number(event?.uid))
        : [];
    }
  }

  function applyMapRerolled(matchState, event) {
    if (!matchState || !Array.isArray(matchState.cells)) return;
    const targetCell = matchState.cells.find((cell) => Number(cell?.cell_id) === Number(event.cell_id));
    if (!targetCell) return;
    targetCell.map = event.map || targetCell.map;
    targetCell.claims = [];
    targetCell.claimant = null;
  }

  return {
    applyRunSubmitted,
    runClaimTeamId,
    runClaimTime,
    runClaimPlayerUid,
    runClaimPlayerName,
    runCellMapName,
    runCellMapUid,
    sortedRunClaims,
    findRunTeam,
    runTeamName,
    runTeamColor,
    buildRunSubmittedNotification,
    applyMatchPlayerJoin,
    applyPlayerDisconnect,
    applyMapRerolled,
  };
}
