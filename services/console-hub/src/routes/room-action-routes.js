import { clampInt } from "../../../shared/xjkAuth.js";

export function createRoomActionRoutes({
  config,
  displayNames,
  helpers,
  httpSupport,
  matchEvents,
  repository,
  roomRuntime,
  requireSession,
} = {}) {
  const { authoritativeSessionIdentity } = displayNames;
  const { jsonTryParse } = helpers;
  const { consumeManualCheckSlot, readJsonBody, sendJson } = httpSupport;
  const { buildClaimStatus, publishMatchUpdate } = matchEvents;
  const { getMatchBinding, getMatchStateMirror, getPlayerBinding, matchStateHasBoard, serializeRoomBindingForClient } =
    repository;
  const { ensureClubRoomReady, ensurePlayerConnectionForMatch, selectMapForRoom, verifySelectedMap } = roomRuntime;

  async function handleMatchTeam(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const connection = await ensurePlayerConnectionForMatch(sessionEntry.row, matchUid);
    if (!connection) {
      return sendJson(res, 404, { ok: false, error: "No Bingo bridge connection was found for this match." });
    }
    if (!connection.teamChoiceAllowed || !connection.requiresTeamChoice) {
      return sendJson(res, 409, { ok: false, error: "This match does not require a team choice here." });
    }
    const body = await readJsonBody(req);
    const teamId = clampInt(body.teamId, { min: 0, max: 9999, fallback: -1 });
    if (teamId < 0) return sendJson(res, 400, { ok: false, error: "teamId is required." });
    await connection.joinMatch(matchUid, teamId);
    sendJson(res, 200, connection.snapshot());
  }

  async function handleSelectMap(req, res, matchUid, cellId) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const accountId = authoritativeSessionIdentity(sessionEntry.row).accountId;
    const connection = await ensurePlayerConnectionForMatch(sessionEntry.row, matchUid);
    const binding = await selectMapForRoom({ accountId, matchUid, cellId });
    sendJson(res, 200, {
      ...(connection ? connection.snapshot() : { ok: true, matchUid }),
      roomBinding: serializeRoomBindingForClient(binding),
      claimStatus: buildClaimStatus(binding),
    });
  }

  async function handleImmediateCheck(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const accountId = authoritativeSessionIdentity(sessionEntry.row).accountId;
    const connection = await ensurePlayerConnectionForMatch(sessionEntry.row, matchUid);
    const quota = consumeManualCheckSlot(accountId, matchUid);
    if (!quota.allowed) {
      return sendJson(
        res,
        429,
        {
          ok: false,
          error: "Manual record checks are limited to 10 per minute. Wait a moment and try again.",
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        { "retry-after": String(quota.retryAfterSeconds) }
      );
    }
    const binding = await verifySelectedMap({ accountId, matchUid, immediate: true });
    sendJson(res, 200, {
      ...(connection ? connection.snapshot() : { ok: true, matchUid }),
      roomBinding: serializeRoomBindingForClient(binding),
      claimStatus: buildClaimStatus(binding),
      manualCheck: {
        remaining: quota.remaining,
        limit: config.manualCheckLimit,
        windowMs: config.manualCheckWindowMs,
      },
    });
  }

  async function handleRegenerateRoom(req, res, matchUid) {
    const sessionEntry = requireSession(req, res);
    if (!sessionEntry) return;
    const identity = authoritativeSessionIdentity(sessionEntry.row);
    const accountId = identity.accountId;
    const connection = await ensurePlayerConnectionForMatch(sessionEntry.row, matchUid);
    const playerBinding = getPlayerBinding(accountId, matchUid);
    const matchBinding = getMatchBinding(matchUid);
    const roomSummary = connection?.roomSummary || jsonTryParse(matchBinding?.room_json, null) || null;
    const matchState = connection?.matchState || getMatchStateMirror(matchUid);
    const joinCode = String(
      connection?.joinCode || playerBinding?.join_code || matchBinding?.join_code || roomSummary?.joinCode || ""
    ).trim();

    if (!joinCode) {
      return sendJson(res, 409, {
        ok: false,
        error: "Join the Bingo match before regenerating a console room.",
      });
    }
    if (!matchStateHasBoard(matchState)) {
      return sendJson(res, 409, {
        ok: false,
        error: "The Bingo board is not available yet. Regenerate the console room after the match has started.",
      });
    }

    const binding = await ensureClubRoomReady({
      accountId,
      displayName: connection?.displayName || identity.displayName || identity.username || accountId,
      joinCode,
      matchUid,
      roomSummary,
      matchState,
      forceNewRoom: true,
    });
    const payload = {
      ok: true,
      matchUid,
      roomBinding: serializeRoomBindingForClient(binding),
      claimStatus: buildClaimStatus(binding),
      roomRegenerated: true,
      detailMessage: "Generated a fresh one-player console room for this Bingo match.",
    };
    publishMatchUpdate(accountId, matchUid, payload);
    sendJson(res, 200, payload);
  }

  return { handleImmediateCheck, handleMatchTeam, handleRegenerateRoom, handleSelectMap };
}
