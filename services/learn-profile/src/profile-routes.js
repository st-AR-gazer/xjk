import crypto from "node:crypto";

import { safeSlugOrEmpty, sanitizeLearnData, sanitizeSettings } from "./learn-data.js";

export function createProfileRoutes({ auth, files, httpSupport, learnData } = {}) {
  const { readBody, sendJson } = httpSupport;

  async function handleProfileLearnDataGet(req, res) {
    const actor = await auth.requireLearnAccount(req, res);
    if (!actor) return;
    learnData.migrateLearnUserDataKey(actor.account);
    return sendJson(res, 200, {
      ok: true,
      account: actor.publicAccount,
      data: learnData.publicLearnData(learnData.learnUserDataKey(actor.account)),
    });
  }

  async function handleProfileLearnDataPut(req, res) {
    const actor = await auth.requireLearnAccount(req, res);
    if (!actor) return;
    learnData.migrateLearnUserDataKey(actor.account);
    let body = {};
    try {
      body = JSON.parse((await readBody(req, 512 * 1024)) || "{}");
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || "Invalid JSON body." });
    }
    const accountKey = learnData.learnUserDataKey(actor.account);
    const current = learnData.publicLearnData(accountKey);
    const raw = body.data && typeof body.data === "object" ? body.data : body;
    const nextRaw = { ...current };
    if (Object.prototype.hasOwnProperty.call(raw, "bookmarks")) nextRaw.bookmarks = raw.bookmarks;
    if (Object.prototype.hasOwnProperty.call(raw, "completed")) nextRaw.completed = raw.completed;
    if (Object.prototype.hasOwnProperty.call(raw, "recent")) nextRaw.recent = raw.recent;
    if (Object.prototype.hasOwnProperty.call(raw, "settings")) {
      nextRaw.settings = { ...current.settings, ...sanitizeSettings(raw.settings) };
    }
    if (Object.prototype.hasOwnProperty.call(raw, "notes")) nextRaw.notes = raw.notes;
    const next = sanitizeLearnData(nextRaw);
    learnData.userData.set(accountKey, next);
    await learnData.persistUserData();
    return sendJson(res, 200, {
      ok: true,
      account: actor.publicAccount,
      data: next,
    });
  }

  async function handleProfileSuggestionCreate(req, res) {
    const actor = await auth.requireLearnAccount(req, res);
    if (!actor) return;
    let body = {};
    try {
      body = JSON.parse((await readBody(req, 128 * 1024)) || "{}");
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error?.message || "Invalid JSON body." });
    }
    const slug = safeSlugOrEmpty(body.slug);
    const text = String(body.text || body.body || "")
      .trim()
      .slice(0, 12000);
    if (!slug) return sendJson(res, 400, { ok: false, error: "A valid lesson slug is required." });
    if (text.length < 8) return sendJson(res, 400, { ok: false, error: "Suggestion text is too short." });
    const suggestion = {
      id: crypto.randomUUID?.() || crypto.randomBytes(12).toString("hex"),
      createdAt: new Date().toISOString(),
      status: "open",
      slug,
      title: String(body.title || "")
        .trim()
        .slice(0, 200),
      text,
      context: String(body.context || "")
        .trim()
        .slice(0, 2000),
      account: actor.publicAccount,
    };
    await files.appendJsonLine(files.paths.suggestionsFile, suggestion);
    return sendJson(res, 201, { ok: true, suggestion });
  }

  return { handleProfileLearnDataGet, handleProfileLearnDataPut, handleProfileSuggestionCreate };
}
