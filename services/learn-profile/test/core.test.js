import assert from "node:assert/strict";
import test from "node:test";

import { permissionsForRole, roleRank } from "../src/access-control.js";
import { createAuthService } from "../src/auth-service.js";
import { loadLearnProfileConfig } from "../src/config.js";
import { normalizeSlug, sanitizeLearnData } from "../src/learn-data.js";
import { createSessionStore } from "../src/session-store.js";

test("configuration preserves Learn environment aliases and bounds", () => {
  const config = loadLearnProfileConfig({
    env: {
      PORT: "3136",
      LEARN_UBI_OAUTH_ENABLED: "1",
      LEARN_SESSION_TTL_SECONDS: "1800",
      LEARN_HEAD_ADMIN_USERNAMES: "Alice, Bob",
      LEARN_SHARED_AUTH_ENABLED: "0",
    },
    loadEnv: false,
  });

  assert.equal(config.port, 3136);
  assert.equal(config.oauthEnabled, true);
  assert.equal(config.sessionTtlSeconds, 1800);
  assert.deepEqual(config.headAdminUsernames, ["Alice", "Bob"]);
  assert.equal(config.sharedAuthEnabled, false);
});

test("role permissions remain monotonic", () => {
  assert.equal(roleRank("viewer"), 0);
  assert.equal(roleRank("editor"), 1);
  assert.equal(roleRank("admin"), 2);
  assert.equal(roleRank("owner"), 3);
  assert.deepEqual(permissionsForRole("editor"), {
    adminRead: true,
    contentEdit: true,
    contentCreate: true,
    roleManage: false,
    ownerManage: false,
  });
  assert.equal(permissionsForRole("owner").ownerManage, true);
});

test("Learn data normalization rejects unsafe slugs and unsupported settings", () => {
  assert.equal(normalizeSlug("/driving/air-brake/"), "driving/air-brake");
  assert.throws(() => normalizeSlug("../private"), /Slug must use/);

  const data = sanitizeLearnData({
    bookmarks: ["driving/air-brake", "driving/air-brake", "../private"],
    completed: ["basics/start"],
    recent: ["basics/start"],
    settings: { accent: "cyan", density: "unsupported", tendrilIntensity: 99 },
    notes: {
      "driving/air-brake": { text: "Brake before the apex.", updatedAt: "2026-01-01T00:00:00.000Z" },
      "../private": "discarded",
    },
  });

  assert.deepEqual(data.bookmarks, ["driving/air-brake"]);
  assert.deepEqual(data.settings, { accent: "cyan", tendrilIntensity: 2.4 });
  assert.deepEqual(data.notes, {
    "driving/air-brake": { text: "Brake before the apex.", updatedAt: "2026-01-01T00:00:00.000Z" },
  });
});

test("OAuth JSON requests preserve the most specific upstream error", async () => {
  const auth = createAuthService({
    accounts: {},
    config: { requestTimeoutMs: 1_000 },
    fetchImpl: async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ error_description: "Invalid authorization code." }),
    }),
    httpSupport: {},
    identity: {},
    learnData: {},
    sessions: {},
  });

  await assert.rejects(auth.requestJson("https://example.test/token"), (error) => {
    assert.equal(error.message, "Invalid authorization code.");
    assert.equal(error.statusCode, 422);
    return true;
  });
});

test("shared XJK sessions retain the Learn profile session contract", () => {
  const row = {
    xjk_account_id: "xjk-account",
    account_id: "nadeo-account",
    subject: "subject",
    display_name: "Driver",
    username: "driver",
    access_token: "access",
    refresh_token: "refresh",
    token_type: "Bearer",
    scope: "clubs",
    oauth_expires_at: 2_000,
    session_created_at: 1_000,
    expires_at: 3_000,
  };
  const sessions = createSessionStore({
    config: { scope: "clubs" },
    files: {},
    identity: {},
    sharedAuthStore: {
      resolveSessionFromRequest() {
        return { token: "shared-token", row };
      },
    },
  });

  assert.deepEqual(sessions.getSession({}), {
    token: "shared-token",
    row,
    session: {
      user: {
        provider: "xjk-auth",
        xjkAccountId: "xjk-account",
        accountId: "nadeo-account",
        subject: "subject",
        displayName: "Driver",
        username: "driver",
      },
      oauth: {
        accessToken: "access",
        refreshToken: "refresh",
        tokenType: "Bearer",
        idToken: "",
        scope: "clubs",
        expiresAt: 2_000,
      },
      createdAt: 1_000,
      expiresAt: 3_000,
    },
  });
});
