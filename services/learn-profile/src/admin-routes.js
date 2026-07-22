import fsp from "node:fs/promises";
import path from "node:path";

import { normalizeRole, publicAccount } from "./access-control.js";
import { normalizeSlug } from "./learn-data.js";

export function createAdminRoutes({
  accounts,
  auth,
  content,
  files,
  httpSupport,
  identity,
  sharedAuthStore = null,
} = {}) {
  const { readBody, sendJson } = httpSupport;

  async function handleAdminSuggestions(req, res) {
    const actor = await auth.requirePermission(req, res, "adminRead");
    if (!actor) return;
    const suggestions = await files.readJsonLines(files.paths.suggestionsFile, { limit: 200, reverse: true });
    return sendJson(res, 200, { ok: true, suggestions });
  }

  async function handleAdminSession(req, res) {
    const actor = await auth.getActor(req);
    return sendJson(res, 200, {
      ok: true,
      configured: identity.oauthConfigured(),
      authenticated: Boolean(actor.entry),
      loginUrl: identity.oauthConfigured()
        ? sharedAuthStore
          ? identity.buildSharedLoginUrl(req, identity.buildLearnPublicUrl(req, "/#/admin"))
          : "/auth/ubisoft/login?return_to=%2F%23%2Fadmin"
        : null,
      account: actor.publicAccount,
      session: actor.entry ? identity.publicSession(actor.entry.session) : null,
      roles: ["owner", "admin", "editor", "viewer"],
    });
  }

  async function handleAdminAccounts(req, res) {
    const actor = await auth.requirePermission(req, res, "roleManage");
    if (!actor) return;
    return sendJson(res, 200, {
      ok: true,
      accounts: accounts.accounts
        .map(publicAccount)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    });
  }

  async function handleAdminAccountSave(req, res) {
    const actor = await auth.requirePermission(req, res, "roleManage");
    if (!actor) return;
    let body = {};
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { ok: false, error: "Expected a JSON account payload." });
    }

    const targetRole = normalizeRole(body.role, "viewer");
    const target = body.id ? accounts.findAccountById(body.id) : null;
    if (target?.role === "owner" && actor.account.role !== "owner") {
      return sendJson(res, 403, { ok: false, error: "Only the owner can modify owner accounts." });
    }
    if (targetRole === "owner" && actor.account.role !== "owner") {
      return sendJson(res, 403, { ok: false, error: "Only the owner can assign owner role." });
    }

    try {
      let account = target;
      if (account) {
        account.subject = String(body.subject || account.subject || "").trim() || null;
        account.username = String(body.username || account.username || "").trim() || null;
        account.displayName = String(body.displayName || account.displayName || "").trim() || null;
        account.accountId = String(body.accountId || account.accountId || "").trim() || null;
        account.role = targetRole;
        account.isActive = body.isActive !== false;
        account.note = String(body.note || "").trim();
        account.source = account.source || "manual";
        account.updatedAt = new Date().toISOString();
        await accounts.persistAccounts();
      } else {
        account = await accounts.upsertAccount({
          subject: body.subject || "",
          username: body.username || "",
          displayName: body.displayName || body.username || "",
          accountId: body.accountId || "",
          role: targetRole,
          isActive: body.isActive !== false,
          source: "manual",
          note: body.note || "",
        });
      }
      await files.auditAdmin(actor.account, "account.save", {
        accountId: account.id,
        username: account.username,
        role: account.role,
        isActive: account.isActive,
      });
      return sendJson(res, 200, { ok: true, account: publicAccount(account) });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || "Could not save account." });
    }
  }

  async function handleAdminContentList(req, res) {
    const actor = await auth.requirePermission(req, res, "contentEdit");
    if (!actor) return;
    const { pages } = await content.listContentPages();
    return sendJson(res, 200, { ok: true, pages });
  }

  async function handleAdminContentGet(req, res, url) {
    const actor = await auth.requirePermission(req, res, "contentEdit");
    if (!actor) return;
    try {
      const slug = normalizeSlug(url.searchParams.get("slug"));
      const manifest = await content.readManifest();
      const page = manifest.pages.find((item) => item.slug === slug || item.id === slug);
      if (!page) return sendJson(res, 404, { ok: false, error: "Learn page not found in manifest." });
      const filePath = content.markdownPathForPage(page, slug);
      const markdown = await fsp.readFile(filePath, "utf8");
      return sendJson(res, 200, { ok: true, page, markdown });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || "Could not load markdown." });
    }
  }

  async function handleAdminContentSave(req, res) {
    const actor = await auth.requirePermission(req, res, "contentEdit");
    if (!actor) return;
    let body = {};
    try {
      body = JSON.parse(await readBody(req, 2 * 1024 * 1024));
    } catch {
      return sendJson(res, 400, { ok: false, error: "Expected a JSON markdown payload." });
    }
    try {
      const slug = normalizeSlug(body.slug);
      const markdown = String(body.markdown || "");
      const manifest = await content.readManifest();
      const index = manifest.pages.findIndex((item) => item.slug === slug || item.id === slug);
      if (index < 0) return sendJson(res, 404, { ok: false, error: "Learn page not found in manifest." });
      const nextPage = content.pageFromBody({ ...body.metadata, slug }, manifest.pages[index]);
      const filePath = content.markdownPathForPage(nextPage, slug);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await content.backupMarkdownFile(filePath, slug);
      await fsp.writeFile(filePath, markdown);
      manifest.pages[index] = nextPage;
      await content.writeManifest(manifest);
      await files.auditAdmin(actor.account, "content.save", { slug, reason: body.reason || "" });
      return sendJson(res, 200, { ok: true, page: nextPage, markdown });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || "Could not save markdown." });
    }
  }

  async function handleAdminContentCreate(req, res) {
    const actor = await auth.requirePermission(req, res, "contentCreate");
    if (!actor) return;
    let body = {};
    try {
      body = JSON.parse(await readBody(req, 2 * 1024 * 1024));
    } catch {
      return sendJson(res, 400, { ok: false, error: "Expected a JSON page payload." });
    }
    try {
      const manifest = await content.readManifest();
      const slug = normalizeSlug(body.slug);
      if (manifest.pages.some((item) => item.slug === slug || item.id === slug)) {
        return sendJson(res, 409, { ok: false, error: "A Learn page with this slug already exists." });
      }
      const page = content.pageFromBody({ ...body, slug }, null);
      const markdown = String(body.markdown || content.defaultMarkdownForPage(page));
      const filePath = content.markdownPathForPage(page, slug);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, markdown, { flag: "wx" });
      manifest.pages.push(page);
      await content.writeManifest(manifest);
      await files.auditAdmin(actor.account, "content.create", { slug });
      return sendJson(res, 201, { ok: true, page, markdown });
    } catch (error) {
      const status = error?.code === "EEXIST" ? 409 : 400;
      return sendJson(res, status, { ok: false, error: error?.message || "Could not create page." });
    }
  }

  async function handleAdminAudit(req, res) {
    const actor = await auth.requirePermission(req, res, "roleManage");
    if (!actor) return;
    try {
      const raw = await fsp.readFile(files.paths.auditFile, "utf8");
      const entries = raw
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-120)
        .map((line) => JSON.parse(line))
        .reverse();
      return sendJson(res, 200, { ok: true, entries });
    } catch {
      return sendJson(res, 200, { ok: true, entries: [] });
    }
  }

  return {
    handleAdminSuggestions,
    handleAdminSession,
    handleAdminAccounts,
    handleAdminAccountSave,
    handleAdminContentList,
    handleAdminContentGet,
    handleAdminContentSave,
    handleAdminContentCreate,
    handleAdminAudit,
  };
}
