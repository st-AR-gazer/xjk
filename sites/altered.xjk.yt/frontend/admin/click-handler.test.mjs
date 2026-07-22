import assert from "node:assert/strict";
import test from "node:test";

import { createMapClickRoutes } from "./modules/click-maps.js";
import { createNavigationClickRoutes } from "./modules/click-navigation.js";
import { createOperationsClickRoutes } from "./modules/click-operations.js";
import { createAdminClickHandler, createClickRoute, createOrderedClickRouter } from "./modules/click-router.js";
import { createAdminClickRoutes } from "./modules/click-routes.js";
import { runSimilarityBackfill } from "./modules/click-naming.js";

function targetFor(matches) {
  return {
    closest: (selector) => matches.get(selector) || null,
  };
}

test("ordered click routing awaits and consumes only the first matching route", async () => {
  const calls = [];
  const first = { id: "first" };
  const second = { id: "second" };
  const dispatch = createOrderedClickRouter([
    createClickRoute("[data-first]", async (control) => {
      await Promise.resolve();
      calls.push(control.id);
    }),
    createClickRoute("[data-second]", (control) => calls.push(control.id)),
  ]);

  const handled = await dispatch({
    target: targetFor(
      new Map([
        ["[data-first]", first],
        ["[data-second]", second],
      ])
    ),
  });

  assert.equal(handled, true);
  assert.deepEqual(calls, ["first"]);
  assert.equal(await dispatch({ target: targetFor(new Map()) }), false);
});

test("composed admin routes preserve navigation-before-map precedence", async () => {
  const calls = [];
  const drawerControl = { dataset: { drawerTab: "history" } };
  const mapControl = { dataset: { mapCommand: "track", mapUid: "uid" } };
  const context = {
    state: { drawerUi: {} },
    syncDrawerTabs: () => calls.push("drawer"),
    handleMapCmd: () => calls.push("map"),
  };
  const dispatch = createOrderedClickRouter(createAdminClickRoutes(context));

  await dispatch({
    target: targetFor(
      new Map([
        ["[data-drawer-tab]", drawerControl],
        ["[data-map-command]", mapControl],
      ])
    ),
  });

  assert.equal(context.state.drawerUi.activeTab, "history");
  assert.deepEqual(calls, ["drawer"]);
});

test("a matched feature action short-circuits later selectors even when it rejects its value", async () => {
  const calls = [];
  const state = {
    maps: {
      view: "naming",
      filters: { naming: { q: "ice" } },
      page: { naming: 2 },
      data: { pageCount: 8 },
    },
  };
  const context = {
    guarded: async (key, action) => {
      calls.push(key);
      await action();
    },
    loadMaps: async () => calls.push("load"),
    state,
  };
  const routes = createMapClickRoutes(context);
  const dispatch = createOrderedClickRouter(routes);
  const invalidPreset = { getAttribute: () => "not-a-preset" };
  const pagination = { dataset: { pageAction: "maps-next-page" } };

  await dispatch({
    target: targetFor(
      new Map([
        ["[data-naming-preset]", invalidPreset],
        ["[data-page-action]", pagination],
      ])
    ),
  });

  assert.equal(state.maps.page.naming, 2);
  assert.deepEqual(calls, []);
});

test("map pagination clamps state before loading the active view", async () => {
  const calls = [];
  const state = {
    maps: { view: "inventory", page: { inventory: 3 }, data: { pageCount: 3 } },
  };
  const context = {
    guarded: async (key, action) => {
      calls.push(key);
      await action();
    },
    loadMaps: async (force) => calls.push(["loadMaps", force]),
    state,
  };
  const dispatch = createOrderedClickRouter(createMapClickRoutes(context));

  await dispatch({
    target: targetFor(new Map([["[data-page-action]", { dataset: { pageAction: "maps-next-page" } }]])),
  });

  assert.equal(state.maps.page.inventory, 3);
  assert.deepEqual(calls, ["page-maps-next-page", ["loadMaps", true]]);
});

test("activity pagination advances to the server cursor through guarded loading", async () => {
  const calls = [];
  const state = { activity: { cursor: 0, limit: 40, data: { nextCursor: 80 } } };
  const context = {
    guarded: async (key, action) => {
      calls.push(key);
      await action();
    },
    loadActivity: async () => calls.push("loadActivity"),
    state,
  };
  const dispatch = createOrderedClickRouter(createOperationsClickRoutes(context));

  await dispatch({
    target: targetFor(new Map([["[data-activity-page]", { dataset: { activityPage: "next" } }]])),
  });

  assert.equal(state.activity.cursor, 80);
  assert.deepEqual(calls, ["activity-page-next", "loadActivity"]);
});

test("admin click prelude tracks the action control and closes unrelated search lists", async () => {
  const actionControl = { id: "action" };
  const routeControl = { id: "route" };
  const target = targetFor(
    new Map([
      ["button, a.btn, [role='button']", actionControl],
      ["[data-route]", routeControl],
    ])
  );
  const calls = [];
  const context = {
    hideAlterationSearchLists: () => calls.push("hide"),
    isHtmlElement: () => true,
    state: {},
  };
  const handler = createAdminClickHandler(context, [
    createClickRoute("[data-route]", (control) => calls.push(control.id)),
  ]);

  assert.equal(await handler({ target }), true);
  assert.equal(context.state.lastActionControl, actionControl);
  assert.deepEqual(calls, ["hide", "route"]);
});

test("navigation route actions retain workspace and similarity-page state semantics", async () => {
  const calls = [];
  const state = { drawerUi: { namingSimilarityPage: 1 } };
  const context = {
    setHash: (...args) => calls.push(args),
    state,
    syncNamingSimilaritySearch: () => calls.push("sync"),
  };
  const dispatch = createOrderedClickRouter(createNavigationClickRoutes(context));

  await dispatch({
    target: targetFor(new Map([["[data-naming-similarity-page]", { getAttribute: () => "prev", dataset: {} }]])),
  });
  assert.equal(state.drawerUi.namingSimilarityPage, 1);
  assert.deepEqual(calls, ["sync"]);
});

test("similarity backfill action normalizes scope and publishes live progress", async () => {
  const calls = [];
  const state = {
    namingSimilaritySourceKey: " NADEO ",
    namingSimilarityCampaignName: "",
    namingSimilarityClubId: "42",
    namingSimilarityPendingOnly: true,
    namingSimilarityForce: true,
    similarityBackfill: null,
  };
  const context = {
    isNotFoundError: () => false,
    post: async (endpoint, payload) => {
      calls.push([endpoint, payload]);
      return { started: true, status: { running: true } };
    },
    rerenderSimilarityBackfillSurfaces: () => calls.push("render"),
    state,
    toast: (...args) => calls.push(args),
  };

  await runSimilarityBackfill(context, { getAttribute: () => "selected-source" });

  assert.deepEqual(calls[0], [
    "/api/v1/admin/naming/similarity/backfill/start",
    {
      reason: "admin-v2-rescan-nadeo",
      sourceKey: "nadeo",
      campaignName: undefined,
      clubId: 42,
      reviewState: "pending",
      force: true,
      rescanAll: true,
    },
  ]);
  assert.deepEqual(state.similarityBackfill, { running: true });
  assert.equal(state.similarityBackfillStatusSupported, true);
  assert.deepEqual(calls.slice(1), ["render", ["Similarity rescan for nadeo started. Progress is now live.", "info"]]);
});
