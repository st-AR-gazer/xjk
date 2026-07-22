import crypto from "node:crypto";

import { normalizeIdentity, normalizeRole, publicAccount, roleRank } from "./access-control.js";

export function createAccountStore({ config, files } = {}) {
  const accounts = [];

  function findAccountById(id = "") {
    const safeId = String(id || "").trim();
    if (!safeId) return null;
    return accounts.find((account) => account.id === safeId) || null;
  }

  function findAccountByIdentity({ subject = "", username = "", accountId = "", xjkAccountId = "" } = {}) {
    const safeSubject = normalizeIdentity(subject);
    const safeUsername = normalizeIdentity(username);
    const safeAccountId = normalizeIdentity(accountId);
    const safeXjkAccountId = normalizeIdentity(xjkAccountId);
    if (!safeSubject && !safeUsername && !safeAccountId && !safeXjkAccountId) return null;
    return (
      accounts.find((account) => {
        return (
          (safeXjkAccountId && normalizeIdentity(account.xjkAccountId) === safeXjkAccountId) ||
          (safeSubject && normalizeIdentity(account.subject) === safeSubject) ||
          (safeUsername && normalizeIdentity(account.username) === safeUsername) ||
          (safeUsername && normalizeIdentity(account.displayName) === safeUsername) ||
          (safeAccountId && normalizeIdentity(account.accountId) === safeAccountId)
        );
      }) || null
    );
  }

  async function persistAccounts() {
    await files.writeJsonAtomic(files.paths.accountsFile, {
      version: 1,
      updatedAt: new Date().toISOString(),
      accounts: accounts.map(publicAccount),
    });
  }

  async function readPersistedAccounts() {
    await files.ensureDataDir();
    const payload = await files.readJson(files.paths.accountsFile);
    if (!payload) return;
    accounts.length = 0;
    for (const raw of Array.isArray(payload.accounts) ? payload.accounts : []) {
      const subject = String(raw.subject || "").trim();
      const username = String(raw.username || "").trim();
      const displayName = String(raw.displayName || "").trim();
      const accountId = String(raw.accountId || "").trim();
      const xjkAccountId = String(raw.xjkAccountId || "").trim();
      if (!subject && !username && !displayName && !accountId) continue;
      accounts.push({
        id: String(raw.id || crypto.randomUUID?.() || crypto.randomBytes(12).toString("hex")).trim(),
        xjkAccountId: xjkAccountId || null,
        subject: subject || null,
        username: username || null,
        displayName: displayName || null,
        accountId: accountId || null,
        role: normalizeRole(raw.role, "viewer"),
        isActive: raw.isActive !== false,
        source: String(raw.source || "profile-login").trim(),
        note: String(raw.note || "").trim(),
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
        lastLoginAt: raw.lastLoginAt || null,
      });
    }
  }

  async function upsertAccount({
    xjkAccountId = "",
    subject = "",
    username = "",
    displayName = "",
    accountId = "",
    role = "viewer",
    isActive = true,
    source = "manual",
    note = "",
    touchLogin = false,
  } = {}) {
    const safeSubject = String(subject || "").trim();
    const safeUsername = String(username || "").trim();
    const safeDisplayName = String(displayName || "").trim();
    const safeAccountId = String(accountId || "").trim();
    const safeXjkAccountId = String(xjkAccountId || "").trim();
    if (!safeSubject && !safeUsername && !safeDisplayName && !safeAccountId) {
      throw new Error("An account requires a subject, username, display name, or account id.");
    }

    const now = new Date().toISOString();
    const existing = findAccountByIdentity({
      xjkAccountId: safeXjkAccountId,
      subject: safeSubject,
      username: safeUsername || safeDisplayName,
      accountId: safeAccountId,
    });
    const nextRole = normalizeRole(role, existing?.role || "viewer");

    if (existing) {
      existing.xjkAccountId = safeXjkAccountId || existing.xjkAccountId || null;
      existing.subject = safeSubject || existing.subject || null;
      existing.username = safeUsername || existing.username || safeDisplayName || null;
      existing.displayName = safeDisplayName || existing.displayName || safeUsername || null;
      existing.accountId = safeAccountId || existing.accountId || null;
      existing.role = nextRole;
      existing.isActive = Boolean(isActive);
      existing.source = source || existing.source || "manual";
      existing.note = String(note || existing.note || "").trim();
      existing.updatedAt = now;
      if (touchLogin) existing.lastLoginAt = now;
      await persistAccounts();
      return existing;
    }

    const account = {
      id: crypto.randomUUID?.() || crypto.randomBytes(12).toString("hex"),
      xjkAccountId: safeXjkAccountId || null,
      subject: safeSubject || null,
      username: safeUsername || safeDisplayName || null,
      displayName: safeDisplayName || safeUsername || null,
      accountId: safeAccountId || null,
      role: nextRole,
      isActive: Boolean(isActive),
      source: source || "manual",
      note: String(note || "").trim(),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: touchLogin ? now : null,
    };
    accounts.push(account);
    await persistAccounts();
    return account;
  }

  function bootstrapRoleForProfile(profile = {}) {
    const subject = normalizeIdentity(profile.subject || profile.accountId);
    const username = normalizeIdentity(profile.username || profile.displayName);
    const ownerSubjects = new Set(config.headAdminSubjects.map(normalizeIdentity));
    const ownerUsernames = new Set(config.headAdminUsernames.map(normalizeIdentity));
    const editorSubjects = new Set(config.bootstrapEditorSubjects.map(normalizeIdentity));
    const editorUsernames = new Set(config.bootstrapEditorUsernames.map(normalizeIdentity));
    if ((subject && ownerSubjects.has(subject)) || (username && ownerUsernames.has(username))) return "owner";
    if ((subject && editorSubjects.has(subject)) || (username && editorUsernames.has(username))) return "editor";
    return "viewer";
  }

  async function ensureAccountForProfile(profile = {}, { touchLogin = false } = {}) {
    const existing = findAccountByIdentity({
      xjkAccountId: profile.xjkAccountId || "",
      subject: profile.subject || "",
      username: profile.username || profile.displayName || "",
      accountId: profile.accountId || "",
    });
    const bootstrapRole = bootstrapRoleForProfile(profile);
    const role = existing && roleRank(existing.role) >= roleRank(bootstrapRole) ? existing.role : bootstrapRole;
    return upsertAccount({
      xjkAccountId: profile.xjkAccountId || "",
      subject: profile.subject || "",
      username: profile.username || profile.displayName || "",
      displayName: profile.displayName || profile.username || "",
      accountId: profile.accountId || "",
      role,
      isActive: existing ? existing.isActive !== false : true,
      source: existing?.source || (role === "viewer" ? "profile-login" : "env-bootstrap"),
      note: existing?.note || "",
      touchLogin,
    });
  }

  function attachAccountToSession(session, account) {
    if (!session || !account) return session;
    session.user = {
      ...(session.user || {}),
      xjkAccountId: account.xjkAccountId || null,
      role: account.role,
      accountRecordId: account.id,
      permissions: publicAccount(account).permissions,
    };
    return session;
  }

  async function seedBootstrapAccounts() {
    for (const username of config.headAdminUsernames) {
      await upsertAccount({
        username,
        displayName: username,
        role: "owner",
        isActive: true,
        source: "env-bootstrap",
        note: "Head admin bootstrap.",
      });
    }
    for (const subject of config.headAdminSubjects) {
      await upsertAccount({
        subject,
        role: "owner",
        isActive: true,
        source: "env-bootstrap",
        note: "Head admin subject bootstrap.",
      });
    }
    for (const username of config.bootstrapEditorUsernames) {
      await upsertAccount({
        username,
        displayName: username,
        role: "editor",
        isActive: true,
        source: "env-bootstrap",
        note: "Editor bootstrap.",
      });
    }
    for (const subject of config.bootstrapEditorSubjects) {
      await upsertAccount({
        subject,
        role: "editor",
        isActive: true,
        source: "env-bootstrap",
        note: "Editor subject bootstrap.",
      });
    }
  }

  return {
    accounts,
    findAccountById,
    findAccountByIdentity,
    persistAccounts,
    readPersistedAccounts,
    upsertAccount,
    bootstrapRoleForProfile,
    ensureAccountForProfile,
    attachAccountToSession,
    seedBootstrapAccounts,
  };
}
