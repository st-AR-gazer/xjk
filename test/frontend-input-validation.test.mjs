import assert from "node:assert/strict";
import test from "node:test";

import { validateLookupValue } from "../sites/shared/xjk-core/input-validation.js";

test("lookup values share one required and maximum-length contract", () => {
  assert.equal(validateLookupValue("  record-id  ", "Record ID"), "record-id");
  assert.throws(() => validateLookupValue("", "Record ID"), /Record ID is required/);
  assert.throws(() => validateLookupValue("x".repeat(161), "Map UID"), /Map UID is too long/);
  assert.equal(validateLookupValue("x".repeat(8), "Short", { maxLength: 8 }), "xxxxxxxx");
});
