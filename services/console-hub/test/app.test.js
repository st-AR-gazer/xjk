import assert from "node:assert/strict";
import test from "node:test";

import { createConsoleHubApp } from "../src/app.js";
import { loadConsoleHubConfig } from "../src/config.js";

test("the composed app starts in isolation and serves its public HTTP boundary", async () => {
  const config = loadConsoleHubConfig({ env: {}, loadEnv: false });
  Object.assign(config, {
    dataDir: null,
    dbFile: ":memory:",
    port: 0,
    sharedAuthEnabled: false,
  });
  const app = await createConsoleHubApp({
    config,
    logger: { log() {}, warn() {} },
  });

  try {
    await app.start({ listen: true, connectDirectory: false, background: false });
    const address = app.server.address();
    assert.equal(typeof address, "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${origin}/bingo/health`);
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.ok, true);
    assert.equal(health.service, "xjk-console-hub");

    const sessionResponse = await fetch(`${origin}/bingo/api/v1/session`);
    const session = await sessionResponse.json();
    assert.equal(sessionResponse.status, 200);
    assert.equal(session.session, null);

    const protectedResponse = await fetch(`${origin}/bingo/api/v1/matches/demo/leave`, {
      method: "POST",
    });
    assert.equal(protectedResponse.status, 401);

    const now = Date.now();
    app.db
      .prepare(
        `INSERT INTO bingo_oauth_sessions (
          session_token, account_id, subject, display_name, access_token, oauth_expires_at,
          created_at, expires_at, is_operator
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "test-session",
        "00000000-0000-0000-0000-000000000001",
        "subject",
        "Driver",
        "access-token",
        now + 60 * 60 * 1000,
        now,
        now + 60 * 60 * 1000,
        0
      );
    const sessionCookie = `${config.sessionCookieName}=test-session`;
    const authenticatedResponse = await fetch(`${origin}/bingo/api/v1/session`, {
      headers: { cookie: sessionCookie },
    });
    const authenticatedBody = await authenticatedResponse.text();
    const authenticated = JSON.parse(authenticatedBody);
    assert.equal(authenticated.session.user.accountId, "00000000-0000-0000-0000-000000000001");
    assert.equal("token" in authenticated.session, false);
    assert.doesNotMatch(authenticatedBody, /test-session|access-token/);

    const eventResponse = { chunks: [], headers: null, status: null };
    let closeEventStream;
    await app.services.routes.handleMatchEvents(
      {
        headers: { cookie: sessionCookie },
        on(event, handler) {
          if (event === "close") closeEventStream = handler;
        },
      },
      {
        writeHead(status, headers) {
          eventResponse.status = status;
          eventResponse.headers = headers;
        },
        write(chunk) {
          eventResponse.chunks.push(chunk);
        },
      },
      "room:demo"
    );
    assert.equal(eventResponse.status, 200);
    assert.match(eventResponse.headers["content-type"], /^text\/event-stream/);
    assert.match(eventResponse.chunks.join(""), /"eventScope":"room:demo"/);
    closeEventStream();

    const missingResponse = await fetch(`${origin}/bingo/missing`);
    assert.equal(missingResponse.status, 404);

    const tables = app.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'bingo_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.deepEqual(tables, [
      "bingo_claim_checks",
      "bingo_match_bindings",
      "bingo_match_state_mirror",
      "bingo_oauth_sessions",
      "bingo_player_bindings",
      "bingo_room_bindings",
      "bingo_settings",
      "bingo_users",
    ]);

    const connection = app.services.roomRuntime.getOrCreatePlayerConnection({
      session_token: "shutdown-regression",
      account_id: "00000000-0000-0000-0000-000000000001",
      display_name: "Driver",
    });
    assert.equal(typeof connection.close, "function");
  } finally {
    await app.stop();
  }
});

test("the public session DTO never serializes shared session or OAuth bearer tokens", async () => {
  const now = Date.now();
  const secrets = {
    session: "shared-session-secret",
    access: "shared-access-secret",
    refresh: "shared-refresh-secret",
    id: "shared-id-token-secret",
  };
  const sharedRow = {
    session_token: secrets.session,
    xjk_account_id: "10000000-0000-0000-0000-000000000001",
    account_id: "20000000-0000-0000-0000-000000000002",
    provider_account_id: "20000000-0000-0000-0000-000000000002",
    subject: "shared-subject",
    provider_subject: "shared-subject",
    display_name: "Shared Driver",
    account_display_name: "Shared Driver",
    access_token: secrets.access,
    refresh_token: secrets.refresh,
    token_type: "Bearer",
    id_token: secrets.id,
    scope: "clubs",
    oauth_expires_at: now + 60 * 60 * 1000,
    expires_at: now + 24 * 60 * 60 * 1000,
  };
  const sharedAuthStore = {
    resolveSessionFromRequest(req) {
      const cookie = String(req?.headers?.cookie || "");
      return cookie.includes(secrets.session) ? { token: secrets.session, row: sharedRow } : null;
    },
  };
  const config = loadConsoleHubConfig({ env: {}, loadEnv: false });
  Object.assign(config, {
    dataDir: null,
    dbFile: ":memory:",
    port: 0,
    sharedAuthEnabled: true,
  });
  const app = await createConsoleHubApp({
    config,
    sharedAuthStore,
    logger: { log() {}, warn() {} },
  });

  try {
    await app.start({ listen: true, connectDirectory: false, background: false });
    const address = app.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/bingo/api/v1/session`, {
      headers: { cookie: `${config.sharedAuthSessionCookieName}=${secrets.session}` },
    });
    const responseBody = await response.text();
    const payload = JSON.parse(responseBody);

    assert.equal(response.status, 200);
    assert.equal(payload.session.user.accountId, sharedRow.account_id);
    assert.equal("token" in payload.session, false);
    for (const secret of Object.values(secrets)) {
      assert.equal(responseBody.includes(secret), false, `session response leaked ${secret}`);
    }
  } finally {
    await app.stop();
  }
});
