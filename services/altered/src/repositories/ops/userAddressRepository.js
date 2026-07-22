import { clampInt, toIso, toNullableIso, toText } from "../../../../shared/valueUtils.js";
import { boolToInt } from "./support.js";

function rowToUser(row, { includeSecrets = false } = {}) {
  if (includeSecrets) {
    return {
      id: Number(row.id || 0),
      userTypeId: row.userTypeId ? Number(row.userTypeId) : null,
      userType: toText(row.userType) || null,
      parseId: toText(row.parseId) || null,
      email: toText(row.email),
      password: toText(row.password),
      loggedIn: Boolean(row.loggedIn),
      tokenFacebook: toText(row.tokenFacebook) || null,
      tokenTwitter: toText(row.tokenTwitter) || null,
      userToken: toText(row.userToken) || null,
      tokenExpiration: toNullableIso(row.tokenExpiration),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }
  return {
    id: Number(row.id || 0),
    userTypeId: row.userTypeId ? Number(row.userTypeId) : null,
    userType: toText(row.userType) || null,
    parseId: toText(row.parseId) || null,
    email: toText(row.email),
    loggedIn: Boolean(row.loggedIn),
    userToken: toText(row.userToken) || null,
    tokenExpiration: toNullableIso(row.tokenExpiration),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

class OpsUserAddressRepository {
  constructor(db) {
    this.db = db;
  }

  ensureDefaultUserTypes() {
    const insertType = this.db.prepare("INSERT OR IGNORE INTO user_types (type) VALUES (?)");
    for (const type of ["admin", "operator", "viewer"]) {
      insertType.run(type);
    }
  }

  listUserTypes() {
    return this.db
      .prepare("SELECT id, type FROM user_types ORDER BY id ASC")
      .all()
      .map((row) => ({
        id: Number(row.id || 0),
        type: toText(row.type),
      }));
  }

  getUser(userId) {
    const row = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.user_type_id AS userTypeId,
          t.type AS userType,
          u.parse_id AS parseId,
          u.email,
          u.password,
          u.logged_in AS loggedIn,
          u.token_facebook AS tokenFacebook,
          u.token_twitter AS tokenTwitter,
          u.user_token AS userToken,
          u.token_expiration AS tokenExpiration,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt
        FROM users u
        LEFT JOIN user_types t ON t.id = u.user_type_id
        WHERE u.id = ?
        LIMIT 1
        `
      )
      .get(Number(userId) || 0);
    return row ? rowToUser(row, { includeSecrets: true }) : null;
  }

  listUsers({ limit = 250 } = {}) {
    const rows = this.db
      .prepare(
        `
        SELECT
          u.id,
          u.user_type_id AS userTypeId,
          t.type AS userType,
          u.parse_id AS parseId,
          u.email,
          u.logged_in AS loggedIn,
          u.user_token AS userToken,
          u.token_expiration AS tokenExpiration,
          u.created_at AS createdAt,
          u.updated_at AS updatedAt
        FROM users u
        LEFT JOIN user_types t ON t.id = u.user_type_id
        ORDER BY u.id DESC
        LIMIT ?
        `
      )
      .all(clampInt(limit, { min: 1, max: 2000, fallback: 250 }));
    return rows.map((row) => rowToUser(row));
  }

  createUser(payload = {}) {
    const now = new Date().toISOString();
    const email = toText(payload.email).toLowerCase();
    const password = toText(payload.password);
    if (!email.includes("@")) return { error: "A valid email is required." };
    if (!password) return { error: "password is required." };

    const userTypeId = clampInt(payload.userTypeId, {
      min: 1,
      max: 2147483647,
      fallback: 0,
    });
    const safeTypeId = userTypeId || null;

    try {
      const result = this.db
        .prepare(
          `
          INSERT INTO users (
            user_type_id,
            parse_id,
            email,
            password,
            logged_in,
            token_facebook,
            token_twitter,
            user_token,
            token_expiration,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          safeTypeId,
          toText(payload.parseId),
          email,
          password,
          boolToInt(Boolean(payload.loggedIn)),
          toText(payload.tokenFacebook),
          toText(payload.tokenTwitter),
          toText(payload.userToken),
          toNullableIso(payload.tokenExpiration),
          now,
          now
        );
      return { user: this.getUser(Number(result.lastInsertRowid || 0)) };
    } catch (error) {
      if (
        String(error?.message || "")
          .toLowerCase()
          .includes("unique")
      ) {
        return { error: "A user with this email already exists." };
      }
      return { error: error?.message || "Failed to create user." };
    }
  }

  addUserAddress({ userId, title }) {
    const user = this.getUser(userId);
    if (!user) return { error: "User not found." };
    const safeTitle = toText(title);
    if (!safeTitle) return { error: "title is required." };
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO user_addresses (user_id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        `
      )
      .run(user.id, safeTitle, now, now);
    return { addressId: Number(result.lastInsertRowid || 0) };
  }

  listUserAddresses(userId, { limit = 100 } = {}) {
    return this.db
      .prepare(
        `
        SELECT
          id,
          user_id AS userId,
          title,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM user_addresses
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
        `
      )
      .all(Number(userId) || 0, clampInt(limit, { min: 1, max: 1000, fallback: 100 }))
      .map((row) => ({
        id: Number(row.id || 0),
        userId: Number(row.userId || 0),
        title: toText(row.title),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      }));
  }

  countUsers() {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0);
  }
}

export { OpsUserAddressRepository };
