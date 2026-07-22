import { createAuthService } from "./auth.js";
import { createBingoProtocol } from "./bingo-protocol.js";
import { createCoreHelpers } from "./core-helpers.js";
import { createDirectoryService } from "./directory.js";
import { createDisplayNameService } from "./display-names.js";
import { createGameEventTransforms } from "./game-events.js";
import { createGameStateService } from "./game-state.js";
import { createHttpSupport } from "./http-support.js";
import { createLifecycleService } from "./lifecycle.js";
import { createMatchEventBus } from "./match-events.js";
import { createNadeoClient } from "./nadeo-client.js";
import { createConsoleRepository } from "./repository.js";
import { createRoomRuntime } from "./room-runtime.js";
import { createRoomSummaryService } from "./room-summary.js";
import { createRouteHandlers } from "./routes.js";

export function createConsoleHubServices({ config, db, sharedAuthStore = null } = {}) {
  if (!config) throw new Error("Console Hub config is required.");
  if (!db) throw new Error("Console Hub database is required.");

  const helpers = createCoreHelpers({ config, sharedAuthStore });
  const displayNames = createDisplayNameService({ config, db, helpers });
  const httpSupport = createHttpSupport({ config, helpers });
  const auth = createAuthService({ config, db, displayNames, helpers, sharedAuthStore });
  const nadeo = createNadeoClient({ auth, config, helpers });
  const bingo = createBingoProtocol({ config, helpers });
  const roomSummary = createRoomSummaryService();
  const matchEvents = createMatchEventBus({ helpers });
  const directory = createDirectoryService({ auth, bingo, config, helpers, nadeo, roomSummary });
  const gameState = createGameStateService({ displayNames, helpers });
  const gameEvents = createGameEventTransforms({ helpers });
  const repository = createConsoleRepository({
    auth,
    config,
    db,
    directory,
    displayNames,
    helpers,
    matchEvents,
  });
  const roomRuntime = createRoomRuntime({
    bingo,
    config,
    db,
    displayNames,
    gameEvents,
    gameState,
    helpers,
    matchEvents,
    nadeo,
    repository,
    roomSummary,
  });
  const lifecycle = createLifecycleService({
    bingo,
    config,
    db,
    directory,
    helpers,
    matchEvents,
    repository,
    roomRuntime,
    roomSummary,
  });
  const routes = createRouteHandlers({
    auth,
    config,
    directory,
    displayNames,
    gameState,
    helpers,
    httpSupport,
    lifecycle,
    matchEvents,
    repository,
    roomRuntime,
    roomSummary,
    sharedAuthStore,
  });

  return {
    helpers,
    displayNames,
    httpSupport,
    auth,
    nadeo,
    bingo,
    roomSummary,
    matchEvents,
    directory,
    gameState,
    gameEvents,
    repository,
    roomRuntime,
    lifecycle,
    routes,
  };
}
