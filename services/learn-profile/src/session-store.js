export function createSessionStore({ config, files, identity, logger = console, sharedAuthStore = null } = {}) {
  const oauthStates = new Map();
  const sessions = new Map();
  let persistTimer = null;

  async function readPersistedSessions() {
    await files.ensureDataDir();
    const raw = await files.readText(files.paths.sessionFile);
    if (raw === null) return;
    try {
      const payload = JSON.parse(raw);
      const now = Date.now();
      for (const [token, session] of Object.entries(payload.sessions || {})) {
        if (!token || !session || Number(session.expiresAt || 0) <= now) continue;
        sessions.set(token, session);
      }
    } catch (error) {
      logger.warn(`[learn-profile] failed to load session file: ${error?.message || error}`);
    }
  }

  async function persistSessions() {
    const now = Date.now();
    const activeSessions = {};
    for (const [token, session] of sessions.entries()) {
      if (Number(session.expiresAt || 0) <= now) continue;
      activeSessions[token] = session;
    }
    await files.writeJsonAtomic(files.paths.sessionFile, {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: activeSessions,
    });
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      try {
        await persistSessions();
      } catch (error) {
        logger.warn(`[learn-profile] failed to persist sessions: ${error?.message || error}`);
      }
    }, 50);
  }

  function sharedRowToLearnSession(row = null) {
    if (!row) return null;
    return {
      user: {
        provider: "xjk-auth",
        xjkAccountId: String(row.xjk_account_id || "").trim() || null,
        accountId: String(row.account_id || "").trim() || null,
        subject: String(row.subject || "").trim() || null,
        displayName: String(row.display_name || row.account_display_name || row.account_id || "").trim() || null,
        username:
          String(row.username || row.account_username || row.display_name || row.account_display_name || "").trim() ||
          null,
      },
      oauth: {
        accessToken: String(row.access_token || "").trim(),
        refreshToken: String(row.refresh_token || "").trim(),
        tokenType: String(row.token_type || "Bearer").trim(),
        idToken: String(row.id_token || "").trim(),
        scope: String(row.scope || config.scope).trim(),
        expiresAt: Number(row.oauth_expires_at || 0),
      },
      createdAt: Number(row.session_created_at || 0),
      expiresAt: Number(row.expires_at || row.session_expires_at || 0),
    };
  }

  function getSession(req) {
    if (sharedAuthStore) {
      const entry = sharedAuthStore.resolveSessionFromRequest(req);
      if (!entry?.row) return null;
      return {
        token: entry.token,
        session: sharedRowToLearnSession(entry.row),
        row: entry.row,
      };
    }
    const token = identity.getSessionToken(req);
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (Number(session.expiresAt || 0) <= Date.now()) {
      sessions.delete(token);
      schedulePersist();
      return null;
    }
    return { token, session };
  }

  function sweepExpired() {
    const now = Date.now();
    for (const [key, record] of oauthStates.entries()) {
      if (Number(record.expiresAt || 0) <= now) oauthStates.delete(key);
    }
    for (const [token, session] of sessions.entries()) {
      if (Number(session.expiresAt || 0) <= now) sessions.delete(token);
    }
    schedulePersist();
  }

  async function stop() {
    if (!persistTimer) return;
    clearTimeout(persistTimer);
    persistTimer = null;
    try {
      await persistSessions();
    } catch (error) {
      logger.warn(`[learn-profile] failed to persist sessions: ${error?.message || error}`);
    }
  }

  return {
    oauthStates,
    sessions,
    readPersistedSessions,
    persistSessions,
    schedulePersist,
    sharedRowToLearnSession,
    getSession,
    sweepExpired,
    stop,
  };
}
