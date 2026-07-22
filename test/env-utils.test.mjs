import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseBoolean, parseEnvFile } from "../services/shared/envUtils.js";

test("environment files use one parser across service configurations", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "xjk-env-test-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const envPath = path.join(directory, ".env");
  await fs.writeFile(envPath, "\uFEFF# ignored\nPLAIN=value\nQUOTED=\"two words\"\nSINGLE='three words'\n", "utf8");

  assert.deepEqual(parseEnvFile(envPath), {
    PLAIN: "value",
    QUOTED: "two words",
    SINGLE: "three words",
  });
  assert.deepEqual(parseEnvFile(path.join(directory, "missing.env")), {});
});

test("boolean environment values use explicit truthy and falsy forms", () => {
  for (const value of ["1", "true", "YES", "on"]) assert.equal(parseBoolean(value), true);
  for (const value of ["0", "false", "NO", "off"]) assert.equal(parseBoolean(value, true), false);
  assert.equal(parseBoolean("unknown", true), true);
});
