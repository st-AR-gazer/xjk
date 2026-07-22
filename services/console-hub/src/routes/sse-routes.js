export function createSseRoutes({ displayNames, matchEvents, requireSession } = {}) {
  const { authoritativeSessionIdentity } = displayNames;
  const { sseKey, sseStreams } = matchEvents;

  async function handleMatchEvents(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const accountId = authoritativeSessionIdentity(sessionEntry.row).accountId;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const key = sseKey(accountId, matchUid);
    const peers = sseStreams.get(key) || new Set();
    peers.add(res);
    sseStreams.set(key, peers);
    const initialPayload = String(matchUid || "").startsWith("room:")
      ? { ok: true, eventScope: matchUid }
      : { ok: true, matchUid };
    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
    req.on("close", () => {
      const current = sseStreams.get(key);
      if (!current) return;
      current.delete(res);
      if (!current.size) sseStreams.delete(key);
    });
  }

  return { handleMatchEvents };
}
