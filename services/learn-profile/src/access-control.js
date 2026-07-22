import { LEARN_ROLE_RANKS } from "./constants.js";

export function normalizeIdentity(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeRole(value = "viewer", fallback = "viewer") {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (["owner", "admin", "editor", "viewer"].includes(role)) return role;
  return fallback;
}

export function roleRank(role = "viewer") {
  return LEARN_ROLE_RANKS[normalizeRole(role)] || 0;
}

export function permissionsForRole(role = "viewer") {
  const rank = roleRank(role);
  return {
    adminRead: rank >= 1,
    contentEdit: rank >= 1,
    contentCreate: rank >= 1,
    roleManage: rank >= 2,
    ownerManage: rank >= 3,
  };
}

export function publicAccount(account = null) {
  if (!account) return null;
  const role = normalizeRole(account.role);
  return {
    id: account.id || null,
    xjkAccountId: account.xjkAccountId || null,
    subject: account.subject || null,
    username: account.username || null,
    displayName: account.displayName || null,
    accountId: account.accountId || null,
    role,
    isActive: account.isActive !== false,
    source: account.source || "profile-login",
    note: account.note || "",
    createdAt: account.createdAt || null,
    updatedAt: account.updatedAt || null,
    lastLoginAt: account.lastLoginAt || null,
    permissions: permissionsForRole(role),
  };
}
