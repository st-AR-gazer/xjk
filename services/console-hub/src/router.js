import { clampInt } from "../../shared/xjkAuth.js";

export function createConsoleHubRequestHandler({ config, helpers, httpSupport, routes } = {}) {
  const { stripPublicBasePath } = helpers;
  const { sendJson } = httpSupport;
  const {
    handleHealth,
    handleImmediateCheck,
    handleJoinMatch,
    handleLeaveMatch,
    handleLogout,
    handleMatchDetails,
    handleMatchEvents,
    handleMatchTeam,
    handleOauthCallback,
    handleOauthLogin,
    handlePrivateLookup,
    handlePublicRooms,
    handleRegenerateRoom,
    handleSelectMap,
    handleSession,
    notFound,
  } = routes;

  return async function handleConsoleHubRequest(req, res) {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const rawPathname = url.pathname;
      const pathname = stripPublicBasePath(rawPathname);
      const callbackPathname = stripPublicBasePath(config.callbackPath);
      if (req.method === "GET" && pathname === "/auth/ubisoft/login") {
        return await handleOauthLogin(req, res, url);
      }
      if (req.method === "GET" && (rawPathname === config.callbackPath || pathname === callbackPathname)) {
        return await handleOauthCallback(req, res, url);
      }
      if (req.method === "GET" && pathname === "/health") return await handleHealth(req, res);
      if (req.method === "GET" && pathname === "/api/v1/session") return await handleSession(req, res);
      if (req.method === "POST" && pathname === "/api/v1/session/logout") return await handleLogout(req, res);
      if (req.method === "GET" && pathname === "/api/v1/rooms/public") return await handlePublicRooms(req, res);
      if (req.method === "POST" && pathname === "/api/v1/rooms/private/lookup") {
        return await handlePrivateLookup(req, res);
      }
      if (req.method === "POST" && pathname === "/api/v1/matches/join") return await handleJoinMatch(req, res);

      const eventsMatch = pathname.match(/^\/events\/matches\/([^/]+)$/);
      if (req.method === "GET" && eventsMatch) {
        return await handleMatchEvents(req, res, decodeURIComponent(eventsMatch[1]));
      }
      const matchDetails = pathname.match(/^\/api\/v1\/matches\/([^/]+)$/);
      if (req.method === "GET" && matchDetails) {
        return await handleMatchDetails(req, res, decodeURIComponent(matchDetails[1]));
      }
      const matchTeam = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/team$/);
      if (req.method === "POST" && matchTeam) {
        return await handleMatchTeam(req, res, decodeURIComponent(matchTeam[1]));
      }
      const leaveMatch = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/leave$/);
      if (req.method === "POST" && leaveMatch) {
        return await handleLeaveMatch(req, res, decodeURIComponent(leaveMatch[1]));
      }
      const regenerateRoom = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/room\/regenerate$/);
      if (req.method === "POST" && regenerateRoom) {
        return await handleRegenerateRoom(req, res, decodeURIComponent(regenerateRoom[1]));
      }
      const selectMap = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/tiles\/([^/]+)\/select-map$/);
      if (req.method === "POST" && selectMap) {
        return await handleSelectMap(
          req,
          res,
          decodeURIComponent(selectMap[1]),
          clampInt(decodeURIComponent(selectMap[2]), { min: 0, max: 1000, fallback: -1 })
        );
      }
      const currentMapCheck = pathname.match(/^\/api\/v1\/matches\/([^/]+)\/current-map\/check$/);
      if (req.method === "POST" && currentMapCheck) {
        return await handleImmediateCheck(req, res, decodeURIComponent(currentMapCheck[1]));
      }
      return notFound(res);
    } catch (error) {
      return sendJson(res, Number(error?.statusCode || 500), {
        ok: false,
        error: error?.message || "Unexpected bridge error.",
      });
    }
  };
}
