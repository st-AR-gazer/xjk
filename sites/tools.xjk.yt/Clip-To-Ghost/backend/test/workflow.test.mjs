import assert from "node:assert/strict";
import test from "node:test";
import {
  appendSelectionArguments,
  buildManifestDownloadName,
  buildZipDownloadName,
  parseNonNegativeInt,
  parseTemplateMode,
} from "../src/clipWorkflow.js";
import { parseBase64Upload, sanitizeDownloadName, sanitizeUploadId, uploadInputError } from "../src/uploadStore.js";

test("clip workflow builds explicit selection arguments", () => {
  assert.deepEqual(
    appendSelectionArguments(["map.Map.Gbx"], { clipIndex: "2", trackIndex: 0, blockIndex: "invalid" }),
    ["map.Map.Gbx", "--clip-index", "2", "--track-index", "0"]
  );
  assert.equal(parseNonNegativeInt("-1"), null);
  assert.equal(parseTemplateMode("CUSTOM"), "custom");
  assert.equal(parseTemplateMode("unknown"), "shipped");
});

test("clip downloads and upload identifiers are normalized", () => {
  assert.equal(buildManifestDownloadName("Race.Map.Gbx"), "Race.clip-to-ghost.manifest.json");
  assert.equal(buildZipDownloadName("Race.Gbx"), "Race-clip-to-ghost.zip");
  assert.equal(sanitizeDownloadName('a/"b.Ghost.Gbx'), "a_b.Ghost.Gbx");
  assert.equal(parseBase64Upload("data:application/octet-stream;base64,Zm9v"), "Zm9v");
  assert.equal(sanitizeUploadId("97f027bd-e084-4fca-b01f-714211ade142"), "97f027bd-e084-4fca-b01f-714211ade142");
  assert.equal(sanitizeUploadId("../metadata"), "");
});

test("upload input errors carry an HTTP client-error status", () => {
  const error = uploadInputError("invalid upload");
  assert.equal(error.message, "invalid upload");
  assert.equal(error.statusCode, 400);
});
