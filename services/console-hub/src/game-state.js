export function createGameStateService({ displayNames, helpers } = {}) {
  const { displayNameDirectory, observeDisplayNames } = displayNames;
  const { normalizeBridgeAccountId, sanitizeBridgeDisplayName } = helpers;

  function normalizeMatchState(state) {
    return state ? JSON.parse(JSON.stringify(state)) : null;
  }

  function collectBingoParticipantIdentityData({ roomSummary = null, matchState = null } = {}) {
    const accountIds = new Set();
    const observedNamesByAccountId = {};

    const visitIdentity = (accountIdValue, displayNameValue) => {
      const accountId = normalizeBridgeAccountId(accountIdValue);
      if (!accountId) return;
      accountIds.add(accountId);
      const displayName = sanitizeBridgeDisplayName(displayNameValue, { accountId });
      if (displayName) observedNamesByAccountId[accountId] = displayName;
    };

    const visitProfile = (profile) => {
      if (!profile || typeof profile !== "object") return;
      visitIdentity(
        profile.account_id || profile.accountId,
        profile.display_name || profile.displayName || profile.name || profile.login
      );
    };

    const visitMember = (member) => {
      if (!member || typeof member !== "object") return;
      visitIdentity(member.account_id || member.accountId, member.display_name || member.displayName || member.name);
      visitProfile(member.profile);
    };

    const visitClaim = (claim) => {
      if (!claim || typeof claim !== "object") return;
      visitIdentity(claim.account_id || claim.accountId, claim.display_name || claim.displayName || claim.name);
      visitProfile(claim.player?.profile || claim.player || claim.profile);
    };

    const teams = [
      ...(Array.isArray(roomSummary?.teams) ? roomSummary.teams : []),
      ...(Array.isArray(matchState?.teams) ? matchState.teams : []),
    ];
    for (const team of teams) {
      const members = Array.isArray(team?.members) ? team.members : [];
      for (const member of members) visitMember(member);
    }

    const cells = Array.isArray(matchState?.cells) ? matchState.cells : [];
    for (const cell of cells) {
      const claims = Array.isArray(cell?.claims) ? cell.claims : [];
      for (const claim of claims) visitClaim(claim);
    }

    return {
      accountIds: [...accountIds],
      observedNamesByAccountId,
    };
  }

  function applyResolvedDisplayNameToProfile(profile, namesByAccountId = {}) {
    if (!profile || typeof profile !== "object") return;
    const accountId = normalizeBridgeAccountId(profile.account_id || profile.accountId);
    if (!accountId) return;
    const resolved =
      sanitizeBridgeDisplayName(namesByAccountId[accountId], { accountId }) ||
      sanitizeBridgeDisplayName(profile.display_name || profile.displayName || profile.name, {
        accountId,
      });
    if (!resolved) return;
    profile.account_id = profile.account_id || accountId;
    profile.accountId = profile.accountId || accountId;
    profile.display_name = resolved;
    profile.displayName = resolved;
    if (!profile.name || normalizeBridgeAccountId(profile.name)) {
      profile.name = resolved;
    }
  }

  function applyResolvedDisplayNameToMember(member, namesByAccountId = {}) {
    if (!member || typeof member !== "object") return;
    const accountId = normalizeBridgeAccountId(
      member.account_id || member.accountId || member.profile?.account_id || member.profile?.accountId
    );
    if (accountId) {
      const resolved =
        sanitizeBridgeDisplayName(namesByAccountId[accountId], { accountId }) ||
        sanitizeBridgeDisplayName(member.display_name || member.displayName || member.name, { accountId });
      if (resolved) {
        member.account_id = member.account_id || accountId;
        member.accountId = member.accountId || accountId;
        member.display_name = resolved;
        member.displayName = resolved;
        if (!member.name || normalizeBridgeAccountId(member.name)) {
          member.name = resolved;
        }
      }
    }
    applyResolvedDisplayNameToProfile(member.profile, namesByAccountId);
  }

  function applyResolvedDisplayNamesToBingoState({
    roomSummary = null,
    matchState = null,
    namesByAccountId = {},
  } = {}) {
    const roomTeams = Array.isArray(roomSummary?.teams) ? roomSummary.teams : [];
    for (const team of roomTeams) {
      const members = Array.isArray(team?.members) ? team.members : [];
      for (const member of members) applyResolvedDisplayNameToMember(member, namesByAccountId);
    }

    const matchTeams = Array.isArray(matchState?.teams) ? matchState.teams : [];
    for (const team of matchTeams) {
      const members = Array.isArray(team?.members) ? team.members : [];
      for (const member of members) applyResolvedDisplayNameToMember(member, namesByAccountId);
    }

    const cells = Array.isArray(matchState?.cells) ? matchState.cells : [];
    for (const cell of cells) {
      const claims = Array.isArray(cell?.claims) ? cell.claims : [];
      for (const claim of claims) {
        if (!claim || typeof claim !== "object") continue;
        const accountId = normalizeBridgeAccountId(
          claim.account_id ||
            claim.accountId ||
            claim.player?.account_id ||
            claim.player?.accountId ||
            claim.player?.profile?.account_id ||
            claim.player?.profile?.accountId ||
            claim.profile?.account_id ||
            claim.profile?.accountId
        );
        const resolved = sanitizeBridgeDisplayName(namesByAccountId[accountId], { accountId });
        if (resolved) {
          if (accountId) {
            claim.account_id = claim.account_id || accountId;
            claim.accountId = claim.accountId || accountId;
          }
          claim.display_name = resolved;
          claim.displayName = resolved;
        }
        applyResolvedDisplayNameToProfile(claim.player?.profile, namesByAccountId);
        applyResolvedDisplayNameToProfile(claim.player, namesByAccountId);
        applyResolvedDisplayNameToProfile(claim.profile, namesByAccountId);
      }
    }
  }

  async function hydrateBingoStateDisplayNames({
    roomSummary = null,
    matchState = null,
    reason = "bingo-bridge-bingo-state",
  } = {}) {
    const { accountIds, observedNamesByAccountId } = collectBingoParticipantIdentityData({
      roomSummary,
      matchState,
    });
    if (Object.keys(observedNamesByAccountId).length) {
      await observeDisplayNames(observedNamesByAccountId, { source: reason }).catch((error) => {
        console.warn(`[bingo-bridge-displayname] state observe failed: ${error?.message || error}`);
      });
    }
    if (!accountIds.length) return {};
    const resolved = await displayNameDirectory.resolveAccountIds(accountIds, {
      reason,
      front: true,
      external: true,
    });
    const namesByAccountId = {
      ...(resolved?.namesByAccountId || {}),
      ...observedNamesByAccountId,
    };
    applyResolvedDisplayNamesToBingoState({
      roomSummary,
      matchState,
      namesByAccountId,
    });
    return namesByAccountId;
  }

  return {
    normalizeMatchState,
    collectBingoParticipantIdentityData,
    applyResolvedDisplayNameToProfile,
    applyResolvedDisplayNameToMember,
    applyResolvedDisplayNamesToBingoState,
    hydrateBingoStateDisplayNames,
  };
}
