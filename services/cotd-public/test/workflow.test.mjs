import assert from "node:assert/strict";
import test from "node:test";
import { createCotdWorkflow } from "../src/cotdWorkflow.js";

test("concurrent fetch requests share one upstream operation", async () => {
  let releaseFetch;
  let fetchCalls = 0;
  const upstream = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const fetchStates = [];
  const workflow = createCotdWorkflow(
    {
      classifierClient: { isConfigured: () => false },
      nadeoClient: { isConfigured: () => false },
      repository: {
        setFetchState(state) {
          fetchStates.push(state);
          return state;
        },
        upsertSnapshot(snapshot) {
          return snapshot;
        },
      },
      responseCache: { clear() {} },
      totdClient: {
        fetchLatest() {
          fetchCalls += 1;
          return upstream;
        },
        isConfigured: () => true,
      },
    },
    {
      settings: {
        AUTO_CLASSIFY_ENABLED: false,
        MAP_FILES_DIR: "unused",
        TOTD_DOWNLOAD_MAP_FILES: false,
        TOTD_SYNC_MONTH_LENGTH: 1,
        TOTD_SYNC_MONTH_OFFSET: 0,
        TOTD_SYNC_ROYAL: false,
      },
    }
  );

  const first = workflow.runFetch({ reason: "first" });
  const second = workflow.runFetch({ reason: "second" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 1);
  assert.equal(workflow.fetchInFlight instanceof Promise, true);

  releaseFetch({ status: "ok", source: { mode: "fixture" }, maps: [], warnings: [] });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(fetchStates.length, 1);
  assert.equal(fetchStates[0].reason, "first");
  assert.equal(workflow.fetchInFlight, null);
});
