export function createDiscoveryRoutes({ directory, gameState, httpSupport, lifecycle, repository, roomSummary } = {}) {
  const { currentPublicRooms, directoryConnection, directoryState, ensureDirectoryConnection } = directory;
  const { hydrateBingoStateDisplayNames } = gameState;
  const { readJsonBody, sendJson } = httpSupport;
  const { privateLookupViaProbe } = lifecycle;
  const { buildReadiness } = repository;
  const { mergeRoomSummaries, roomSummaryNeedsProbe } = roomSummary;

  async function handlePublicRooms(_req, res) {
    await ensureDirectoryConnection();
    let rooms = currentPublicRooms();
    if (directoryState.ready) {
      try {
        rooms = await directoryConnection.refreshRooms();
      } catch (error) {
        directoryState.error = error?.message || String(error);
        directoryState.ready = false;
      }
    }
    sendJson(res, 200, {
      ok: true,
      rooms,
      source: directoryState.ready ? "tcp" : "none",
      readiness: buildReadiness(),
    });
  }

  async function handlePrivateLookup(req, res) {
    const body = await readJsonBody(req);
    const joinCode = String(body.joinCode || "").trim();
    if (!joinCode) return sendJson(res, 400, { ok: false, error: "joinCode is required." });
    const cachedRoom = directoryState.rooms.get(joinCode) || null;
    let room = cachedRoom;
    let source = "cache";
    if (roomSummaryNeedsProbe(room)) {
      room = mergeRoomSummaries(room, await privateLookupViaProbe(joinCode));
      if (room?.joinCode) directoryState.rooms.set(room.joinCode, room);
      source = "probe";
    }
    await hydrateBingoStateDisplayNames({
      roomSummary: room,
      reason: source === "probe" ? "bingo-bridge-private-lookup-probe" : "bingo-bridge-private-lookup-cache",
    }).catch(() => {});
    sendJson(res, 200, { ok: true, room, source });
  }

  return { handlePrivateLookup, handlePublicRooms };
}
