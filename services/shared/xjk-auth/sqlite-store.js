import crypto from "node:crypto";
import { parseRequestCookies } from "../httpAuth.js";
import { openSqliteDatabase } from "../sqliteRuntime.js";
import { oauthTokenExpiryMs as tokenExpiryMs } from "../tokenUtils.js";
import { accountNowFields, isoOrNull } from "./role-row-mapping.js";
import { DEFAULT_XJK_SESSION_TTL_SECONDS } from "./session-policy.js";

export class XjkAuthStore {
  constructor({ dbFile, sessionCookieName = "xjk_session", logger = console } = {}) {
    if (!dbFile) throw new Error("dbFile is required for XjkAuthStore.");
    this.dbFile = dbFile;
    this.sessionCookieName = String(sessionCookieName || "xjk_session").trim() || "xjk_session";
    this.logger = logger;
    this.db = openSqliteDatabase({
      filePath: dbFile,
      initialize: (db) => this.ensureSchema(db),
    });
  }

  ensureSchema(db = this.db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS xjk_accounts (
        account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        username TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS xjk_identity_links (
        identity_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_subject TEXT,
        provider_account_id TEXT,
        provider_username TEXT,
        provider_display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(account_id) REFERENCES xjk_accounts(account_id) ON DELETE CASCADE,
        UNIQUE(provider, provider_subject),
        UNIQUE(provider, provider_account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_xjk_identity_links_account_id
        ON xjk_identity_links(account_id);
      CREATE TABLE IF NOT EXISTS xjk_sessions (
        session_token TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        oauth_access_token TEXT NOT NULL,
        oauth_refresh_token TEXT,
        oauth_token_type TEXT,
        oauth_id_token TEXT,
        oauth_scope TEXT,
        oauth_expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(account_id) REFERENCES xjk_accounts(account_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_xjk_sessions_account_id
        ON xjk_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_xjk_sessions_expires_at
        ON xjk_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS xjk_account_preferences (
        account_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(account_id) REFERENCES xjk_accounts(account_id) ON DELETE CASCADE
      );
    `);
  }

  cleanupExpiredSessions(nowMs = Date.now()) {
    this.db.prepare("DELETE FROM xjk_sessions WHERE expires_at <= ?").run(nowMs);
  }

  getSessionTokenFromRequest(req) {
    return String(parseRequestCookies(req)[this.sessionCookieName] || "").trim();
  }

  getJoinedSessionByToken(sessionToken, { includeExpired = false } = {}) {
    const token = String(sessionToken || "").trim();
    if (!token) return null;
    const sql = `
      SELECT
        s.session_token,
        a.account_id AS xjk_account_id,
        COALESCE(l.provider_account_id, '') AS account_id,
        COALESCE(l.provider_subject, '') AS subject,
        COALESCE(a.display_name, l.provider_display_name) AS display_name,
        a.username AS username,
        s.oauth_access_token AS access_token,
        s.oauth_refresh_token AS refresh_token,
        s.oauth_token_type AS token_type,
        s.oauth_id_token AS id_token,
        s.oauth_scope AS scope,
        s.oauth_expires_at,
        s.created_at AS session_created_at,
        s.updated_at AS session_updated_at,
        s.expires_at AS session_expires_at,
        s.expires_at AS expires_at,
        a.display_name AS account_display_name,
        a.username AS account_username,
        a.is_active AS account_is_active,
        a.created_at AS account_created_at,
        a.updated_at AS account_updated_at,
        a.last_login_at AS account_last_login_at,
        l.provider_subject,
        l.provider_account_id,
        l.provider_username,
        l.provider_display_name
      FROM xjk_sessions s
      JOIN xjk_accounts a ON a.account_id = s.account_id
      LEFT JOIN xjk_identity_links l
        ON l.account_id = a.account_id
       AND l.provider = 'ubisoft'
      WHERE s.session_token = ?
        AND a.is_active = 1
        ${includeExpired ? "" : "AND s.expires_at > ?"}
      LIMIT 1
    `;
    const statement = this.db.prepare(sql);
    return includeExpired ? statement.get(token) || null : statement.get(token, Date.now()) || null;
  }

  resolveSessionFromRequest(req) {
    const token = this.getSessionTokenFromRequest(req);
    if (!token) return null;
    const row = this.getJoinedSessionByToken(token);
    if (!row) return null;
    return { token, row };
  }

  getAccountById(accountId) {
    const safeId = String(accountId || "").trim();
    if (!safeId) return null;
    return (
      this.db
        .prepare(
          `
          SELECT
            a.account_id AS xjk_account_id,
            COALESCE(l.provider_account_id, '') AS account_id,
            COALESCE(l.provider_subject, '') AS subject,
            COALESCE(a.display_name, l.provider_display_name) AS display_name,
            a.username AS username,
            a.display_name AS account_display_name,
            a.username AS account_username,
            a.is_active AS account_is_active,
            a.created_at AS account_created_at,
            a.updated_at AS account_updated_at,
            a.last_login_at AS account_last_login_at,
            l.provider_subject,
            l.provider_account_id,
            l.provider_username,
            l.provider_display_name
          FROM xjk_accounts a
          LEFT JOIN xjk_identity_links l
            ON l.account_id = a.account_id
           AND l.provider = 'ubisoft'
          WHERE a.account_id = ?
          LIMIT 1
        `
        )
        .get(safeId) || null
    );
  }

  getAccountByUbisoftIdentity({ subject = "", ubisoftAccountId = "" } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeAccountId = String(ubisoftAccountId || "").trim();
    if (!safeSubject && !safeAccountId) return null;
    return (
      this.db
        .prepare(
          `
          SELECT
            a.account_id AS xjk_account_id,
            COALESCE(l.provider_account_id, '') AS account_id,
            COALESCE(l.provider_subject, '') AS subject,
            COALESCE(a.display_name, l.provider_display_name) AS display_name,
            a.username AS username,
            a.display_name AS account_display_name,
            a.username AS account_username,
            a.is_active AS account_is_active,
            a.created_at AS account_created_at,
            a.updated_at AS account_updated_at,
            a.last_login_at AS account_last_login_at,
            l.provider_subject,
            l.provider_account_id,
            l.provider_username,
            l.provider_display_name
          FROM xjk_identity_links l
          JOIN xjk_accounts a ON a.account_id = l.account_id
          WHERE l.provider = 'ubisoft'
            AND (
              (? <> '' AND l.provider_subject = ?)
              OR
              (? <> '' AND l.provider_account_id = ?)
            )
          ORDER BY CASE WHEN l.provider_subject = ? THEN 0 ELSE 1 END
          LIMIT 1
        `
        )
        .get(safeSubject, safeSubject, safeAccountId, safeAccountId, safeSubject) || null
    );
  }

  upsertUbisoftAccount(profile = {}, { touchLogin = false } = {}) {
    const subject = String(profile.subject || "").trim() || null;
    const ubisoftAccountId = String(profile.ubisoftAccountId || profile.accountId || "").trim() || null;
    const displayName =
      String(profile.displayName || profile.username || ubisoftAccountId || subject || "").trim() || null;
    const username = String(profile.username || profile.displayName || "").trim() || null;
    if (!subject && !ubisoftAccountId) {
      throw new Error("Ubisoft profile did not include a subject or account ID.");
    }
    if (!displayName) {
      throw new Error("Ubisoft profile did not include a display name.");
    }

    const existing = this.getAccountByUbisoftIdentity({ subject, ubisoftAccountId });
    const nowMs = Date.now();
    const nowFields = accountNowFields(nowMs);
    const accountId = String(existing?.xjk_account_id || existing?.accountId || crypto.randomUUID()).trim();

    this.db
      .prepare(
        `
      INSERT INTO xjk_accounts (
        account_id, display_name, username, is_active, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        display_name = excluded.display_name,
        username = COALESCE(excluded.username, xjk_accounts.username),
        updated_at = excluded.updated_at,
        last_login_at = CASE
          WHEN excluded.last_login_at IS NOT NULL THEN excluded.last_login_at
          ELSE xjk_accounts.last_login_at
        END
    `
      )
      .run(
        accountId,
        displayName,
        username,
        Number(existing?.account_is_active || 1) > 0 ? 1 : 0,
        Number(existing?.account_created_at || nowFields.createdAt),
        nowFields.updatedAt,
        touchLogin ? nowFields.lastLoginAt : Number(existing?.account_last_login_at || 0) || null
      );

    this.db
      .prepare(
        `
      INSERT INTO xjk_identity_links (
        identity_id, account_id, provider, provider_subject, provider_account_id,
        provider_username, provider_display_name, created_at, updated_at
      ) VALUES (?, ?, 'ubisoft', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_subject) DO UPDATE SET
        account_id = excluded.account_id,
        provider_account_id = COALESCE(excluded.provider_account_id, xjk_identity_links.provider_account_id),
        provider_username = COALESCE(excluded.provider_username, xjk_identity_links.provider_username),
        provider_display_name = excluded.provider_display_name,
        updated_at = excluded.updated_at
    `
      )
      .run(
        crypto.randomUUID(),
        accountId,
        subject,
        ubisoftAccountId,
        username,
        displayName,
        Number(existing?.account_created_at || nowFields.createdAt),
        nowFields.updatedAt
      );

    if (ubisoftAccountId) {
      this.db
        .prepare(
          `
        INSERT INTO xjk_identity_links (
          identity_id, account_id, provider, provider_subject, provider_account_id,
          provider_username, provider_display_name, created_at, updated_at
        ) VALUES (?, ?, 'ubisoft', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_account_id) DO UPDATE SET
          account_id = excluded.account_id,
          provider_subject = COALESCE(excluded.provider_subject, xjk_identity_links.provider_subject),
          provider_username = COALESCE(excluded.provider_username, xjk_identity_links.provider_username),
          provider_display_name = excluded.provider_display_name,
          updated_at = excluded.updated_at
      `
        )
        .run(
          crypto.randomUUID(),
          accountId,
          subject,
          ubisoftAccountId,
          username,
          displayName,
          Number(existing?.account_created_at || nowFields.createdAt),
          nowFields.updatedAt
        );
    }

    return this.getAccountById(accountId);
  }

  createSessionForAccount({ accountId, oauth = {}, sessionTtlSeconds = DEFAULT_XJK_SESSION_TTL_SECONDS } = {}) {
    const safeAccountId = String(accountId || "").trim();
    if (!safeAccountId) throw new Error("accountId is required to create a session.");
    const accessToken = String(oauth.accessToken || oauth.access_token || "").trim();
    if (!accessToken) throw new Error("OAuth access token is required to create a session.");
    const refreshToken = String(oauth.refreshToken || oauth.refresh_token || "").trim() || null;
    const tokenType = String(oauth.tokenType || oauth.token_type || "Bearer").trim() || "Bearer";
    const idToken = String(oauth.idToken || oauth.id_token || "").trim() || null;
    const scope = String(oauth.scope || "").trim() || null;
    const nowMs = Date.now();
    const sessionToken = crypto.randomBytes(32).toString("hex");
    this.db
      .prepare(
        `
      INSERT INTO xjk_sessions (
        session_token, account_id, oauth_access_token, oauth_refresh_token, oauth_token_type,
        oauth_id_token, oauth_scope, oauth_expires_at, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        sessionToken,
        safeAccountId,
        accessToken,
        refreshToken,
        tokenType,
        idToken,
        scope,
        Number(oauth.expiresAt || tokenExpiryMs(oauth, nowMs + 3600 * 1000)),
        nowMs,
        nowMs,
        nowMs + Math.max(300, Number(sessionTtlSeconds) || DEFAULT_XJK_SESSION_TTL_SECONDS) * 1000
      );
    return this.getJoinedSessionByToken(sessionToken, { includeExpired: true });
  }

  renewSession(sessionToken, sessionTtlSeconds = DEFAULT_XJK_SESSION_TTL_SECONDS) {
    const token = String(sessionToken || "").trim();
    if (!token) return null;
    const ttlSeconds = Math.max(300, Number(sessionTtlSeconds) || DEFAULT_XJK_SESSION_TTL_SECONDS);
    const nowMs = Date.now();
    this.db
      .prepare(
        `
      UPDATE xjk_sessions
      SET expires_at = ?, updated_at = ?
      WHERE session_token = ?
        AND expires_at > ?
    `
      )
      .run(nowMs + ttlSeconds * 1000, nowMs, token, nowMs);
    return this.getJoinedSessionByToken(token);
  }

  updateSessionOauth(sessionToken, oauth = {}) {
    const token = String(sessionToken || "").trim();
    if (!token) return null;
    const existing = this.getJoinedSessionByToken(token, { includeExpired: true });
    if (!existing) return null;
    const nowMs = Date.now();
    const next = {
      accessToken: String(oauth.accessToken || oauth.access_token || existing.access_token || "").trim(),
      refreshToken: String(oauth.refreshToken || oauth.refresh_token || existing.refresh_token || "").trim() || null,
      tokenType: String(oauth.tokenType || oauth.token_type || existing.token_type || "Bearer").trim() || "Bearer",
      idToken: String(oauth.idToken || oauth.id_token || existing.id_token || "").trim() || null,
      scope: String(oauth.scope || existing.scope || "").trim() || null,
      expiresAt: Number(oauth.expiresAt || tokenExpiryMs(oauth, nowMs + 3600 * 1000)),
    };
    this.db
      .prepare(
        `
      UPDATE xjk_sessions
      SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_token_type = ?, oauth_id_token = ?,
          oauth_scope = ?, oauth_expires_at = ?, updated_at = ?
      WHERE session_token = ?
    `
      )
      .run(next.accessToken, next.refreshToken, next.tokenType, next.idToken, next.scope, next.expiresAt, nowMs, token);
    return this.getJoinedSessionByToken(token, { includeExpired: true });
  }

  touchAccountLogin(accountId) {
    const safeAccountId = String(accountId || "").trim();
    if (!safeAccountId) return;
    this.db
      .prepare(
        `
      UPDATE xjk_accounts
      SET last_login_at = ?, updated_at = ?
      WHERE account_id = ?
    `
      )
      .run(Date.now(), Date.now(), safeAccountId);
  }

  deleteSessionByToken(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) return;
    this.db.prepare("DELETE FROM xjk_sessions WHERE session_token = ?").run(token);
  }

  getAccountPreferences(accountId) {
    const safeAccountId = String(accountId || "").trim();
    if (!safeAccountId) return null;
    const row =
      this.db
        .prepare(
          `
          SELECT account_id, preferences_json, created_at, updated_at
          FROM xjk_account_preferences
          WHERE account_id = ?
          LIMIT 1
        `
        )
        .get(safeAccountId) || null;
    if (!row) return null;

    let preferences = {};
    try {
      const parsed = JSON.parse(String(row.preferences_json || "{}"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        preferences = parsed;
      }
    } catch {
      preferences = {};
    }

    return {
      accountId: safeAccountId,
      preferences,
      createdAt: isoOrNull(row.created_at),
      updatedAt: isoOrNull(row.updated_at),
    };
  }

  saveAccountPreferences(accountId, preferences = {}) {
    const safeAccountId = String(accountId || "").trim();
    if (!safeAccountId) throw new Error("accountId is required to save preferences.");
    const normalized = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    const nowMs = Date.now();
    const existing = this.getAccountPreferences(safeAccountId);

    this.db
      .prepare(
        `
      INSERT INTO xjk_account_preferences (
        account_id, preferences_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        preferences_json = excluded.preferences_json,
        updated_at = excluded.updated_at
    `
      )
      .run(
        safeAccountId,
        JSON.stringify(normalized),
        Number(existing?.createdAt ? new Date(existing.createdAt).getTime() : nowMs),
        nowMs
      );

    return this.getAccountPreferences(safeAccountId);
  }

  clearAccountPreferences(accountId) {
    const safeAccountId = String(accountId || "").trim();
    if (!safeAccountId) return;
    this.db.prepare("DELETE FROM xjk_account_preferences WHERE account_id = ?").run(safeAccountId);
  }
}
