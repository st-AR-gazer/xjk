import { createClubRoomLifecycle } from "./room-runtime/club-room-lifecycle.js";
import { createMapSwitchingService } from "./room-runtime/map-switching-service.js";
import { createPlayerConnectionState } from "./room-runtime/player-connection-state.js";
import { createRoomBindingState } from "./room-runtime/room-binding-state.js";
import { createRoomVerificationService } from "./room-runtime/room-verification-service.js";

export function createRoomRuntime({
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
} = {}) {
  const clubRoomLifecycle = createClubRoomLifecycle({
    config,
    db,
    helpers,
    nadeo,
    repository,
  });
  const playerConnectionState = createPlayerConnectionState({
    bingo,
    clubRoomLifecycle,
    displayNames,
    gameEvents,
    gameState,
    helpers,
    matchEvents,
    repository,
    roomSummary,
  });
  const roomBindingState = createRoomBindingState({ helpers, matchEvents, repository });
  const mapSwitchingService = createMapSwitchingService({
    clubRoomLifecycle,
    config,
    helpers,
    matchEvents,
    nadeo,
    playerConnectionState,
    repository,
    roomBindingState,
  });
  const roomVerificationService = createRoomVerificationService({
    config,
    db,
    helpers,
    nadeo,
    playerConnectionState,
    repository,
    roomBindingState,
  });

  return {
    ...playerConnectionState,
    ...clubRoomLifecycle,
    ...mapSwitchingService,
    ...roomVerificationService,
  };
}
