import { createAuthSessionRoutes } from "./routes/auth-session-routes.js";
import { createDiscoveryRoutes } from "./routes/discovery-routes.js";
import { createMembershipRoutes } from "./routes/membership-routes.js";
import { createRoomActionRoutes } from "./routes/room-action-routes.js";
import { createSseRoutes } from "./routes/sse-routes.js";

export function createRouteHandlers(dependencies = {}) {
  const authSession = createAuthSessionRoutes(dependencies);
  const shared = { ...dependencies, requireSession: authSession.requireSession };
  const discovery = createDiscoveryRoutes(shared);
  const membership = createMembershipRoutes(shared);
  const roomActions = createRoomActionRoutes(shared);
  const sse = createSseRoutes(shared);

  function notFound(res) {
    dependencies.httpSupport.sendJson(res, 404, { ok: false, error: "Not found." });
  }

  return {
    ...authSession,
    ...discovery,
    ...membership,
    ...roomActions,
    ...sse,
    notFound,
  };
}
