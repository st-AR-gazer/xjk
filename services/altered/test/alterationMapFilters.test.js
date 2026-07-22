import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCommaSeparatedValues } from "../src/domain/alterationMapFilters.js";

test("normalizeCommaSeparatedValues flattens, normalizes, validates, and deduplicates query values", () => {
  assert.deepEqual(
    normalizeCommaSeparatedValues([" Active,paused ", "ACTIVE", "invalid"], {
      normalize: (value) => value.trim().toLowerCase(),
      isAllowed: (value) => value === "active" || value === "paused",
    }),
    ["active", "paused"]
  );

  assert.deepEqual(
    normalizeCommaSeparatedValues("Snow,stadium,SNOW", {
      makeKey: (value) => value.toLowerCase(),
    }),
    ["Snow", "stadium"]
  );
});
