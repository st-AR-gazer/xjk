import assert from "node:assert/strict";
import test from "node:test";

import { Jimp } from "jimp";
import { buildPaletteFromImageBuffer } from "../src/palette.js";

test("image palette runtime decodes buffers and uses the Jimp v1 resize contract", async () => {
  const source = new Jimp({ width: 2, height: 2, color: 0xff3366ff });
  const buffer = await source.getBuffer("image/png");
  const decoded = await Jimp.read(buffer);
  const sampled = decoded.clone().resize({ w: 72, h: 72 });

  assert.equal(sampled.bitmap.width, 72);
  assert.equal(sampled.bitmap.height, 72);
  assert.ok(sampled.bitmap.data.length > 0);

  const palette = await buildPaletteFromImageBuffer(buffer, "image-runtime-test");
  assert.equal(palette.source, "image");
});
