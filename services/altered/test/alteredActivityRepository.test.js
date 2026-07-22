import assert from "node:assert/strict";
import test from "node:test";
import { rowToUpdateRequest } from "../src/repositories/alteredActivityRepository.js";

test("rowToUpdateRequest normalizes every update-request read path consistently", () => {
  assert.equal(rowToUpdateRequest(null), null);
  assert.deepEqual(
    rowToUpdateRequest({
      requestId: "42",
      mapUid: "  uid  ",
      mapName: null,
      reason: " reason ",
      status: "",
      requesterIp: "",
      requesterUserAgent: " Agent ",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    {
      requestId: 42,
      mapUid: "uid",
      mapName: "",
      reason: "reason",
      status: "queued",
      requesterIp: null,
      requesterUserAgent: "Agent",
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
      resolutionNote: null,
    }
  );
});
