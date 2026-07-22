import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  collectPendingDisplayNameAccountIds,
  createDisplayNameRefreshController,
  normalizePendingAccountIds,
  scheduleDisplayNameRefresh,
} from "./display-name-refresh.js";
import { esc, escN, fmtTime, looksLikeAccountId, relTime, stripFmt } from "./formatters.js";
import { fetchPagedCollection } from "./paged-collection.js";

test("Altered formatters share HTML, Nadeo, time, and account-id semantics", () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(stripFmt("$f00Red$z normal"), "Red normal");
  assert.equal(escN("$0f0<strong>"), "&lt;strong&gt;");
  assert.equal(fmtTime(61_234), "1:01.234");
  assert.equal(relTime("", ""), "");
  assert.equal(looksLikeAccountId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), true);
  assert.equal(looksLikeAccountId("player"), false);
});

test("display-name collection uses configurable row fields without changing identity rules", () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  assert.deepEqual(
    collectPendingDisplayNameAccountIds(
      [
        { accountId: id, holder: id },
        { accountId: id.toUpperCase(), holder: id },
        { accountId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", holder: "Resolved", displayNamePending: true },
        { accountId: "not-an-id", holder: "not-an-id", displayNamePending: true },
      ],
      { accountKeys: ["accountId"], displayKeys: ["holder"] }
    ),
    [id, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"]
  );
});

test("display-name refresh scheduling resets on identity changes and caps attempts", () => {
  const id = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
  const state = { timer: null, attempts: 0, key: "" };
  const timers = [];
  const cleared = [];
  const changed = [];
  const refreshed = [];
  const setTimer = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };

  assert.deepEqual(normalizePendingAccountIds([id, id.toLowerCase(), ""]), [id.toLowerCase()]);
  assert.equal(
    scheduleDisplayNameRefresh({
      state,
      accountIds: [id, id],
      onRefresh: (ids) => refreshed.push(ids),
      onAccountIdsChanged: (ids) => changed.push(ids),
      delaysMs: [5],
      setTimer,
      clearTimer: (timer) => cleared.push(timer),
    }),
    true
  );
  assert.equal(state.attempts, 1);
  assert.equal(timers[0].delay, 5);
  assert.deepEqual(changed, [[id.toLowerCase()]]);

  timers[0].callback();
  assert.deepEqual(refreshed, [[id.toLowerCase()]]);
  assert.equal(scheduleDisplayNameRefresh({ state, accountIds: [id], onRefresh() {}, delaysMs: [5], setTimer }), false);
  assert.equal(cleared.length, 0);
});

test("display-name refresh controller owns retry state, cancellation, and identity resets", () => {
  const firstId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
  const secondId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
  const timers = [];
  const cleared = [];
  const changed = [];
  const refreshed = [];
  const setTimer = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  const controller = createDisplayNameRefreshController({
    onRefresh: (accountIds) => refreshed.push(accountIds),
    onAccountIdsChanged: (accountIds) => changed.push(accountIds),
    delaysMs: [5, 10],
    setTimer,
    clearTimer: (timer) => cleared.push(timer),
  });

  assert.equal(Object.isFrozen(controller), true);
  assert.equal(controller.schedule([firstId, firstId.toLowerCase()]), true);
  assert.equal(controller.schedule([firstId]), false);
  assert.equal(timers[0].delay, 5);
  assert.deepEqual(changed, [[firstId.toLowerCase()]]);

  timers[0].callback();
  assert.deepEqual(refreshed, [[firstId.toLowerCase()]]);
  assert.equal(controller.schedule([firstId]), true);
  assert.equal(timers[1].delay, 10);
  timers[1].callback();
  assert.equal(controller.schedule([firstId]), false);

  assert.equal(controller.schedule([secondId]), true);
  assert.equal(timers[2].delay, 5);
  assert.deepEqual(changed[1], [secondId]);
  assert.equal(controller.schedule([]), false);
  assert.deepEqual(cleared, [timers[2]]);

  assert.equal(controller.schedule([secondId]), true);
  assert.equal(timers[3].delay, 5);
  controller.clear();
  assert.deepEqual(cleared, [timers[2], timers[3]]);
  assert.throws(() => createDisplayNameRefreshController(), /requires an onRefresh callback/);
});

test("rankings and season pages use the shared display-name refresh controller", async () => {
  const sources = await Promise.all([
    readFile(new URL("../rankings/rankings.js", import.meta.url), "utf8"),
    readFile(new URL("../season/season.js", import.meta.url), "utf8"),
  ]);

  for (const source of sources) {
    assert.match(source, /createDisplayNameRefreshController/);
    assert.match(source, /displayNameRefresh\.schedule\(/);
    assert.match(source, /displayNameRefresh\.clear\(/);
    assert.doesNotMatch(source, /clearDisplayNameRefreshState|scheduleDisplayNameRefresh/);
    assert.doesNotMatch(source, /displayNameRefresh\s*=\s*\{\s*timer:/);
  }
});

test("paged collections share bounds, extra parameters, and forward-progress handling", async () => {
  const requestedUrls = [];
  const pages = [
    { maps: [{ uid: "one" }], paging: { has_more: true, next_offset: 1 } },
    { maps: [{ uid: "two" }], paging: { has_more: false, next_offset: null } },
  ];
  const maps = await fetchPagedCollection("/maps", "maps", {
    fetchPage: async (url) => {
      requestedUrls.push(url);
      return pages.shift();
    },
    resolveUrl: (url) => `/altered${url}`,
    limit: 99999,
    params: { season: "Winter 2026", empty: "" },
  });

  assert.deepEqual(maps, [{ uid: "one" }, { uid: "two" }]);
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0], /^\/altered\/maps\?limit=5000&offset=0&season=Winter\+2026$/);
  assert.match(requestedUrls[1], /offset=1/);
});
