import { createClaimRepository } from "./repository/claim-repository.js";
import { createMatchRepository } from "./repository/match-repository.js";
import { createPlayerRepository } from "./repository/player-repository.js";
import { createRoomRepository } from "./repository/room-repository.js";
import { createSessionRepository } from "./repository/session-repository.js";
import { createSettingsRepository } from "./repository/settings-repository.js";
import { createUserRepository } from "./repository/user-repository.js";

export function createConsoleRepository({ auth, config, db, directory, displayNames, helpers, matchEvents } = {}) {
  const room = createRoomRepository({ config, db, helpers, matchEvents });
  const player = createPlayerRepository({ db, helpers });
  const match = createMatchRepository({ db, helpers });
  const claim = createClaimRepository({ db, helpers });
  const user = createUserRepository();
  const session = createSessionRepository({ matchEvents, roomRepository: room });
  const settings = createSettingsRepository({ auth, config, directory, displayNames });

  return {
    serializeRoomBindingForClient: room.serializeRoomBindingForClient,
    getRoomBinding: room.getRoomBinding,
    getRoomBindingsForMatch: room.getRoomBindingsForMatch,
    deleteRoomBinding: room.deleteRoomBinding,
    markRoomBindingStatus: room.markRoomBindingStatus,
    activeRoomBindingCountForMatch: room.activeRoomBindingCountForMatch,
    getPlayerBinding: player.getPlayerBinding,
    getPlayerBindingByJoinCode: player.getPlayerBindingByJoinCode,
    getPlayerBindingsForAccount: player.getPlayerBindingsForAccount,
    deletePlayerBinding: player.deletePlayerBinding,
    deletePlayerBindingByJoinCode: player.deletePlayerBindingByJoinCode,
    deletePlayerBindingById: player.deletePlayerBindingById,
    getMatchBinding: match.getMatchBinding,
    deleteMatchMirror: match.deleteMatchMirror,
    getLatestMatchBindingByJoinCode: match.getLatestMatchBindingByJoinCode,
    getMatchStateMirror: match.getMatchStateMirror,
    buildJoinedMatchPayload: session.buildJoinedMatchPayload,
    matchStateHasBoard: match.matchStateHasBoard,
    findAccountTeamIdInTeams: user.findAccountTeamIdInTeams,
    playerBindingRequiresTeamChoice: player.playerBindingRequiresTeamChoice,
    upsertPlayerBinding: player.upsertPlayerBinding,
    upsertMatchBinding: match.upsertMatchBinding,
    upsertRoomBinding: room.upsertRoomBinding,
    insertClaimCheck: claim.insertClaimCheck,
    buildReadiness: settings.buildReadiness,
  };
}
