import assert from "node:assert/strict";
import test from "node:test";

import { delay } from "../valueUtils.js";

test("shared delays normalize invalid waits and expose deterministic timer injection", async () => {
  let timerCalls = 0;
  await delay(-1, {
    setTimer() {
      timerCalls += 1;
    },
  });
  assert.equal(timerCalls, 0);

  let observedWait = null;
  await delay(12.5, {
    setTimer(resolve, waitMs) {
      observedWait = waitMs;
      resolve();
    },
  });
  assert.equal(observedWait, 12.5);
});
