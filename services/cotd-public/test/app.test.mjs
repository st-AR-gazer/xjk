import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createCotdApp } from "../src/app.js";

test("composed COTD app exposes health from injected runtime services", async (t) => {
  const runtime = {
    classifierClient: { isConfigured: () => false },
    nadeoClient: {
      isConfigured: () => false,
      status: () => ({ configured: false }),
    },
    repository: {
      getFetchState: () => null,
      getStorageSummary: () => ({ status: "ok", snapshots: 0 }),
    },
    responseCache: { get: () => undefined, set() {} },
    totdClient: { isConfigured: () => false },
  };
  const settings = {
    ADMIN_TOKEN: "",
    ALLOW_DEBUG_RAW: false,
    AUTO_CLASSIFY_ENABLED: false,
    CLASSIFIER_BASE_URL: "",
    CLASSIFIER_PATH: "/api/v1/classify",
    CLASSIFIER_TIMEOUT_MS: 1000,
    FRONTEND_DIR: path.resolve("sites/cotd.xjk.yt/frontend"),
    MAP_FILES_DIR: path.resolve("sites/cotd.xjk.yt/data/maps"),
    PUBLIC_CACHE_TTL_MS: 0,
    PUBLIC_PAGINATION_MAX_OFFSET: 100,
    TOTD_DOWNLOAD_MAP_FILES: false,
    TOTD_FETCH_ENABLED: false,
    TOTD_FETCH_INTERVAL_MS: 30000,
    TOTD_SOURCE_TIMEOUT_MS: 1000,
    TOTD_SYNC_MONTH_LENGTH: 1,
    TOTD_SYNC_MONTH_OFFSET: 0,
    TOTD_SYNC_ROYAL: false,
  };
  const app = createCotdApp({
    runtime,
    settings,
    workflow: { fetchInFlight: null },
    logger: { error() {} },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.service, "cotd-public");
  assert.equal(body.data.status, "degraded");
  assert.deepEqual(body.data.storage, { status: "ok", snapshots: 0 });
});
