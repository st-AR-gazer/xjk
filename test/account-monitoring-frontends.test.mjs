import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createProfileFeature,
  nicknameKeyForUser,
  sanitizeNickname,
} from "../sites/account.xjk.yt/frontend/account/profile.js";
import { createMonitoringTransport } from "../sites/altered.xjk.yt/frontend/admin/monitoring/modules/transport.js";
import { escapeHtml } from "../sites/shared/xjk-core/dom-utils.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("account profile persistence normalizes identity keys and nicknames", () => {
  const user = {
    xjkAccountId: "xjk-42",
    ubisoftAccountId: "ubi-fallback",
    username: "driver",
  };
  const storage = createStorage({
    "xjk.account.profileImage": "data:image/png;base64,AAAA",
    "xjk.account.nicknames": JSON.stringify({ "xjk-42": "Stored name" }),
  });
  const state = { editingNickname: false, nicknames: {}, profileImage: "" };
  const profile = createProfileFeature({
    state,
    elements: {},
    currentUser: () => user,
    isAuthenticated: () => true,
    render() {},
    storage,
  });

  profile.loadPersistedProfile();
  assert.equal(state.profileImage, "data:image/png;base64,AAAA");
  assert.equal(profile.nicknameForUser(user), "Stored name");
  assert.equal(nicknameKeyForUser(user), "xjk-42");
  assert.equal(sanitizeNickname(" \u0000 Driver \n Name "), "Driver Name");

  profile.setNicknameForUser(user, "  New\tname  ");
  assert.deepEqual(JSON.parse(storage.getItem("xjk.account.nicknames")), { "xjk-42": "Newname" });

  profile.setNicknameForUser(user, "");
  assert.deepEqual(JSON.parse(storage.getItem("xjk.account.nicknames")), {});
});

test("monitoring transport preserves local-path routing and JSON requests", async () => {
  const calls = [];
  const transport = createMonitoringTransport({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        },
      };
    },
    location: { href: "" },
    resolveUrl: (value) => `/altered${value}`,
  });

  assert.deepEqual(await transport.api("/api/v1/admin/example", { method: "POST", body: { enabled: true } }), {
    ok: true,
  });
  assert.deepEqual(calls, [
    {
      url: "/altered/api/v1/admin/example",
      options: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      },
    },
  ]);
});

test("monitoring transport redirects unauthorized sessions through the active route resolver", async () => {
  const location = { href: "" };
  const transport = createMonitoringTransport({
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() {
        return { loginUrl: "/auth/login" };
      },
    }),
    location,
    resolveUrl: (value) => `/altered${value}`,
  });

  await assert.rejects(() => transport.api("/api/v1/admin/auth/status"), /Unauthorized/);
  assert.equal(location.href, "/altered/auth/login");
});

test("the extracted entry modules retain their controller contracts", () => {
  const accountEntry = fs.readFileSync(path.join(repoRoot, "sites/account.xjk.yt/frontend/app.js"), "utf8");
  const monitoringEntry = fs.readFileSync(
    path.join(repoRoot, "sites/altered.xjk.yt/frontend/admin/monitoring/monitoring.js"),
    "utf8"
  );
  const accountController = fs.readFileSync(
    path.join(repoRoot, "sites/account.xjk.yt/frontend/account/controller.js"),
    "utf8"
  );
  const monitoringContext = fs.readFileSync(
    path.join(repoRoot, "sites/altered.xjk.yt/frontend/admin/monitoring/modules/context.js"),
    "utf8"
  );

  assert.match(accountEntry, /import \{ createAccountApp \} from "\.\/account\/controller\.js"/);
  assert.match(accountEntry, /createAccountApp\(\)\.boot\(\)/);
  assert.match(monitoringEntry, /import \{ createMonitoringApp \} from "\.\/modules\/controller\.js"/);
  assert.match(monitoringEntry, /createMonitoringApp\(\)\.boot\(\)/);
  for (const moduleName of ["appearance", "context", "profile", "spaces"]) {
    assert.match(accountController, new RegExp(`from "\\./${moduleName}\\.js"`));
  }
  assert.match(monitoringContext, /import \{ escapeHtml \} from "\/shared\/xjk-core\/dom-utils\.js"/);
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">&'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;");
});
