import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildZipBuffer, crc32, getDosDateTime } from "../zip.js";
import { safeRm } from "../filesystem.js";

test("crc32 and DOS timestamps match the ZIP format", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.deepEqual(getDosDateTime(new Date(2024, 0, 2, 3, 4, 6)), {
    dosTime: (3 << 11) | (4 << 5) | 3,
    dosDate: ((2024 - 1980) << 9) | (1 << 5) | 2,
  });
});

test("buildZipBuffer emits a stored UTF-8 archive", async (context) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-tool-zip-"));
  context.after(() => safeRm(root));

  const source = path.join(root, "source.txt");
  const contents = Buffer.from("Trackmania");
  await fsp.writeFile(source, contents);

  const archive = await buildZipBuffer([{ name: "unsafe\\entry.txt", path: source }], {
    now: new Date(2024, 0, 2, 3, 4, 6),
    sanitizeName: (name) => name.replace("unsafe", "safe"),
  });

  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.equal(archive.readUInt16LE(6), 0x0800);
  assert.equal(archive.readUInt32LE(14), crc32(contents));
  assert.equal(archive.readUInt32LE(18), contents.length);

  const nameLength = archive.readUInt16LE(26);
  assert.equal(archive.subarray(30, 30 + nameLength).toString("utf8"), "safe/entry.txt");
  assert.deepEqual(archive.subarray(30 + nameLength, 30 + nameLength + contents.length), contents);

  const centralOffset = 30 + nameLength + contents.length;
  assert.equal(archive.readUInt32LE(centralOffset), 0x02014b50);
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
  assert.equal(archive.readUInt16LE(archive.length - 14), 1);
});
