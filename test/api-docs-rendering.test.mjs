import assert from "node:assert/strict";
import test from "node:test";

import { renderApiParamRows, renderApiRemarks } from "../sites/shared/xjk-core/api-docs-rendering.js";
import { withDepth } from "../sites/altered.xjk.yt/frontend/api/endpoint-tree.js";

test("API documentation rows use one escaped rendering contract", () => {
  const rows = renderApiParamRows([
    {
      name: "<uid>",
      value: '"example"',
      description: "Map & campaign",
      type: "string",
      required: true,
      default: "none",
    },
  ]);

  assert.match(rows, /&lt;uid&gt;/);
  assert.match(rows, /&quot;example&quot;/);
  assert.match(rows, /Map &amp; campaign/);
  assert.match(rows, /type=<code>string<\/code> \| required \| default=<code>none<\/code>/);
  assert.doesNotMatch(rows, /<uid>/);
  assert.match(renderApiRemarks(["Safe <remark>"]), /Safe &lt;remark&gt;/);
});

test("API documentation rows preserve shared empty states", () => {
  assert.match(renderApiParamRows([]), /No entries for this section/);
  assert.match(renderApiRemarks([]), /No additional remarks/);
});

test("Altered API navigation derives hierarchy from endpoint paths", () => {
  const endpoints = [{ path: "/api/maps/:mapUid" }, { path: "/health" }, { path: "/api" }, { path: "/api/maps" }];

  assert.deepEqual(
    withDepth(endpoints).map(({ ep, depth }) => [ep.path, depth]),
    [
      ["/api", 0],
      ["/api/maps", 1],
      ["/api/maps/:mapUid", 2],
      ["/health", 0],
    ]
  );
  assert.equal(endpoints[0].path, "/api/maps/:mapUid");
});
