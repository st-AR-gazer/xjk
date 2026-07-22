import { firstDefined, parseList } from "./configuration.js";

export function accountNowFields(nowMs = Date.now()) {
  return {
    createdAt: nowMs,
    updatedAt: nowMs,
    lastLoginAt: nowMs,
  };
}

export function isoOrNull(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : null;
}

export function publicAccountFromRow(row = null) {
  if (!row) return null;
  return {
    xjkAccountId: String(row.xjk_account_id || row.account_id || "").trim() || null,
    ubisoftAccountId: String(row.provider_account_id || row.ubisoft_account_id || row.account_id || "").trim() || null,
    subject: String(row.provider_subject || row.subject || "").trim() || null,
    displayName: String(row.account_display_name || row.provider_display_name || row.display_name || "").trim() || null,
    username: String(row.account_username || row.provider_username || row.username || "").trim() || null,
    createdAt: isoOrNull(row.account_created_at),
    lastLoginAt: isoOrNull(row.account_last_login_at),
    isActive: Number(row.account_is_active || 0) > 0,
  };
}

export function publicSessionFromRow(row = null) {
  if (!row) return null;
  return {
    user: publicAccountFromRow(row),
    createdAt: isoOrNull(row.session_created_at),
    expiresAt: isoOrNull(row.session_expires_at || row.expires_at),
    oauth: {
      hasAccessToken: Boolean(String(row.oauth_access_token || row.access_token || "").trim()),
      accessTokenExpiresAt: isoOrNull(row.oauth_expires_at),
    },
  };
}

function parseEnvList(env = {}, keys = []) {
  return parseList(firstDefined(...keys.map((key) => env[key])));
}

function normalizeIdentityMatchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasIdentityMatch(value, allowedValues = []) {
  const normalizedValue = normalizeIdentityMatchValue(value);
  if (!normalizedValue) return false;
  return allowedValues.some((allowed) => normalizeIdentityMatchValue(allowed) === normalizedValue);
}

export function loadXjkAdminIdentityConfig(env = process.env) {
  return {
    xjkAccountIds: parseEnvList(env, ["XJK_ADMIN_XJK_ACCOUNT_IDS", "XJK_ADMIN_ACCOUNT_IDS"]),
    ubisoftAccountIds: parseEnvList(env, ["XJK_ADMIN_UBISOFT_ACCOUNT_IDS", "XJK_ADMIN_UBISOFT_IDS"]),
    ubisoftSubjects: parseEnvList(env, ["XJK_ADMIN_UBISOFT_SUBJECTS", "XJK_ADMIN_SUBJECTS"]),
  };
}

export function xjkAdminIdentityConfigured(config = loadXjkAdminIdentityConfig()) {
  return Object.values(config || {}).some((values) => Array.isArray(values) && values.length > 0);
}

export function accountMatchesXjkAdminIdentity(account = null, config = loadXjkAdminIdentityConfig()) {
  if (!account || account.isActive !== true) return false;
  return (
    hasIdentityMatch(account.xjkAccountId, config.xjkAccountIds) ||
    hasIdentityMatch(account.ubisoftAccountId, config.ubisoftAccountIds) ||
    hasIdentityMatch(account.subject, config.ubisoftSubjects)
  );
}

export function decorateAccountWithXjkRoles(account = null, config = loadXjkAdminIdentityConfig()) {
  if (!account) return null;
  const roles = new Set(Array.isArray(account.roles) ? account.roles : []);
  if (account.isActive !== true) roles.delete("admin");
  if (accountMatchesXjkAdminIdentity(account, config)) roles.add("admin");
  return {
    ...account,
    roles: [...roles],
    admin: roles.has("admin"),
  };
}

export function publicAccountWithRolesFromRow(row = null, config = loadXjkAdminIdentityConfig()) {
  return decorateAccountWithXjkRoles(publicAccountFromRow(row), config);
}

export function publicSessionWithRolesFromRow(row = null, config = loadXjkAdminIdentityConfig()) {
  const session = publicSessionFromRow(row);
  if (!session) return null;
  return {
    ...session,
    user: decorateAccountWithXjkRoles(session.user, config),
  };
}
