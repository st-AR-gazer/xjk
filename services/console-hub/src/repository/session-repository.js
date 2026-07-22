function createSessionRepository({ matchEvents, roomRepository }) {
  const { buildClaimStatus } = matchEvents;

  function buildJoinedMatchPayload({
    accountId,
    matchUid,
    roomSummary = null,
    matchState = null,
    binding = null,
    teamChoiceAllowed = false,
    requiresTeamChoice = false,
    detailMessage = "Your console bridge is connected to the live Bingo match.",
  }) {
    const resolvedBinding = binding || roomRepository.getRoomBinding(accountId, matchUid);
    return {
      ok: true,
      matchUid,
      roomSummary,
      matchState,
      roomBinding: roomRepository.serializeRoomBindingForClient(resolvedBinding),
      claimStatus: buildClaimStatus(resolvedBinding),
      teamChoiceAllowed: Boolean(teamChoiceAllowed),
      requiresTeamChoice: Boolean(requiresTeamChoice),
      detailMessage,
    };
  }

  return { buildJoinedMatchPayload };
}

export { createSessionRepository };
