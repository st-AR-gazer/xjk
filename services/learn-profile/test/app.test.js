import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLearnProfileApp } from "../src/app.js";
import { loadLearnProfileConfig } from "../src/config.js";

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(serviceDir, ".runtime");

async function createFixture() {
  await fsp.mkdir(runtimeRoot, { recursive: true });
  const root = await fsp.mkdtemp(path.join(runtimeRoot, "test-"));
  const frontendDir = path.join(root, "frontend");
  const sharedDir = path.join(root, "shared");
  const contentDir = path.join(frontendDir, "content");
  const dataDir = path.join(root, "data");
  await Promise.all([
    fsp.mkdir(contentDir, { recursive: true }),
    fsp.mkdir(sharedDir, { recursive: true }),
    fsp.mkdir(dataDir, { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(frontendDir, "index.html"), "<main>Learn fixture</main>"),
    fsp.writeFile(path.join(sharedDir, "shared.js"), "export const shared = true;"),
    fsp.writeFile(path.join(contentDir, "driving__start.md"), "# Start\n"),
    fsp.writeFile(
      path.join(contentDir, "index.json"),
      JSON.stringify({
        pages: [
          {
            id: "driving/start",
            slug: "driving/start",
            title: "Start",
            markdown: "/content/driving__start.md",
          },
        ],
        clusters: [],
      })
    ),
  ]);
  const config = loadLearnProfileConfig({
    env: {
      LEARN_HEAD_ADMIN_USERNAMES: "Driver",
      LEARN_SHARED_AUTH_ENABLED: "0",
    },
    loadEnv: false,
  });
  Object.assign(config, { contentDir, dataDir, frontendDir, port: 0, sharedAuthEnabled: false, sharedDir });
  return { config, root };
}

async function removeFixture(root) {
  const resolved = path.resolve(root);
  if (!resolved.startsWith(`${path.resolve(runtimeRoot)}${path.sep}`)) throw new Error("Unsafe test cleanup path.");
  await fsp.rm(resolved, { force: true, recursive: true });
}

test("the isolated app preserves public, profile, suggestion, admin, and static contracts", async () => {
  const fixture = await createFixture();
  const logs = [];
  const logger = {
    error(...values) {
      logs.push(["error", ...values]);
    },
    log() {},
    warn(...values) {
      logs.push(["warn", ...values]);
    },
  };
  const app = await createLearnProfileApp({ config: fixture.config, logger });

  try {
    await app.start({ background: false });
    const address = app.server.address();
    assert.equal(typeof address, "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${origin}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "ok");

    const staticPage = await fetch(`${origin}/`);
    assert.equal(await staticPage.text(), "<main>Learn fixture</main>");
    const sharedAsset = await fetch(`${origin}/shared/shared.js`);
    assert.equal(await sharedAsset.text(), "export const shared = true;");
    assert.equal((await fetch(`${origin}/shared/missing.js`)).status, 404);

    const anonymousStatus = await (await fetch(`${origin}/api/v1/profile/auth/status`)).json();
    assert.equal(anonymousStatus.authenticated, false);
    assert.equal(anonymousStatus.config.sessionCookieName, "learn_profile_session");
    assert.equal((await fetch(`${origin}/api/v1/profile/me`)).status, 401);
    assert.equal((await fetch(`${origin}/api/v1/admin/accounts`)).status, 401);
    assert.equal((await fetch(`${origin}/auth/ubisoft/callback`)).status, 400);
    assert.equal((await fetch(`${origin}/api/v1/profile/auth/status`, { method: "DELETE" })).status, 405);

    const now = Date.now();
    const owner = app.services.accounts.accounts.find((account) => account.username === "Driver");
    app.services.sessions.sessions.set("test-session", {
      user: {
        provider: "nadeo-profile",
        accountId: "account-id",
        subject: "subject",
        displayName: "Driver",
        username: "Driver",
        role: owner.role,
        accountRecordId: owner.id,
      },
      oauth: { accessToken: "", expiresAt: now + 60 * 60 * 1000 },
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000,
    });
    const headers = { cookie: "learn_profile_session=test-session" };

    const profile = await (await fetch(`${origin}/api/v1/profile/me`, { headers })).json();
    assert.equal(profile.profile.role, "owner");
    const initialData = await (await fetch(`${origin}/api/v1/profile/learn-data`, { headers })).json();
    assert.deepEqual(initialData.data.bookmarks, []);

    const updatedDataResponse = await fetch(`${origin}/api/v1/profile/learn-data`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        bookmarks: ["driving/start", "../private"],
        settings: { accent: "teal", density: "compact" },
      }),
    });
    const updatedData = await updatedDataResponse.json();
    assert.equal(updatedDataResponse.status, 200);
    assert.deepEqual(updatedData.data.bookmarks, ["driving/start"]);
    assert.deepEqual(updatedData.data.settings, { accent: "teal", density: "compact" });

    const suggestionResponse = await fetch(`${origin}/api/v1/profile/suggestions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ slug: "driving/start", text: "Clarify the opening paragraph." }),
    });
    assert.equal(suggestionResponse.status, 201);
    const suggestions = await (await fetch(`${origin}/api/v1/admin/suggestions`, { headers })).json();
    assert.equal(suggestions.suggestions[0].slug, "driving/start");

    const adminSession = await (await fetch(`${origin}/api/v1/admin/session`, { headers })).json();
    assert.equal(adminSession.account.role, "owner");
    const adminAccounts = await (await fetch(`${origin}/api/v1/admin/accounts`, { headers })).json();
    assert.equal(adminAccounts.accounts[0].username, "Driver");
    const contentList = await (await fetch(`${origin}/api/v1/admin/content`, { headers })).json();
    assert.equal(contentList.pages[0].slug, "driving/start");

    const contentPage = await (
      await fetch(`${origin}/api/v1/admin/content/page?slug=driving%2Fstart`, { headers })
    ).json();
    assert.equal(contentPage.markdown, "# Start\n");

    const saveResponse = await fetch(`${origin}/api/v1/admin/content/page`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ slug: "driving/start", markdown: "# Updated\n", metadata: { summary: "Updated" } }),
    });
    assert.equal(saveResponse.status, 200);
    const createResponse = await fetch(`${origin}/api/v1/admin/content/page`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ slug: "driving/new-lesson", title: "New lesson" }),
    });
    assert.equal(createResponse.status, 201);

    const audit = await (await fetch(`${origin}/api/v1/admin/audit`, { headers })).json();
    assert.deepEqual(
      audit.entries.map((entry) => entry.action),
      ["content.create", "content.save"]
    );
    assert.deepEqual(logs, []);

    await app.stop();
    const restarted = await createLearnProfileApp({ config: fixture.config, logger });
    try {
      assert.equal(restarted.services.accounts.accounts.length, 1);
      assert.equal(restarted.services.accounts.accounts[0].role, "owner");
      assert.equal(restarted.services.sessions.sessions.has("test-session"), true);
      const accountKey = restarted.services.learnData.learnUserDataKey(restarted.services.accounts.accounts[0]);
      assert.deepEqual(restarted.services.learnData.publicLearnData(accountKey).bookmarks, ["driving/start"]);
    } finally {
      await restarted.stop();
    }
  } finally {
    await app.stop();
    await removeFixture(fixture.root);
  }
});
