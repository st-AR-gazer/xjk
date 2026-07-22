import assert from "node:assert/strict";
import test from "node:test";
import { ensureUniqueZipEntryName, makeBatchOutputName } from "../src/batchJobs.js";
import { makeDownloadName, parseConversionOptions, stripMapExtension } from "../src/options.js";

test("conversion options use bounded supported values", () => {
  assert.deepEqual(parseConversionOptions({}), {
    variant: "both",
    coverage: "full-stack",
    suffix: "Underwater",
  });
  assert.deepEqual(parseConversionOptions({ variant: "meshless", coverage: "one-layer", suffix: "A b!" }), {
    variant: "meshless",
    coverage: "one-layer",
    suffix: "Ab",
  });
  assert.match(parseConversionOptions({ variant: "unknown" }).error, /Invalid variant/);
  assert.match(parseConversionOptions({ coverage: "unknown" }).error, /Invalid coverage/);
});

test("download names normalize map extensions and duplicate zip entries", () => {
  assert.equal(stripMapExtension("Coast.Map.Gbx"), "Coast");
  assert.equal(stripMapExtension("Coast.Map(2).Gbx"), "Coast");
  assert.equal(makeDownloadName("Coast.Map.Gbx", "Wet"), "Coast-Wet.Map.Gbx");

  const usedNames = new Set();
  assert.equal(ensureUniqueZipEntryName("Coast-Wet.Map.Gbx", usedNames), "Coast-Wet.Map.Gbx");
  assert.equal(ensureUniqueZipEntryName("Coast-Wet.Map.Gbx", usedNames), "Coast-Wet.Map-2.Gbx");
});

test("batch output names distinguish both generated variants", () => {
  assert.equal(
    makeBatchOutputName("Coast.Map.Gbx", "Wet", "both", "result-meshless.Map.Gbx", 0, 2),
    "Coast-Wet-Meshless.Map.Gbx"
  );
  assert.equal(
    makeBatchOutputName("Coast.Map.Gbx", "Wet", "both", "result-normal.Map.Gbx", 1, 2),
    "Coast-Wet-Normal.Map.Gbx"
  );
});
