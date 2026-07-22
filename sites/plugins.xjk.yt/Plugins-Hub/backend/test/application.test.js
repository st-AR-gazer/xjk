import assert from "node:assert/strict";
import test from "node:test";

import * as serverEntry from "../server.js";
import { loadPluginHubConfig } from "../src/config.js";
import { createOpenplanetClient } from "../src/openplanet-client.js";
import { createImagePaletteService } from "../src/palette.js";
import { createPluginService } from "../src/plugin-service.js";
import { createPluginHubRuntime } from "../src/runtime.js";

const silentLogger = { error() {}, log() {}, warn() {} };
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function testConfig(overrides = {}) {
  return {
    ...loadPluginHubConfig({ env: {}, loadEnv: false }),
    port: 0,
    ...overrides,
  };
}

test("the import-safe server entry exposes composition without listening", () => {
  assert.equal(typeof serverEntry.main, "function");
  assert.equal(typeof serverEntry.createPluginHubRuntime, "function");
  assert.equal(typeof serverEntry.loadPluginHubConfig, "function");
});

test("the Openplanet client rejects malformed upstream HTML without inventing plugins", async () => {
  const config = testConfig();
  const client = createOpenplanetClient({
    config,
    fetchImpl: async () =>
      new Response('<html><div class="column is-4 plugin-info"><p>missing plugin link</p></div></html>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    lookup: publicLookup,
  });

  await assert.rejects(client.fetchPlugins(), /No plugins could be parsed from Openplanet profile HTML/);
});

test("the Openplanet parser drops cross-origin and local plugin images", async () => {
  const html = `
    <div class="column is-4 plugin-info">
      <a href="/plugin/safe-plugin"></a>
      <p class="plugin-title"><a href="/plugin/safe-plugin">Safe Plugin</a></p>
      <img class="plugin-image" src="http://127.0.0.1/private.png">
    </div>`;
  const client = createOpenplanetClient({
    config: testConfig(),
    fetchImpl: async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    lookup: publicLookup,
  });

  const result = await client.fetchPlugins();
  assert.equal(result.plugins[0].image, "");
});

test("the Openplanet client rejects redirects away from its fixed upstream host", async () => {
  let requests = 0;
  const client = createOpenplanetClient({
    config: testConfig(),
    fetchImpl: async () => {
      requests += 1;
      return new Response(null, { status: 302, headers: { location: "http://[::1]/private" } });
    },
    lookup: publicLookup,
  });

  await assert.rejects(client.fetchPlugins(), /not allowlisted|non-public/i);
  assert.equal(requests, 1);
});

test("the plugin service returns stale cache data after a refresh failure", async () => {
  let nowMs = Date.parse("2026-07-20T00:00:00.000Z");
  let fetchCalls = 0;
  const config = testConfig({ pluginsCacheTtlMs: 1000 });
  const openplanetClient = {
    async fetchPlugins() {
      fetchCalls += 1;
      if (fetchCalls > 1) throw new Error("upstream unavailable");
      return { plugins: [{ id: "example", image: "" }], pageCount: 2 };
    },
  };
  const service = createPluginService({
    config,
    openplanetClient,
    paletteService: { withImagePalettes: async (plugins) => plugins },
    now: () => nowMs,
    logger: silentLogger,
  });

  const fresh = await service.getPlugins();
  assert.equal(fresh.cached, false);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.plugins[0].id, "example");

  nowMs += 1001;
  const stale = await service.getPlugins();
  assert.equal(stale.cached, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.warning, "upstream unavailable");
  assert.equal(stale.plugins[0].id, "example");
});

test("concurrent plugin requests share one in-flight upstream refresh", async () => {
  let releaseFetch;
  let fetchCalls = 0;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const service = createPluginService({
    config: testConfig(),
    openplanetClient: {
      async fetchPlugins() {
        fetchCalls += 1;
        await fetchGate;
        return { plugins: [{ id: "deduped", image: "" }], pageCount: 1 };
      },
    },
    paletteService: { withImagePalettes: async (plugins) => plugins },
    logger: silentLogger,
  });

  const first = service.getPlugins();
  const second = service.getPlugins();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
  releaseFetch();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.plugins[0].id, "deduped");
  assert.equal(secondResult.plugins[0].id, "deduped");
});

test("image failures use a cached fallback palette and the cache remains bounded", async () => {
  let fetchCalls = 0;
  const paletteService = createImagePaletteService({
    config: testConfig({
      imagePaletteCacheMaxEntries: 2,
      imagePaletteFailureCacheTtlMs: 60_000,
    }),
    async fetchImageBuffer() {
      fetchCalls += 1;
      throw new Error("image unavailable");
    },
    logger: silentLogger,
  });

  const [first, duplicate] = await Promise.all([
    paletteService.getImagePalette("https://openplanet.dev/a.png", "a"),
    paletteService.getImagePalette("https://openplanet.dev/a.png", "a"),
  ]);
  assert.equal(first.source, "fallback");
  assert.deepEqual(duplicate, first);
  assert.equal(fetchCalls, 1);

  await paletteService.getImagePalette("https://openplanet.dev/b.png", "b");
  await paletteService.getImagePalette("https://openplanet.dev/c.png", "c");
  assert.equal(paletteService.cacheSize, 2);
});

test("/api/plugins and /health retain their public contracts", async () => {
  const config = testConfig();
  const pluginService = {
    async getPlugins() {
      return {
        plugins: [{ id: "contract-plugin", name: "Contract Plugin" }],
        fetchedAt: "2026-07-20T00:00:00.000Z",
        pageCount: 3,
        cached: false,
        stale: false,
        warning: null,
      };
    },
  };
  const runtime = createPluginHubRuntime({
    config,
    pluginService,
    logger: silentLogger,
    requestLogging: false,
  });

  try {
    await runtime.start();
    const address = runtime.server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const healthResponse = await fetch(`${origin}/health`);
    assert.equal(healthResponse.status, 200);
    assert.match(healthResponse.headers.get("content-type"), /^text\/plain/);
    assert.equal(await healthResponse.text(), "ok");

    const pluginsResponse = await fetch(`${origin}/api/plugins`);
    const payload = await pluginsResponse.json();
    assert.equal(pluginsResponse.status, 200);
    assert.deepEqual(payload, {
      plugins: [{ id: "contract-plugin", name: "Contract Plugin" }],
      count: 1,
      source: "openplanet",
      profile: config.openplanetProfileUrl,
      fetchedAt: "2026-07-20T00:00:00.000Z",
      pageCount: 3,
      cached: false,
      stale: false,
      warning: null,
    });
  } finally {
    await runtime.stop();
  }
});
