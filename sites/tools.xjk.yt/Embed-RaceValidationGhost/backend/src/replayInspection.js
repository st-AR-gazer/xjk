import fsp from "node:fs/promises";
import path from "node:path";
import { readTextFileWithinLimit } from "../../../shared/backend/filesystem.js";
import { createTempCleanup } from "../../../shared/backend/lifecycle.js";

const UINT32_MAX_UNIX_SECONDS = 0xffffffff;
const replaySelection = {
  $type: true,
  Time: { TotalMilliseconds: true },
  PlayerLogin: true,
  PlayerNickname: true,
  AuthorLogin: true,
  AuthorNickname: true,
  MapInfo: { Author: true, Id: true },
  Ghosts: {
    "*": {
      $type: true,
      GhostUid: { Number: true },
      GhostLogin: true,
      GhostNickname: true,
      GhostClubTag: true,
      GhostTrigram: true,
      GhostZone: true,
      RaceTime: { Milliseconds: true, Seconds: true, Minutes: true, TotalMilliseconds: true },
      EventsDuration: { TotalMilliseconds: true },
      Respawns: true,
      StuntScore: true,
      SteeringWheelSensitivity: true,
      WalltimeStartTimestamp: true,
      WalltimeEndTimestamp: true,
      Checkpoints: { "*": { Speed: true, StuntsScore: true } },
      SkinPackDescs: { "*": { FilePath: true, LocatorUrl: true } },
      PlayerModel: { Author: true, Id: true },
      RecordData: { GameVersion: true },
      CompressedData: { UncompressedSize: true },
    },
  },
};

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toNonNegativeNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function normalizeWalltimeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || Math.floor(timestamp / 1000) >= UINT32_MAX_UNIX_SECONDS) return null;
  return value;
}

function deriveWalltimeEndTimestamp(startTimestamp, raceTimeTotalMilliseconds) {
  if (typeof startTimestamp !== "string") return null;
  if (!Number.isFinite(raceTimeTotalMilliseconds) || raceTimeTotalMilliseconds < 0) return null;
  const startMs = Date.parse(startTimestamp);
  return Number.isFinite(startMs) ? new Date(startMs + raceTimeTotalMilliseconds).toISOString() : null;
}

function parseNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function getCheckpointSpeedStats(checkpoints) {
  const speeds = (Array.isArray(checkpoints) ? checkpoints : [])
    .map((checkpoint) => toFiniteNumber(checkpoint?.Speed))
    .filter((speed) => speed !== null);
  if (!speeds.length) return null;
  return {
    min: Math.min(...speeds),
    max: Math.max(...speeds),
    avg: speeds.reduce((sum, value) => sum + value, 0) / speeds.length,
  };
}

function normalizeReplayInspection(raw) {
  const ghosts = (Array.isArray(raw?.Ghosts) ? raw.Ghosts : []).map((ghost, index) => {
    const checkpoints = Array.isArray(ghost?.Checkpoints) ? ghost.Checkpoints : [];
    const skinPackDescs = Array.isArray(ghost?.SkinPackDescs) ? ghost.SkinPackDescs : [];
    const raceTimeTotalMilliseconds = toFiniteNumber(ghost?.RaceTime?.TotalMilliseconds);
    const walltimeStartTimestamp = normalizeWalltimeTimestamp(ghost?.WalltimeStartTimestamp);
    const walltimeEndTimestamp =
      normalizeWalltimeTimestamp(ghost?.WalltimeEndTimestamp) ??
      deriveWalltimeEndTimestamp(walltimeStartTimestamp, raceTimeTotalMilliseconds);
    return {
      index,
      type: ghost?.$type || null,
      ghostUidNumber: toFiniteNumber(ghost?.GhostUid?.Number),
      ghostLogin: ghost?.GhostLogin || null,
      ghostNickname: ghost?.GhostNickname || null,
      ghostClubTag: ghost?.GhostClubTag || null,
      ghostTrigram: ghost?.GhostTrigram || null,
      ghostZone: ghost?.GhostZone || null,
      raceTime: {
        milliseconds: toFiniteNumber(ghost?.RaceTime?.Milliseconds),
        seconds: toFiniteNumber(ghost?.RaceTime?.Seconds),
        minutes: toFiniteNumber(ghost?.RaceTime?.Minutes),
        totalMilliseconds: raceTimeTotalMilliseconds,
      },
      eventsDurationMs: toFiniteNumber(ghost?.EventsDuration?.TotalMilliseconds),
      respawns: toNonNegativeNumber(ghost?.Respawns),
      stuntScore: toFiniteNumber(ghost?.StuntScore),
      steeringWheelSensitivity:
        typeof ghost?.SteeringWheelSensitivity === "boolean" ? ghost.SteeringWheelSensitivity : null,
      walltimeStartTimestamp,
      walltimeEndTimestamp,
      checkpointCount: checkpoints.length,
      checkpointSpeedStats: getCheckpointSpeedStats(checkpoints),
      skinPackCount: skinPackDescs.length,
      skinPackFiles: skinPackDescs
        .map((item) => item?.FilePath)
        .filter((value) => typeof value === "string" && value.trim().length > 0),
      playerModel: { author: ghost?.PlayerModel?.Author || null, id: ghost?.PlayerModel?.Id || null },
      recordData: { gameVersion: ghost?.RecordData?.GameVersion || null },
      compressedData: { uncompressedSize: toFiniteNumber(ghost?.CompressedData?.UncompressedSize) },
    };
  });
  return {
    replayType: raw?.$type || null,
    totalTimeMs: toFiniteNumber(raw?.Time?.TotalMilliseconds),
    playerLogin: raw?.PlayerLogin || null,
    playerNickname: raw?.PlayerNickname || null,
    authorLogin: raw?.AuthorLogin || null,
    authorNickname: raw?.AuthorNickname || null,
    mapInfo: { author: raw?.MapInfo?.Author || null, id: raw?.MapInfo?.Id || null },
    ghostCount: ghosts.length,
    ghosts,
  };
}

function createReplayInspector({ runtime, logger = console }) {
  async function inspect(replayPath, requestId) {
    const requestPath = path.join(runtime.paths.workDir, `${requestId}-extract-request.json`);
    const outputPath = path.join(runtime.paths.workDir, `${requestId}-extract-output.json`);
    const cleanup = createTempCleanup({
      keepFiles: runtime.config.keepFiles,
      files: [requestPath, outputPath],
    });
    try {
      await fsp.writeFile(
        requestPath,
        JSON.stringify({
          replayFile: replayPath,
          outputFile: outputPath,
          includeNulls: false,
          prettyPrint: false,
          maxDepth: 12,
          maxCollectionItems: 50000,
          selection: replaySelection,
        }),
        "utf8"
      );
      const { stdout, stderr } = await runtime.execute({
        executable: runtime.replayExtractToolPath,
        args: [requestPath],
        timeoutMs: runtime.extractTimeoutMs,
        label: "Replay extractor",
        pathLabel: "Replay extractor path",
      });
      if (stdout?.trim()) logger.log(`replay extractor stdout (${requestId}):\n${stdout}`);
      if (stderr?.trim()) logger.warn(`replay extractor stderr (${requestId}):\n${stderr}`);
      const payload = JSON.parse(
        await readTextFileWithinLimit(outputPath, { maxBytes: runtime.config.maxProcessOutputBytes })
      );
      return normalizeReplayInspection(payload);
    } finally {
      await cleanup();
    }
  }
  return { inspect };
}

export {
  createReplayInspector,
  deriveWalltimeEndTimestamp,
  getCheckpointSpeedStats,
  normalizeReplayInspection,
  normalizeWalltimeTimestamp,
  parseNonNegativeInt,
  replaySelection,
};
