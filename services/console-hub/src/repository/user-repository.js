function createUserRepository() {
  function findAccountTeamIdInTeams(teams, accountId) {
    const targetAccountId = String(accountId || "").trim();
    if (!targetAccountId || !Array.isArray(teams)) return null;
    for (const team of teams) {
      const members = Array.isArray(team?.members) ? team.members : [];
      const found = members.some((member) => {
        const profile = member?.profile || member || {};
        return String(profile.account_id || profile.accountId || "").trim() === targetAccountId;
      });
      if (found) {
        const teamId = Number(team?.base?.id ?? team?.id);
        return Number.isFinite(teamId) ? teamId : null;
      }
    }
    return null;
  }

  return { findAccountTeamIdInTeams };
}

export { createUserRepository };
