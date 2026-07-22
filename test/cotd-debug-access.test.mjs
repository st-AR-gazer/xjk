import assert from "node:assert/strict";
import test from "node:test";

import { rawDebugAccessAllowed } from "../services/cotd-public/src/debugAccessPolicy.js";

test("COTD raw debug data always fails closed without authenticated admin access", () => {
  const allowed = {
    requested: "1",
    enabled: true,
    adminConfigured: true,
    authenticated: true,
  };
  assert.equal(rawDebugAccessAllowed(allowed), true);

  for (const missingRequirement of ["requested", "enabled", "adminConfigured", "authenticated"]) {
    assert.equal(rawDebugAccessAllowed({ ...allowed, [missingRequirement]: false }), false, missingRequirement);
  }
  assert.equal(rawDebugAccessAllowed({ ...allowed, requested: "yes" }), true);
  assert.equal(rawDebugAccessAllowed({ ...allowed, requested: "debug" }), false);
});
