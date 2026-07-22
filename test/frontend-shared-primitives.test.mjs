import assert from "node:assert/strict";
import test from "node:test";

import { setTextById, waitForNextPaint } from "../sites/shared/xjk-core/dom-utils.js";
import { formatBytes, formatNumber, formatPercent } from "../sites/shared/xjk-core/formatters.js";

test("shared dashboard formatters preserve display contracts", () => {
  assert.equal(formatNumber(1234), (1234).toLocaleString());
  assert.equal(formatNumber("missing"), "-");
  assert.equal(formatBytes(1536), "1.50 KB");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatPercent(12.345, 2), "12.35%");
  assert.equal(formatPercent(Number.NaN), "-");
});

test("shared DOM primitives update text safely and await a paint", async () => {
  const element = { textContent: "old" };
  const document = {
    getElementById(id) {
      return id === "present" ? element : null;
    },
  };

  assert.equal(setTextById("present", "<b>safe</b>", document), element);
  assert.equal(element.textContent, "<b>safe</b>");
  assert.equal(setTextById("missing", "ignored", document), null);

  let scheduled = false;
  await waitForNextPaint((callback) => {
    scheduled = true;
    callback();
  });
  assert.equal(scheduled, true);
});
