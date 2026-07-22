import assert from "node:assert/strict";
import test from "node:test";

import { addressIsPublic, assertPublicHttpUrl, fetchPublicHttp, parsePublicHttpUrl } from "../httpEgressPolicy.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("public HTTP URL parsing rejects unsafe protocols, credentials, hosts, and encoded loopback", () => {
  assert.throws(() => parsePublicHttpUrl("file:///etc/passwd"), /protocol is not allowed/i);
  assert.throws(() => parsePublicHttpUrl("https://user:secret@example.com/"), /credentials/i);
  assert.throws(() => parsePublicHttpUrl("https://localhost/admin"), /hostname is local/i);
  assert.throws(() => parsePublicHttpUrl("http://2130706433/admin"), /non-public address|hostname/i);
  assert.throws(
    () => parsePublicHttpUrl("https://images.example.net/a.png", { allowedHosts: ["openplanet.dev"] }),
    /not allowlisted/i
  );
});

test("address classification rejects local, private, link-local, mapped, and documentation ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.1.2",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ]) {
    assert.equal(addressIsPublic(address), false, address);
  }
  assert.equal(addressIsPublic("93.184.216.34"), true);
  assert.equal(addressIsPublic("2606:4700:4700::1111"), true);
});

test("DNS validation fails closed when any resolved address is non-public", async () => {
  await assert.rejects(
    assertPublicHttpUrl("https://openplanet.dev/image.png", {
      allowedHosts: ["openplanet.dev"],
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    }),
    /non-public address/i
  );
});

test("redirect handling revalidates every destination before another request", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  };

  await assert.rejects(
    fetchPublicHttp("https://openplanet.dev/image.png", {
      allowedHosts: ["openplanet.dev"],
      fetchImpl,
      lookup: publicLookup,
    }),
    /not allowlisted|non-public/i
  );
  assert.deepEqual(requested, ["https://openplanet.dev/image.png"]);
});

test("origin allowlists reject protocol downgrades and alternate ports on the same host", async () => {
  await assert.rejects(
    assertPublicHttpUrl("http://openplanet.dev/image.png", {
      allowedOrigins: ["https://openplanet.dev"],
      lookup: publicLookup,
    }),
    /origin is not allowlisted/i
  );
  await assert.rejects(
    assertPublicHttpUrl("https://openplanet.dev:8443/image.png", {
      allowedOrigins: ["https://openplanet.dev"],
      lookup: publicLookup,
    }),
    /origin is not allowlisted/i
  );
});

test("same-host redirects remain available after public DNS validation", async () => {
  const requested = [];
  const fetchImpl = async (url, options) => {
    requested.push({ redirect: options.redirect, url });
    if (requested.length === 1) {
      return new Response(null, { status: 302, headers: { location: "/final.png" } });
    }
    return new Response("image", { status: 200, headers: { "content-type": "image/png" } });
  };

  const result = await fetchPublicHttp("https://openplanet.dev/start.png", {
    allowedHosts: ["openplanet.dev"],
    fetchImpl,
    lookup: publicLookup,
  });
  assert.equal(result.url.toString(), "https://openplanet.dev/final.png");
  assert.equal(result.response.status, 200);
  assert.deepEqual(requested, [
    { redirect: "manual", url: "https://openplanet.dev/start.png" },
    { redirect: "manual", url: "https://openplanet.dev/final.png" },
  ]);
});
