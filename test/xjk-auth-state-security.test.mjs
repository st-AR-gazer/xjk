import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserBoundOauthStateStore,
  buildOauthNonceCookie,
  oauthLoginClientKey,
} from "../services/shared/xjk-auth/oauth-state-policy.js";

test("OAuth state can only be consumed by the browser holding its nonce", () => {
  const states = new BrowserBoundOauthStateStore();
  const issued = states.issue({
    clientKey: "198.51.100.10",
    record: { returnTo: "https://validifier.xjk.yt/records/example" },
  });

  assert.equal(issued.ok, true);
  assert.equal(states.consume(issued.state, "attacker-browser-nonce"), null);
  assert.equal(states.size, 1, "a mismatched browser must not consume the legitimate login flow");
  assert.equal(
    states.consume(issued.state, issued.browserNonce)?.returnTo,
    "https://validifier.xjk.yt/records/example"
  );
  assert.equal(states.consume(issued.state, issued.browserNonce), null, "OAuth state remains single use");
});

test("OAuth state storage is capped and expired records are reclaimed", () => {
  let nowMs = 10_000;
  const states = new BrowserBoundOauthStateStore({
    ttlMs: 1_000,
    maxStates: 2,
    loginRateLimitMax: 10,
    now: () => nowMs,
  });

  assert.equal(states.issue({ clientKey: "client-a" }).ok, true);
  assert.equal(states.issue({ clientKey: "client-b" }).ok, true);
  assert.deepEqual(states.issue({ clientKey: "client-c" }), {
    ok: false,
    reason: "capacity",
    retryAfterSeconds: 1,
  });
  assert.equal(states.size, 2);

  nowMs += 1_001;
  assert.equal(states.issue({ clientKey: "client-c" }).ok, true);
  assert.equal(states.size, 1);
});

test("OAuth login creation is rate limited per client with a bounded retry window", () => {
  let nowMs = 20_000;
  const states = new BrowserBoundOauthStateStore({
    maxStates: 10,
    loginRateLimitMax: 2,
    loginRateLimitWindowMs: 5_000,
    now: () => nowMs,
  });

  assert.equal(states.issue({ clientKey: "198.51.100.20" }).ok, true);
  assert.equal(states.issue({ clientKey: "198.51.100.20" }).ok, true);
  const limited = states.issue({ clientKey: "198.51.100.20" });
  assert.equal(limited.ok, false);
  assert.equal(limited.reason, "rate_limited");
  assert.equal(limited.retryAfterSeconds, 5);
  assert.equal(states.size, 2, "a limited request must not allocate OAuth state");

  nowMs += 5_001;
  assert.equal(states.issue({ clientKey: "198.51.100.20" }).ok, true);
});

test("OAuth nonce cookies are host-only, HttpOnly, SameSite, scoped, and secure on HTTPS", () => {
  const request = {
    headers: {
      "x-forwarded-for": "203.0.113.7, 127.0.0.1",
      "x-forwarded-proto": "https",
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const cookie = buildOauthNonceCookie(request, {
    cookieName: "oauth_nonce",
    nonce: "browser-secret",
    maxAgeSeconds: 600,
    callbackPath: "/auth/ubisoft/callback",
  });

  assert.equal(oauthLoginClientKey(request), "203.0.113.7");
  assert.match(cookie, /^oauth_nonce=browser-secret;/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /Path=\/auth\/ubisoft/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/i, "the browser-binding nonce must remain host-only");
});
