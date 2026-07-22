import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadRuntime() {
  const source = await readFile(new URL("../sites/shared/xjk-core/local-path-rewriter.js", import.meta.url), "utf8");
  const window = {};
  vm.runInNewContext(source, { window }, { filename: "local-path-rewriter.js" });
  return window.XjkLocalPaths;
}

test("local path resolver prefixes only local, root-relative site URLs", async () => {
  const paths = await loadRuntime();
  const prefix = paths.detectLocalPrefix({ hostname: "localhost", pathname: "/altered/maps/" }, "/altered");
  const resolve = paths.createPathResolver(prefix, {
    shouldSkip: (value) => value.startsWith("/shared/"),
  });

  assert.equal(prefix, "/altered");
  assert.equal(resolve("/api/v1/maps"), "/altered/api/v1/maps");
  assert.equal(resolve("/altered/api/v1/maps"), "/altered/api/v1/maps");
  assert.equal(resolve("/shared/xjk-core/topbar.js"), "/shared/xjk-core/topbar.js");
  assert.equal(resolve("https://xjk.yt/"), "https://xjk.yt/");
  assert.equal(resolve("#maps"), "#maps");
});

test("local path prefix stays disabled on public and unrelated paths", async () => {
  const paths = await loadRuntime();
  assert.equal(paths.detectLocalPrefix({ hostname: "altered.xjk.yt", pathname: "/maps" }, "/altered"), "");
  assert.equal(paths.detectLocalPrefix({ hostname: "localhost", pathname: "/tools" }, "/altered"), "");
  assert.equal(
    paths.detectLocalPrefix({ hostname: "[::1]", pathname: "/validifier/api" }, "/validifier"),
    "/validifier"
  );
});
