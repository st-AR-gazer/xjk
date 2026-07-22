import assert from "node:assert/strict";
import test from "node:test";
import { parseBool, safeExt, sanitizeDownloadName, stripMapGbxExtension } from "../values.js";

test("parseBool recognizes form values and preserves its fallback", () => {
  for (const value of [true, "1", "TRUE", "yes", " on "]) assert.equal(parseBool(value), true);
  for (const value of [false, "0", "FALSE", "no", " off "]) assert.equal(parseBool(value, true), false);
  assert.equal(parseBool(["0", "yes"]), true);
  assert.equal(parseBool(["0", "no"]), false);
  assert.equal(parseBool("unknown", true), true);
  assert.equal(parseBool(undefined, true), true);
});

test("file value helpers keep the established naming contracts", () => {
  assert.equal(safeExt("track.Map.Gbx", ".bin"), ".Gbx");
  assert.equal(safeExt("track", ".bin"), ".bin");
  assert.equal(sanitizeDownloadName('bad/\\"name\r\n.zip'), "bad_name_.zip");
  assert.equal(sanitizeDownloadName("", "result.Map.Gbx"), "result.Map.Gbx");
  assert.equal(stripMapGbxExtension("Track.Map.Gbx"), "Track");
  assert.equal(stripMapGbxExtension("Track.Gbx"), "Track");
  assert.equal(stripMapGbxExtension("Track.Map(2).Gbx"), "Track.Map(2)");
  assert.equal(stripMapGbxExtension("Track.Map(2).Gbx", { allowDuplicateSuffix: true }), "Track");
});
