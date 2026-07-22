import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { firstExistingPath, readTextFileWithinLimit, safeMkdir, safeRm, safeUnlink } from "../filesystem.js";

test("filesystem helpers create, discover, and remove paths", async (context) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-tool-runtime-"));
  context.after(() => safeRm(root));

  const nested = path.join(root, "one", "two");
  safeMkdir(nested);
  safeMkdir(nested);
  assert.equal(fs.statSync(nested).isDirectory(), true);

  const existing = path.join(nested, "input.txt");
  await fsp.writeFile(existing, "input", "utf8");
  assert.equal(firstExistingPath([path.join(root, "missing"), existing]), path.resolve(existing));
  assert.equal(firstExistingPath([path.join(root, "missing")]), "");

  await safeUnlink(existing);
  await safeUnlink(existing);
  assert.equal(fs.existsSync(existing), false);
});

test("bounded text reads reject oversized generated files and support explicit missing values", async (context) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-tool-output-"));
  context.after(() => safeRm(root));
  const outputPath = path.join(root, "output.json");
  await fsp.writeFile(outputPath, "12345", "utf8");

  assert.equal(await readTextFileWithinLimit(outputPath, { maxBytes: 5 }), "12345");
  await assert.rejects(readTextFileWithinLimit(outputPath, { maxBytes: 4 }), {
    code: "OUTPUT_FILE_TOO_LARGE",
  });
  assert.equal(await readTextFileWithinLimit(path.join(root, "missing"), { missingValue: "" }), "");
});
