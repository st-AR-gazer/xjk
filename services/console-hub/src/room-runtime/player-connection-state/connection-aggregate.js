class PlayerConnectionAggregate {
  constructor({ sessionToken }) {
    this.accountId = "";
    this.sessionDisplayName = "";
    this.displayName = "";
    this.sessionToken = sessionToken;
    this.client = null;
    this.joinCode = "";
    this.matchUid = "";
    this.teamId = null;
    this.roomSummary = null;
    this.matchState = null;
    this.requiresTeamChoice = false;
    this.teamChoiceAllowed = false;
    this.reconnectTimer = null;
    this.connecting = null;
    this.hydratingNames = null;
  }

  applyIdentity({ accountId, displayName }) {
    this.accountId = accountId || this.accountId;
    this.sessionDisplayName = displayName || this.sessionDisplayName;
    this.displayName = displayName || this.displayName;
  }

  resetRoomState() {
    this.joinCode = "";
    this.matchUid = "";
    this.teamId = null;
    this.roomSummary = null;
    this.matchState = null;
    this.requiresTeamChoice = false;
    this.teamChoiceAllowed = false;
  }

  findSelfPlayer() {
    const teams = Array.isArray(this.matchState?.teams) ? this.matchState.teams : [];
    for (const team of teams) {
      const members = Array.isArray(team?.members) ? team.members : [];
      const found = members.find(
        (member) =>
          Number(member?.profile?.uid ?? member?.uid) > 0 &&
          String(member?.profile?.account_id || member?.account_id || "") === this.accountId
      );
      if (found) return { member: found, team };
    }
    return null;
  }

  buildMatchStateFromStartEvent(event) {
    const maps = Array.isArray(event?.maps) ? event.maps : [];
    return {
      uid: this.matchUid,
      config: this.roomSummary?.matchConfig || {},
      phase: 1,
      teams: Array.isArray(this.roomSummary?.teams) ? this.roomSummary.teams : [],
      cells: maps.map((map, index) => ({
        cell_id: index,
        map,
        claims: [],
        claimant: null,
      })),
      can_reroll: Boolean(event?.can_reroll),
      started: new Date().toISOString(),
    };
  }
}

export { PlayerConnectionAggregate };
