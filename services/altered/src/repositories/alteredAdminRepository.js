import { clampInt, parseJsonSafe, serializeJson } from "../../../shared/valueUtils.js";

class AlteredAdminRepository {
  constructor(db) {
    this.db = db;
  }

  normalizeAdminRole(value, fallback = "admin") {
    const role = String(value || "")
      .trim()
      .toLowerCase();
    if (role === "owner" || role === "admin" || role === "operator" || role === "viewer") {
      return role;
    }
    return fallback;
  }

  rowToAdminUser(row) {
    if (!row) return null;
    return {
      adminUserId: Number(row.adminUserId || 0),
      subject: String(row.subject || "").trim() || null,
      username: String(row.username || "").trim() || null,
      displayName: String(row.displayName || "").trim() || null,
      role: this.normalizeAdminRole(row.role, "admin"),
      isActive: Boolean(row.isActive),
      source: String(row.source || "").trim() || "manual",
      note: String(row.note || "").trim() || null,
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      lastLoginAt: row.lastLoginAt || null,
    };
  }

  getAdminUserById(adminUserId) {
    const row = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE admin_user_id = ?
        LIMIT 1
        `
      )
      .get(Number(adminUserId) || 0);
    return this.rowToAdminUser(row);
  }

  listAdminUsers({ includeInactive = true, limit = 500 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE (? = 1 OR is_active = 1)
        ORDER BY admin_user_id DESC
        LIMIT ?
        `
      )
      .all(includeInactive ? 1 : 0, Math.max(1, Math.min(Number(limit) || 500, 5000)));
    return rows.map((row) => this.rowToAdminUser(row)).filter(Boolean);
  }

  findAdminUserBySubjectOrUsername({ subject = "", username = "", includeInactive = false } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "")
      .trim()
      .toLowerCase();
    if (!safeSubject && !safeUsername) return null;

    const row = this.db
      .prepare(
        `
        SELECT
          admin_user_id AS adminUserId,
          ubisoft_subject AS subject,
          ubisoft_username AS username,
          display_name AS displayName,
          role,
          is_active AS isActive,
          source,
          note,
          created_at AS createdAt,
          updated_at AS updatedAt,
          last_login_at AS lastLoginAt
        FROM altered_admin_users
        WHERE
          (? = 1 OR is_active = 1)
          AND (
            (? <> '' AND LOWER(COALESCE(ubisoft_subject, '')) = LOWER(?))
            OR (? <> '' AND LOWER(COALESCE(ubisoft_username, '')) = ?)
          )
        ORDER BY
          CASE
            WHEN (? <> '' AND LOWER(COALESCE(ubisoft_subject, '')) = LOWER(?)) THEN 0
            ELSE 1
          END,
          admin_user_id DESC
        LIMIT 1
        `
      )
      .get(includeInactive ? 1 : 0, safeSubject, safeSubject, safeUsername, safeUsername, safeSubject, safeSubject);
    return this.rowToAdminUser(row);
  }

  countActiveAdminUsers() {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM altered_admin_users WHERE is_active = 1").get();
    return Number(row?.count || 0);
  }

  upsertAdminUser({
    subject = "",
    username = "",
    displayName = "",
    role = "admin",
    isActive = true,
    source = "manual",
    note = "",
  } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim();
    if (!safeSubject && !safeUsername) {
      return { error: "subject or username is required." };
    }

    const safeDisplayName = String(displayName || "").trim() || null;
    const safeRole = this.normalizeAdminRole(role, "admin");
    const safeSource = String(source || "").trim() || "manual";
    const safeNote = String(note || "").trim() || null;
    const now = new Date().toISOString();

    const existing = this.findAdminUserBySubjectOrUsername({
      subject: safeSubject,
      username: safeUsername,
      includeInactive: true,
    });

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE altered_admin_users
          SET
            ubisoft_subject = COALESCE(NULLIF(?, ''), ubisoft_subject),
            ubisoft_username = COALESCE(NULLIF(?, ''), ubisoft_username),
            display_name = COALESCE(?, display_name),
            role = ?,
            is_active = ?,
            source = ?,
            note = ?,
            updated_at = ?
          WHERE admin_user_id = ?
          `
        )
        .run(
          safeSubject,
          safeUsername,
          safeDisplayName,
          safeRole,
          isActive ? 1 : 0,
          safeSource,
          safeNote,
          now,
          existing.adminUserId
        );
      return { adminUser: this.getAdminUserById(existing.adminUserId) };
    }

    try {
      const created = this.db
        .prepare(
          `
          INSERT INTO altered_admin_users (
            ubisoft_subject,
            ubisoft_username,
            display_name,
            role,
            is_active,
            source,
            note,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          safeSubject || null,
          safeUsername || null,
          safeDisplayName,
          safeRole,
          isActive ? 1 : 0,
          safeSource,
          safeNote,
          now,
          now
        );
      return { adminUser: this.getAdminUserById(Number(created.lastInsertRowid || 0)) };
    } catch (error) {
      if (
        String(error?.message || "")
          .toLowerCase()
          .includes("unique")
      ) {
        return { error: "Admin user with this Ubisoft subject already exists." };
      }
      return { error: error?.message || "Failed to upsert admin user." };
    }
  }

  updateAdminUserActive({ adminUserId, isActive }) {
    const existing = this.getAdminUserById(adminUserId);
    if (!existing) return null;
    this.db
      .prepare(
        `
        UPDATE altered_admin_users
        SET is_active = ?, updated_at = ?
        WHERE admin_user_id = ?
        `
      )
      .run(Boolean(isActive) ? 1 : 0, new Date().toISOString(), existing.adminUserId);
    return this.getAdminUserById(existing.adminUserId);
  }

  seedAdminAllowlistFromConfig({ subjects = [], usernames = [] } = {}) {
    const seeded = [];

    for (const subject of Array.isArray(subjects) ? subjects : []) {
      const safeSubject = String(subject || "").trim();
      if (!safeSubject) continue;
      const result = this.upsertAdminUser({
        subject: safeSubject,
        source: "env-bootstrap",
        role: "admin",
        isActive: true,
      });
      if (!result?.error && result?.adminUser) {
        seeded.push(result.adminUser);
      }
    }

    for (const username of Array.isArray(usernames) ? usernames : []) {
      const safeUsername = String(username || "").trim();
      if (!safeUsername) continue;
      const result = this.upsertAdminUser({
        username: safeUsername,
        source: "env-bootstrap",
        role: "admin",
        isActive: true,
      });
      if (!result?.error && result?.adminUser) {
        seeded.push(result.adminUser);
      }
    }

    return {
      seededCount: seeded.length,
      activeCount: this.countActiveAdminUsers(),
      seeded,
    };
  }

  isUbisoftAdminAllowed({ subject = "", username = "", profile = null } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim();
    if (!safeSubject && !safeUsername) {
      return {
        allowed: false,
        reason: "Ubisoft profile did not include subject or username.",
      };
    }

    const entry = this.findAdminUserBySubjectOrUsername({
      subject: safeSubject,
      username: safeUsername,
      includeInactive: true,
    });
    if (!entry) {
      return {
        allowed: false,
        reason: "Authenticated Ubisoft user is not in the admin allowlist.",
      };
    }
    if (!entry.isActive) {
      return {
        allowed: false,
        reason: "Authenticated Ubisoft user is disabled in the admin allowlist.",
      };
    }

    const now = new Date().toISOString();
    const displayName =
      String(
        profile?.raw?.userInfo?.display_name ||
          profile?.raw?.userInfo?.name ||
          profile?.displayName ||
          entry.displayName ||
          ""
      ).trim() || null;

    this.db
      .prepare(
        `
        UPDATE altered_admin_users
        SET
          ubisoft_subject = COALESCE(NULLIF(?, ''), ubisoft_subject),
          ubisoft_username = COALESCE(NULLIF(?, ''), ubisoft_username),
          display_name = COALESCE(?, display_name),
          last_login_at = ?,
          updated_at = ?
        WHERE admin_user_id = ?
        `
      )
      .run(safeSubject, safeUsername, displayName, now, now, entry.adminUserId);

    const updated = this.getAdminUserById(entry.adminUserId) || entry;
    return {
      allowed: true,
      user: updated,
    };
  }

  normalizeAdminSessionRecord(record = {}) {
    if (!record || typeof record !== "object") return null;
    const createdAt = clampInt(record.createdAt, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: Date.now(),
    });
    const expiresAt = clampInt(record.expiresAt, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    });
    if (!expiresAt) return null;
    const user = record.user && typeof record.user === "object" ? { ...record.user } : {};
    const oauth = record.oauth && typeof record.oauth === "object" ? { ...record.oauth } : {};
    return {
      ...record,
      user,
      oauth,
      createdAt,
      expiresAt,
    };
  }

  getAdminSessionByToken(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) return null;

    const row = this.db
      .prepare(
        `
        SELECT
          session_token AS token,
          session_json AS sessionJson,
          expires_at AS expiresAt
        FROM altered_admin_sessions
        WHERE session_token = ?
        LIMIT 1
        `
      )
      .get(token);
    if (!row) return null;

    const expiresAt = clampInt(row.expiresAt, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    });
    if (!expiresAt || expiresAt <= Date.now()) {
      this.deleteAdminSessionByToken(token);
      return null;
    }

    const parsed = this.normalizeAdminSessionRecord(parseJsonSafe(row.sessionJson, null));
    if (!parsed || parsed.expiresAt <= Date.now()) {
      this.deleteAdminSessionByToken(token);
      return null;
    }

    return {
      token,
      record: parsed,
    };
  }

  upsertAdminSession({ token, record } = {}) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return false;

    const normalized = this.normalizeAdminSessionRecord(record);
    if (!normalized) return false;

    const serialized = serializeJson(normalized);
    if (!serialized) return false;

    const now = Date.now();
    const safeSubject = String(normalized.user?.subject || "").trim() || null;
    const safeUsername = String(normalized.user?.username || "").trim() || null;
    const adminUserId = clampInt(normalized.user?.adminUserId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });

    this.db
      .prepare(
        `
        INSERT INTO altered_admin_sessions (
          session_token,
          admin_user_id,
          ubisoft_subject,
          ubisoft_username,
          session_json,
          created_at,
          expires_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_token) DO UPDATE SET
          admin_user_id = excluded.admin_user_id,
          ubisoft_subject = excluded.ubisoft_subject,
          ubisoft_username = excluded.ubisoft_username,
          session_json = excluded.session_json,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
        `
      )
      .run(
        safeToken,
        adminUserId || null,
        safeSubject,
        safeUsername,
        serialized,
        clampInt(normalized.createdAt, {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          fallback: now,
        }),
        clampInt(normalized.expiresAt, {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          fallback: now,
        }),
        now
      );

    return true;
  }

  deleteAdminSessionByToken(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) return 0;
    const result = this.db.prepare("DELETE FROM altered_admin_sessions WHERE session_token = ?").run(token);
    return Number(result?.changes || 0);
  }

  deleteExpiredAdminSessions({ beforeMs = Date.now() } = {}) {
    const threshold = clampInt(beforeMs, {
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      fallback: Date.now(),
    });
    const result = this.db.prepare("DELETE FROM altered_admin_sessions WHERE expires_at <= ?").run(threshold);
    return Number(result?.changes || 0);
  }
}

export { AlteredAdminRepository };
