import assert from "node:assert/strict";
import test from "node:test";

import { buildAbsoluteUrl, normalizeOriginRelativePath, normalizeReturnTo } from "../services/shared/xjkAuth.js";
import {
  buildXjkOauthReturnHosts,
  canonicalXjkOauthReturnHosts,
} from "../services/shared/xjk-auth/oauth-return-hosts.js";
import { XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";

const options = {
  fallback: "/account/",
  publicOrigin: "https://xjk.yt",
};

test("normalizeReturnTo keeps origin-relative application paths", () => {
  assert.equal(
    normalizeReturnTo("/learn/?view=profile#identity", options),
    "https://xjk.yt/learn/?view=profile#identity"
  );
  assert.equal(normalizeReturnTo("#profile", options), "https://xjk.yt/#profile");
});

test("normalizeReturnTo rejects network-path and backslash redirects", () => {
  for (const candidate of [
    "//evil.example/collect",
    "///evil.example/collect",
    "/\\evil.example/collect",
    "//\\evil.example/collect",
    "/account/\\evil.example",
  ]) {
    assert.equal(normalizeReturnTo(candidate, options), "https://xjk.yt/account/", candidate);
  }
});

test("normalizeReturnTo rejects untrusted absolute origins", () => {
  assert.equal(normalizeReturnTo("https://evil.example/collect", options), "https://xjk.yt/account/");
  assert.equal(normalizeReturnTo("javascript:alert(1)", options), "https://xjk.yt/account/");
  assert.equal(normalizeReturnTo("", { ...options, fallback: "//evil.example/collect" }), "https://xjk.yt/");
});

test("normalizeReturnTo accepts only explicitly trusted absolute hosts", () => {
  const strictOptions = {
    ...options,
    allowedHosts: ["xjk.yt", "learn.xjk.yt", "learn.localhost"],
    localOrigin: "http://localhost:8080",
  };

  assert.equal(normalizeReturnTo("https://learn.xjk.yt/library", strictOptions), "https://learn.xjk.yt/library");
  assert.equal(normalizeReturnTo("https://forgotten.xjk.yt/collect", strictOptions), "https://xjk.yt/account/");
  assert.equal(normalizeReturnTo("http://evil.localhost:8080/collect", strictOptions), "https://xjk.yt/account/");
  assert.equal(
    normalizeReturnTo("http://learn.localhost:8080/library", strictOptions),
    "http://localhost:8080/learn/library"
  );
});

test("origin-relative URL helpers cannot be promoted to another host", () => {
  const request = { headers: { host: "xjk.yt" }, socket: { encrypted: true } };

  assert.equal(normalizeOriginRelativePath("https://evil.example/learn?q=1#x"), "/learn?q=1#x");
  assert.equal(normalizeOriginRelativePath("//evil.example/collect", "/account/"), "/account/");
  assert.equal(normalizeOriginRelativePath("/\\evil.example/collect", "/account/"), "/account/");
  assert.equal(
    buildAbsoluteUrl(request, "//evil.example/collect", { publicOrigin: "https://xjk.yt" }),
    "https://xjk.yt/"
  );
});

test("OAuth return hosts are derived from every canonical public platform host", () => {
  const allowedHosts = new Set(canonicalXjkOauthReturnHosts());
  const publicHosts = XJK_SITES.filter((site) => site.public).flatMap((site) => [
    site.host,
    ...(site.hostAliases || []),
  ]);

  for (const host of publicHosts) {
    assert.ok(allowedHosts.has(host), `${host} must be accepted by the canonical OAuth return policy`);
    assert.equal(
      normalizeReturnTo(`https://${host}/oauth-return`, { ...options, allowedHosts: [...allowedHosts] }),
      `https://${host}/oauth-return`
    );
  }

  assert.ok(allowedHosts.has("validifier.xjk.yt"));
  assert.ok(allowedHosts.has("cotd.xjk.yt"));
  assert.ok(buildXjkOauthReturnHosts(["preview.example.test"]).includes("preview.example.test"));
});

test("canonical local OAuth hosts map to the shared path-mode gateway", () => {
  const allowedHosts = canonicalXjkOauthReturnHosts();
  assert.equal(
    normalizeReturnTo("http://validifier.localhost:8080/records/example", {
      ...options,
      allowedHosts,
      localOrigin: "http://localhost:8080",
    }),
    "http://localhost:8080/validifier/records/example"
  );
  assert.equal(
    normalizeReturnTo("http://cotd.localhost:8080/history", {
      ...options,
      allowedHosts,
      localOrigin: "http://localhost:8080",
    }),
    "http://localhost:8080/cotd/history"
  );
});
