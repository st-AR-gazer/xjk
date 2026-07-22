import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupUploadedFiles,
  createFieldUpload,
  createUploadBudgetMiddleware,
  getMapUploadExtension,
  hasAllowedSuffix,
  isTrackmaniaGhostFilename,
  isTrackmaniaMapFilename,
  isTrackmaniaReplayFilename,
} from "../uploads.js";

function createFakeMulter() {
  const calls = [];
  const multer = (options) => {
    calls.push(options);
    return { options };
  };
  multer.diskStorage = (options) => options;
  return { multer, calls };
}

function invokeStorage(handler, file) {
  return new Promise((resolve) => {
    handler({}, file, (error, value) => resolve({ error, value }));
  });
}

function invokeFilter(handler, file) {
  return new Promise((resolve) => {
    handler({}, file, (error, accepted) => resolve({ error, accepted }));
  });
}

test("createFieldUpload routes fields, names files, and enforces limits", async () => {
  const { multer, calls } = createFakeMulter();
  const upload = createFieldUpload({
    multer,
    maxFileMb: 12,
    maxFiles: 2,
    createId: () => "request-id",
    fields: {
      map: {
        directory: "maps",
        accept: (file) => hasAllowedSuffix(file.originalname, [".map.gbx"]),
        errorMessage: "Map required.",
      },
      replay: {
        directory: "replays",
        buildFilename: ({ id }) => `${id}.Replay.Gbx`,
      },
    },
  });

  assert.equal(upload.options, calls[0]);
  assert.deepEqual(calls[0].limits, {
    fileSize: 12 * 1024 * 1024,
    files: 2,
    fields: 16,
    fieldSize: 1024 * 1024,
    parts: 18,
  });

  const map = { fieldname: "map", originalname: "Example.Map.Gbx" };
  assert.deepEqual(await invokeStorage(calls[0].storage.destination, map), { error: null, value: "maps" });
  assert.deepEqual(await invokeStorage(calls[0].storage.filename, map), {
    error: null,
    value: "request-id.Gbx",
  });
  assert.deepEqual(await invokeFilter(calls[0].fileFilter, map), { error: null, accepted: true });

  const replay = { fieldname: "replay", originalname: "Example.bin" };
  assert.deepEqual(await invokeStorage(calls[0].storage.filename, replay), {
    error: null,
    value: "request-id.Replay.Gbx",
  });

  const invalid = await invokeFilter(calls[0].fileFilter, { fieldname: "map", originalname: "map.txt" });
  assert.match(invalid.error.message, /Map required/);
  assert.equal(invalid.accepted, undefined);

  const unexpected = await invokeStorage(calls[0].storage.destination, { fieldname: "other" });
  assert.match(unexpected.error.message, /Unexpected upload field: other/);
});

test("createFieldUpload accepts a request-aware custom filter", async () => {
  const { multer, calls } = createFakeMulter();
  const customFilter = (_req, _file, callback) => callback(null, false);

  createFieldUpload({
    multer,
    maxFileMb: 1,
    fields: { maps: { directory: "uploads" } },
    fileFilter: customFilter,
  });

  assert.equal(calls[0].fileFilter, customFilter);
  assert.equal(hasAllowedSuffix("TRACK.MAP.GBX", [".map.gbx"]), true);
  assert.equal(hasAllowedSuffix("track.txt", [".map.gbx", ".gbx"]), false);
});

test("Trackmania upload helpers preserve accepted names and storage extensions", () => {
  assert.equal(isTrackmaniaMapFilename("Track.Map.Gbx"), true);
  assert.equal(isTrackmaniaMapFilename("Track.Gbx"), true);
  assert.equal(isTrackmaniaMapFilename("Track.Replay.Gbx"), true);
  assert.equal(isTrackmaniaMapFilename("Track.zip"), false);
  assert.equal(isTrackmaniaReplayFilename("Run.Replay.Gbx"), true);
  assert.equal(isTrackmaniaReplayFilename("Run.Gbx"), false);
  assert.equal(isTrackmaniaGhostFilename("Run.Ghost.Gbx"), true);
  assert.equal(isTrackmaniaGhostFilename("Run.Gbx"), true);
  assert.equal(getMapUploadExtension("Track.Map.Gbx"), ".Map.Gbx");
  assert.equal(getMapUploadExtension("Track.Gbx"), ".Gbx");
  assert.equal(getMapUploadExtension("Track"), ".Gbx");
});

test("upload budgets reject and remove aggregate overages before route work", async () => {
  const removed = [];
  const middleware = createUploadBudgetMiddleware({
    maxTotalMb: 1,
    unlink: async (filePath) => removed.push(filePath),
  });
  const req = {
    files: {
      map: [{ path: "map", size: 700 * 1024 }],
      replay: [{ path: "replay", size: 400 * 1024 }],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalls = 0;

  await middleware(req, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 413);
  assert.equal(res.payload.code, "UPLOAD_BUDGET_EXCEEDED");
  assert.deepEqual(removed.sort(), ["map", "replay"]);

  const cleaned = [];
  await cleanupUploadedFiles(req, { unlink: async (filePath) => cleaned.push(filePath) });
  assert.deepEqual(cleaned.sort(), ["map", "replay"]);
});

test("upload budgets apply stricter limits to small configuration-file fields", async () => {
  const removed = [];
  const middleware = createUploadBudgetMiddleware({
    maxTotalMb: 64,
    fieldLimitsMb: { manual: 1 },
    unlink: async (filePath) => removed.push(filePath),
  });
  const req = {
    files: {
      map: [{ fieldname: "map", path: "map", size: 2 * 1024 * 1024 }],
      manual: [{ fieldname: "manual", path: "manual", size: 2 * 1024 * 1024 }],
    },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await middleware(req, res, () => assert.fail("field overages must not reach route work"));
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.payload, {
    error: "Upload field 'manual' is too large. Max 1 MB.",
    code: "UPLOAD_FIELD_BUDGET_EXCEEDED",
  });
  assert.deepEqual(removed.sort(), ["manual", "map"]);
});
