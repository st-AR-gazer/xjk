import assert from "node:assert/strict";
import test from "node:test";

import { createBingoProtocol } from "../src/bingo-protocol.js";

function protocol() {
  return createBingoProtocol({
    config: {
      bingoAllowDevKeyExchange: false,
      bingoAuthSecret: "test-secret",
      bingoPluginVersion: "1.0.0",
    },
    helpers: {
      base64Url: (value) => Buffer.from(value).toString("base64url"),
      hmacBase64Url: () => "signature",
      nowMs: () => 1_000,
    },
  });
}

test("Bingo TCP messages keep their length-prefixed wire format", () => {
  const { frameMessage } = protocol();
  const frame = frameMessage('{"event":"RoomUpdate"}');

  assert.equal(frame.readUInt32LE(0), frame.length - 4);
  assert.equal(frame.subarray(4).toString("utf8"), '{"event":"RoomUpdate"}');
});

test("Bingo clients buffer partial frames and dispatch complete events", () => {
  const { BingoClient, frameMessage } = protocol();
  const client = new BingoClient();
  const events = [];
  client.onEvent((event) => events.push(event));
  const frame = frameMessage('{"event":"RoomUpdate","room":"ABC"}');

  client.buffer = frame.subarray(0, 5);
  client.flushFrames();
  assert.deepEqual(events, []);

  client.buffer = Buffer.concat([client.buffer, frame.subarray(5)]);
  client.flushFrames();
  assert.deepEqual(events, [{ event: "RoomUpdate", room: "ABC" }]);
  assert.equal(client.buffer.length, 0);
});

test("bridge authentication keeps the signed token envelope", () => {
  const { buildBridgeAuthKey } = protocol();
  const key = buildBridgeAuthKey({ accountId: "account", displayName: "Driver" });
  const [, payload, signature] = key.split(".");

  assert.equal(signature, "signature");
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), {
    v: 1,
    purpose: "player",
    accountId: "account",
    displayName: "Driver",
    issuedAt: 1_000,
    expiresAt: 301_000,
  });
});
