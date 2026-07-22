export function createLifecycleService({
  bingo,
  config,
  db,
  directory,
  helpers,
  matchEvents,
  repository,
  roomRuntime,
  roomSummary,
} = {}) {
  const { BINGO_CLIENT_KIND_DIRECTORY, BINGO_PURPOSE_DIRECTORY, BingoClient } = bingo;
  const { getDirectoryIdentity } = directory;
  const { nowMs } = helpers;
  const { publishMatchUpdate, roomEventScope } = matchEvents;
  const { deletePlayerBinding, deletePlayerBindingById } = repository;
  const {
    cleanupConsoleResourcesForMatch,
    cleanupConsoleResourcesForPlayer,
    cleanupConsoleRoomBinding,
    playerConnections,
  } = roomRuntime;
  const { normalizeRoomSummary } = roomSummary;

  function closeMatchingPlayerConnections({ accountId = "", matchUid = "", joinCode = "", message = "" } = {}) {
    const account = String(accountId || "").trim();
    const match = String(matchUid || "").trim();
    const code = String(joinCode || "").trim();
    for (const [sessionToken, connection] of playerConnections.entries()) {
      if (account && connection.accountId !== account) continue;
      const connectionMatchUid = String(connection.matchUid || "").trim();
      const connectionJoinCode = String(connection.joinCode || "").trim();
      if (match && connectionMatchUid !== match) continue;
      if (!match && code && connectionJoinCode !== code) continue;
      if (connectionMatchUid) {
        publishMatchUpdate(connection.accountId, connectionMatchUid, {
          ok: true,
          left: true,
          expired: true,
          matchUid: connectionMatchUid,
          message,
        });
      }
      const roomScope = roomEventScope(connectionJoinCode);
      if (roomScope) {
        publishMatchUpdate(connection.accountId, roomScope, {
          ok: true,
          left: true,
          expired: true,
          joinCode: connectionJoinCode,
          matchUid: connectionMatchUid,
          message,
        });
      }
      connection.leaveCurrentRoom();
      playerConnections.delete(sessionToken);
    }
  }

  async function runConsoleLifecycleSweep() {
    const now = nowMs();
    const stalePlayers = db
      .prepare(
        `SELECT * FROM bingo_player_bindings
         WHERE created_at <= ?
         ORDER BY created_at ASC
         LIMIT 100`
      )
      .all(now - config.webPlayerTtlMs);
    for (const binding of stalePlayers) {
      const accountId = String(binding.account_id || "").trim();
      const matchUid = String(binding.match_uid || "").trim();
      const joinCode = String(binding.join_code || "").trim();
      closeMatchingPlayerConnections({
        accountId,
        matchUid,
        joinCode,
        message: "Your console web session expired after 12 hours.",
      });
      if (matchUid) {
        await cleanupConsoleResourcesForPlayer({
          accountId,
          matchUid,
          reason: "12 hour web player expiry",
        });
      }
      deletePlayerBindingById(binding.binding_id);
    }

    const orphanRooms = db
      .prepare(
        `SELECT rb.*
         FROM bingo_room_bindings rb
         WHERE NOT EXISTS (
           SELECT 1
           FROM bingo_player_bindings pb
           WHERE pb.account_id = rb.account_id
             AND pb.match_uid = rb.match_uid
         )
           AND (COALESCE(rb.status, '') != 'cleanup_pending' OR rb.updated_at <= ?)
         ORDER BY rb.created_at ASC
         LIMIT 100`
      )
      .all(now - 10 * 60 * 1000);
    for (const binding of orphanRooms) {
      closeMatchingPlayerConnections({
        accountId: binding.account_id,
        matchUid: binding.match_uid,
        joinCode: binding.join_code,
        message: "Your generated console room was removed because the website player left.",
      });
      await cleanupConsoleRoomBinding(binding, {
        cleanupMatchFolder: true,
        reason: "orphan generated room cleanup",
      });
    }

    const staleRooms = db
      .prepare(
        `SELECT * FROM bingo_room_bindings
         WHERE created_at <= ?
           AND (COALESCE(status, '') != 'cleanup_pending' OR updated_at <= ?)
         ORDER BY created_at ASC
         LIMIT 100`
      )
      .all(now - config.consoleRoomTtlMs, now - 10 * 60 * 1000);
    for (const binding of staleRooms) {
      closeMatchingPlayerConnections({
        accountId: binding.account_id,
        matchUid: binding.match_uid,
        joinCode: binding.join_code,
        message: "Your generated console room expired after 24 hours.",
      });
      deletePlayerBinding(binding.account_id, binding.match_uid);
      await cleanupConsoleRoomBinding(binding, {
        cleanupMatchFolder: true,
        reason: "24 hour generated room expiry",
      });
    }

    const staleMatches = db
      .prepare(
        `SELECT * FROM bingo_match_bindings
         WHERE active = 1
           AND COALESCE(created_at, updated_at) <= ?
         ORDER BY COALESCE(created_at, updated_at) ASC
         LIMIT 100`
      )
      .all(now - config.consoleMatchTtlMs);
    for (const match of staleMatches) {
      const matchUid = String(match.match_uid || "").trim();
      if (!matchUid) continue;
      closeMatchingPlayerConnections({
        matchUid,
        joinCode: match.join_code,
        message: "This Bingo console mirror expired after 24 hours.",
      });
      await cleanupConsoleResourcesForMatch(matchUid, { reason: "24 hour console match expiry" });
    }
  }

  async function privateLookupViaProbe(joinCode) {
    const identity = getDirectoryIdentity();
    if (!identity) {
      throw new Error("No directory identity is configured for private room lookups.");
    }
    const client = new BingoClient({ label: "probe" });
    try {
      await client.connect({
        accountId: identity.accountId,
        displayName: identity.displayName,
        purpose: BINGO_PURPOSE_DIRECTORY,
        clientKind: BINGO_CLIENT_KIND_DIRECTORY,
      });
      const response = await client.request("JoinRoom", { join_code: joinCode });
      const summary = normalizeRoomSummary({
        join_code: joinCode,
        config: response?.config || {},
        match_config: response?.match_config || {},
        teams: response?.teams || [],
        match_uid: response?.match_uid || "",
        name: response?.config?.name || "",
        started: response?.match_uid ? nowMs() : 0,
      });
      summary.matchUid = String(response?.match_uid || "").trim();
      return summary;
    } finally {
      client.close();
    }
  }

  return { closeMatchingPlayerConnections, runConsoleLifecycleSweep, privateLookupViaProbe };
}
