import { emptyLearnData, sanitizeLearnData } from "./learn-data.js";

export function createLearnDataStore({ files } = {}) {
  const userData = new Map();

  function publicLearnData(accountId = "") {
    return sanitizeLearnData(userData.get(accountId) || emptyLearnData());
  }

  function learnUserDataKey(account = null) {
    return String(account?.xjkAccountId || account?.id || "").trim();
  }

  function migrateLearnUserDataKey(account = null) {
    if (!account) return;
    const preferredKey = learnUserDataKey(account);
    const legacyKey = String(account.id || "").trim();
    if (!preferredKey || !legacyKey || preferredKey === legacyKey) return;
    if (!userData.has(preferredKey) && userData.has(legacyKey)) {
      userData.set(preferredKey, userData.get(legacyKey));
    }
  }

  async function persistUserData() {
    const accountsPayload = {};
    for (const [accountId, data] of userData.entries()) {
      accountsPayload[accountId] = sanitizeLearnData(data);
    }
    await files.writeJsonAtomic(files.paths.userDataFile, {
      version: 1,
      updatedAt: new Date().toISOString(),
      accounts: accountsPayload,
    });
  }

  async function readPersistedUserData() {
    await files.ensureDataDir();
    const payload = await files.readJson(files.paths.userDataFile);
    if (!payload) return;
    userData.clear();
    for (const [accountId, data] of Object.entries(payload.accounts || {})) {
      const safeId = String(accountId || "").trim();
      if (!safeId) continue;
      userData.set(safeId, sanitizeLearnData(data));
    }
  }

  return {
    userData,
    publicLearnData,
    learnUserDataKey,
    migrateLearnUserDataKey,
    persistUserData,
    readPersistedUserData,
  };
}
