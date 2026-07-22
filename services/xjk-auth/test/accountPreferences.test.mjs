import assert from "node:assert/strict";
import test from "node:test";
import {
  accountIdFromSessionRow,
  accountPreferencesWithDefaults,
  createAccountPreferencesService,
  normalizeAccountPreferences,
} from "../src/accountPreferences.js";

test("account preference input is reduced to supported appearance values", () => {
  assert.deepEqual(normalizeAccountPreferences({ appearance: { accent: "teal", density: "invalid", motion: "off" } }), {
    appearance: { accent: "teal", density: "comfortable", motion: "off" },
  });
});

test("stored preferences merge with defaults without sharing mutable defaults", () => {
  const merged = accountPreferencesWithDefaults({ appearance: { accent: "amber" } }, "2026-07-20T10:00:00Z");
  assert.deepEqual(merged, {
    appearance: { accent: "amber", density: "comfortable", motion: "full" },
    updatedAt: "2026-07-20T10:00:00Z",
  });
  merged.appearance.accent = "purple";
  assert.equal(accountPreferencesWithDefaults().appearance.accent, "white");
});

test("preference service reads the canonical account id", () => {
  const calls = [];
  const service = createAccountPreferencesService({
    getAccountPreferences(accountId) {
      calls.push(accountId);
      return { preferences: { appearance: { density: "compact" } }, updatedAt: "now" };
    },
  });
  assert.equal(accountIdFromSessionRow({ xjk_account_id: "account-1", account_id: "legacy" }), "account-1");
  assert.deepEqual(service.preferencesForRow({ xjk_account_id: "account-1" }), {
    appearance: { accent: "white", density: "compact", motion: "full" },
    updatedAt: "now",
  });
  assert.deepEqual(calls, ["account-1"]);
});
