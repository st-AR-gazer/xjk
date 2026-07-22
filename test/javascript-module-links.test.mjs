import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { collectLiteralDynamicImports, resolveLocalImport } from "../scripts/check-javascript-module-links.mjs";
import { repoRoot } from "../scripts/lib/platform-manifest.mjs";

test("module graph inspection finds literal dynamic imports without guessing computed targets", () => {
  const imports = collectLiteralDynamicImports(
    ['void import("./literal.js");', "const target = './computed.js';", "void import(target);"].join("\n"),
    "fixture.js"
  );

  assert.deepEqual(imports, [{ specifier: "./literal.js", line: 1 }]);
});

test("tracker mode shims resolve their server-provided shared runtime", () => {
  const shimPath = path.join(repoRoot, "sites/trackers.xjk.yt/frontend/__runtime/wr/app.js");
  assert.equal(
    resolveLocalImport("./tracker-shared/public-app.js", shimPath),
    path.join(repoRoot, "sites/trackers.xjk.yt/frontend/__runtime/shared/public-app.js")
  );
});
