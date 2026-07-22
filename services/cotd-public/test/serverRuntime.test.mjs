import assert from "node:assert/strict";
import test from "node:test";
import { startCotdScheduler } from "../src/serverRuntime.js";

test("scheduler lifecycle is explicit and can be stopped", () => {
  const workflow = { runFetch: async () => undefined };
  assert.equal(
    startCotdScheduler(workflow, {
      settings: {
        TOTD_FETCH_ENABLED: false,
        TOTD_FETCH_INTERVAL_MS: 60000,
        TOTD_FETCH_ON_START: false,
      },
    }),
    null
  );

  const scheduler = startCotdScheduler(workflow, {
    settings: {
      TOTD_FETCH_ENABLED: true,
      TOTD_FETCH_INTERVAL_MS: 60000,
      TOTD_FETCH_ON_START: false,
    },
  });
  assert.equal(typeof scheduler.stop, "function");
  scheduler.stop();
});
