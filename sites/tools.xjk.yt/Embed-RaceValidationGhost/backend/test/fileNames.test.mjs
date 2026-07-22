import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  makeEmbeddedMapDownloadName,
  pickStoredExtension,
  processedFilePath,
  sanitizePathSegment,
  timestampToken,
} from "../src/fileNames.js";
import {
  deriveWalltimeEndTimestamp,
  normalizeReplayInspection,
  normalizeWalltimeTimestamp,
} from "../src/replayInspection.js";

test("embed file names are stable and filesystem-safe", () => {
  assert.equal(makeEmbeddedMapDownloadName("Map.Name.Map.Gbx", 2), "Map.Name-with-embedded-validation-ghost-2.Map.Gbx");
  assert.equal(pickStoredExtension("run.Replay.Gbx", "input"), ".Replay.Gbx");
  assert.equal(sanitizePathSegment("  a/b:c  "), "a_b_c");
  assert.equal(timestampToken(new Date("2026-07-20T12:34:56Z")), "20260720-123456");

  const stored = processedFilePath("C:\\processed", "request", "map/name.Map.Gbx", "map");
  assert.match(path.basename(stored), /^request-with-embedded-validation-ghost-\d{8}-\d{6}-map_name\.Map\.Gbx$/);
});

test("replay inspection normalizes timestamps and ghost summaries", () => {
  const start = "2026-07-20T12:00:00.000Z";
  assert.equal(deriveWalltimeEndTimestamp(start, 1500), "2026-07-20T12:00:01.500Z");
  assert.equal(normalizeWalltimeTimestamp("2106-02-07T06:28:15.000Z"), null);

  const normalized = normalizeReplayInspection({
    Time: { TotalMilliseconds: 1500 },
    Ghosts: [
      {
        RaceTime: { TotalMilliseconds: 1500 },
        WalltimeStartTimestamp: start,
        Checkpoints: [{ Speed: 100 }, { Speed: 200 }],
      },
    ],
  });
  assert.equal(normalized.ghostCount, 1);
  assert.equal(normalized.ghosts[0].walltimeEndTimestamp, "2026-07-20T12:00:01.500Z");
  assert.deepEqual(normalized.ghosts[0].checkpointSpeedStats, { min: 100, max: 200, avg: 150 });
});
