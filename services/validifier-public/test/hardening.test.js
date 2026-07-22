import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createArtifactLifecycle } from "../src/artifactLifecycle.js";
import { VALIDIFIER_HARDENING_SETTINGS } from "../src/hardeningConfig.js";
import { ValidifierRepository } from "../src/repository.js";
import { storeArtifactUpload, validateGbxStructure } from "../src/uploadService.js";
import { createUploadQuotaManager } from "../src/uploadQuota.js";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const quietLogger = { error() {}, log() {}, warn() {} };
const testGbxClassIds = Object.freeze({
  map: 0x03043000,
  replay: 0x03092000,
});

function createGbxFixture(kind) {
  const buffer = Buffer.alloc(64);
  buffer.write("GBX", 0, "ascii");
  buffer.writeUInt16LE(6, 3);
  buffer[5] = 0x42;
  buffer[6] = 0x55;
  buffer[7] = 0x55;
  buffer[8] = 0x52;
  buffer.writeUInt32LE(testGbxClassIds[kind], 9);
  buffer.writeUInt32LE(0, 13);
  return buffer;
}

function readDotSourcedPowerShellTree(entryPath, visited = new Set()) {
  const absolutePath = path.resolve(entryPath);
  if (visited.has(absolutePath)) return "";
  visited.add(absolutePath);

  const source = fs.readFileSync(absolutePath, "utf8");
  const sourcedFiles = [...source.matchAll(/\.\s+\(Join-Path\s+\$PSScriptRoot\s+["']([^"']+\.ps1)["']\)/giu)].map(
    ([, relativePath]) => path.resolve(path.dirname(absolutePath), relativePath)
  );
  return [source, ...sourcedFiles.map((filePath) => readDotSourcedPowerShellTree(filePath, visited))].join("\n");
}

async function createTestRepository(context, { artifactTtlMs = 1_000, submissionTtlMs = 1_000 } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "validifier-hardening-"));
  let nowMs = Date.parse("2026-07-20T00:00:00.000Z");
  const repository = new ValidifierRepository({
    dbFile: path.join(directory, "validifier.sqlite"),
    artifactTtlMs,
    submissionTtlMs,
    now: () => nowMs,
  });
  context.after(async () => {
    repository.db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory,
    repository,
    advance(amountMs) {
      nowMs += amountMs;
    },
  };
}

async function createArtifact(repository, directory, kind, suffix) {
  const storagePath = path.join(directory, `${kind}-${suffix}.gbx`);
  await writeFile(storagePath, `${kind}-${suffix}`);
  return repository.createOrReuseArtifact({
    kind,
    sha256: suffix.repeat(64).slice(0, 64),
    sizeBytes: fs.statSync(storagePath).size,
    originalFilename: `${kind}.Gbx`,
    storagePath,
  }).artifact;
}

test("expired submissions stop pinning expired artifacts", async (context) => {
  const fixture = await createTestRepository(context, { artifactTtlMs: 1_000, submissionTtlMs: 2_000 });
  const map = await createArtifact(fixture.repository, fixture.directory, "map", "a");
  const replay = await createArtifact(fixture.repository, fixture.directory, "replay", "b");
  const submission = fixture.repository.createReplaySubmission({
    recordId: "record-1",
    mapUid: "map-1",
    mapRef: map.artifact_ref,
    replayRef: replay.artifact_ref,
  });
  const lifecycle = createArtifactLifecycle({ repository: fixture.repository, logger: quietLogger });

  fixture.advance(1_500);
  assert.equal(lifecycle.collectExpiredArtifacts(), 0);
  assert.equal(fs.existsSync(map.storage_path), true);
  assert.equal(fs.existsSync(replay.storage_path), true);
  assert.ok(fixture.repository.getSubmissionById(submission.submission_id));

  fixture.advance(501);
  assert.equal(fixture.repository.getSubmissionById(submission.submission_id), null);
  assert.equal(lifecycle.collectExpiredArtifacts(), 2);
  assert.equal(fs.existsSync(map.storage_path), false);
  assert.equal(fs.existsSync(replay.storage_path), false);
  assert.equal(fixture.repository.findArtifactByRef(map.artifact_ref), null);
  assert.equal(fixture.repository.findArtifactByRef(replay.artifact_ref), null);
});

test("existing submission rows receive finite expiry during schema migration", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "validifier-migration-"));
  const dbFile = path.join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(dbFile);
  legacy.exec(`
    CREATE TABLE uploaded_artifacts (
      artifact_ref TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );
    CREATE TABLE replay_submissions (
      submission_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      map_uid TEXT NOT NULL,
      rank INTEGER NULL,
      map_ref TEXT NOT NULL,
      replay_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      private_job_id TEXT NULL,
      FOREIGN KEY(map_ref) REFERENCES uploaded_artifacts(artifact_ref),
      FOREIGN KEY(replay_ref) REFERENCES uploaded_artifacts(artifact_ref)
    );
    INSERT INTO uploaded_artifacts VALUES
      ('map-ref', 'map', 'map-hash', 1, 'map.Map.Gbx', 'map.gbx',
       '2026-07-20T00:00:00.000Z', '2026-07-20T00:00:01.000Z', '2026-07-20T00:00:00.000Z'),
      ('replay-ref', 'replay', 'replay-hash', 1, 'run.Replay.Gbx', 'run.gbx',
       '2026-07-20T00:00:00.000Z', '2026-07-20T00:00:01.000Z', '2026-07-20T00:00:00.000Z');
    INSERT INTO replay_submissions VALUES
      ('submission-ref', 'record-1', 'map-1', NULL, 'map-ref', 'replay-ref', 'pending',
       '2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z', NULL);
  `);
  legacy.close();

  const nowMs = Date.parse("2026-07-20T00:00:00.000Z");
  const repository = new ValidifierRepository({
    dbFile,
    artifactTtlMs: 1_000,
    submissionTtlMs: 2_000,
    now: () => nowMs,
  });
  context.after(async () => {
    repository.db.close();
    await rm(directory, { recursive: true, force: true });
  });

  assert.equal(repository.getSubmissionById("submission-ref")?.expires_at, "2026-07-20T00:00:02.000Z");
});

test("an unlink failure retains artifact metadata so collection can retry", async (context) => {
  const fixture = await createTestRepository(context, { artifactTtlMs: 100 });
  const artifact = await createArtifact(fixture.repository, fixture.directory, "map", "c");
  fixture.advance(101);
  let failUnlink = true;
  const fileSystem = {
    existsSync: fs.existsSync,
    unlinkSync(storagePath) {
      if (failUnlink) {
        failUnlink = false;
        throw new Error("simulated sharing violation");
      }
      fs.unlinkSync(storagePath);
    },
  };
  const lifecycle = createArtifactLifecycle({ repository: fixture.repository, logger: quietLogger, fileSystem });

  assert.equal(lifecycle.collectExpiredArtifacts(), 0);
  assert.ok(fixture.repository.findArtifactByRef(artifact.artifact_ref));
  assert.equal(fs.existsSync(artifact.storage_path), true);

  assert.equal(lifecycle.collectExpiredArtifacts(), 1);
  assert.equal(fixture.repository.findArtifactByRef(artifact.artifact_ref), null);
  assert.equal(fs.existsSync(artifact.storage_path), false);
});

test("daily byte and concurrent upload quotas are enforced per client and globally", async (context) => {
  const fixture = await createTestRepository(context);
  const quota = createUploadQuotaManager({
    repository: fixture.repository,
    bytesPerDay: 10,
    globalBytesPerDay: 20,
    maxConcurrent: 1,
    globalMaxConcurrent: 2,
    now: fixture.repository.now,
  });

  const first = quota.acquire({ clientKey: "client-a", byteCount: 6 });
  assert.throws(
    () => quota.acquire({ clientKey: "client-a", byteCount: 1 }),
    (error) => error?.statusCode === 429 && error?.code === "upload_concurrency_limited"
  );
  const second = quota.acquire({ clientKey: "client-b", byteCount: 3 });
  assert.throws(
    () => quota.acquire({ clientKey: "client-c", byteCount: 1 }),
    (error) => error?.statusCode === 429 && error?.code === "upload_concurrency_limited"
  );
  first.release();
  second.release();

  const remainder = quota.acquire({ clientKey: "client-a", byteCount: 4 });
  remainder.release();
  assert.throws(
    () => quota.acquire({ clientKey: "client-a", byteCount: 1 }),
    (error) => error?.statusCode === 429 && error?.code === "upload_quota_exceeded"
  );

  const restartedQuota = createUploadQuotaManager({
    repository: fixture.repository,
    bytesPerDay: 10,
    globalBytesPerDay: 20,
    maxConcurrent: 1,
    globalMaxConcurrent: 2,
    now: fixture.repository.now,
  });
  assert.throws(
    () => restartedQuota.acquire({ clientKey: "client-a", byteCount: 1 }),
    (error) => error?.code === "upload_quota_exceeded"
  );
  const otherClient = restartedQuota.acquire({ clientKey: "client-b", byteCount: 7 });
  otherClient.release();
  assert.throws(
    () => restartedQuota.acquire({ clientKey: "client-c", byteCount: 1 }),
    (error) => error?.code === "upload_quota_exceeded" && /service-wide/.test(error.message)
  );
  const expandedGlobalQuota = createUploadQuotaManager({
    repository: fixture.repository,
    bytesPerDay: 10,
    globalBytesPerDay: 30,
    maxConcurrent: 1,
    globalMaxConcurrent: 2,
    now: fixture.repository.now,
  });
  const rolledBackClientReservation = expandedGlobalQuota.acquire({ clientKey: "client-c", byteCount: 10 });
  rolledBackClientReservation.release();

  fixture.advance(24 * 60 * 60 * 1000);
  const nextDay = restartedQuota.acquire({ clientKey: "client-a", byteCount: 10 });
  nextDay.release();
});

test("artifact streaming reserves quota before accepting the body", async (context) => {
  const fixture = await createTestRepository(context);
  const payload = createGbxFixture("map");
  const quota = createUploadQuotaManager({
    repository: fixture.repository,
    bytesPerDay: payload.length,
    globalBytesPerDay: payload.length * 2,
    maxConcurrent: 1,
    globalMaxConcurrent: 2,
    now: fixture.repository.now,
  });
  const makeRequest = () => {
    const req = Readable.from([payload]);
    req.headers = {
      "content-length": String(payload.length),
      "content-type": "application/octet-stream",
    };
    req.ip = "192.0.2.10";
    return req;
  };

  const stored = await storeArtifactUpload({
    req: makeRequest(),
    kind: "map",
    filename: "smoke.Map.Gbx",
    maxBytes: payload.length,
    artifactRoot: path.join(fixture.directory, "artifacts"),
    repository: fixture.repository,
    uploadQuota: quota,
  });
  assert.equal(stored.kind, "map");
  await assert.rejects(
    storeArtifactUpload({
      req: makeRequest(),
      kind: "map",
      filename: "smoke.Map.Gbx",
      maxBytes: payload.length,
      artifactRoot: path.join(fixture.directory, "artifacts"),
      repository: fixture.repository,
      uploadQuota: quota,
    }),
    (error) => error?.statusCode === 429 && error?.code === "upload_quota_exceeded"
  );
});

test("GBX validation checks header layout and Trackmania node class compatibility", () => {
  const map = createGbxFixture("map");
  const ghost = createGbxFixture("replay");

  assert.equal(validateGbxStructure("map", map, map.length), true);
  assert.equal(validateGbxStructure("replay", ghost, ghost.length), true);
  assert.equal(validateGbxStructure("replay", map, map.length), false);
  assert.equal(validateGbxStructure("map", ghost, ghost.length), false);

  const magicOnly = Buffer.alloc(64);
  magicOnly.write("GBX", 0, "ascii");
  assert.equal(validateGbxStructure("map", magicOnly, magicOnly.length), false);

  const malformed = Buffer.from(map.subarray(0, 64));
  malformed[7] = 0x58;
  assert.equal(validateGbxStructure("map", malformed, map.length), false);

  const impossibleHeaderSize = Buffer.from(map.subarray(0, 64));
  impossibleHeaderSize.writeUInt32LE(map.length, 13);
  assert.equal(validateGbxStructure("map", impossibleHeaderSize, map.length), false);
});

test("hardening configuration schema stays synchronized with deployment catalogs and docs", () => {
  const repoRoot = path.resolve(serviceRoot, "..", "..");
  const documentedSources = [
    fs.readFileSync(path.join(serviceRoot, ".env.example"), "utf8"),
    fs.readFileSync(path.join(serviceRoot, "README.md"), "utf8"),
  ];
  const localCatalog = readDotSourcedPowerShellTree(
    path.join(repoRoot, "deploy", "local", "backend-environment-catalog.ps1")
  );
  const { definePublicDataProcesses } = require(
    path.join(repoRoot, "deploy", "server", "ecosystem", "public-data-processes.cjs")
  );
  const productionEnvironment = definePublicDataProcesses({
    defineProcess: (serviceId, config) => ({ serviceId, ...config }),
    roots: { sites: path.join(repoRoot, "sites") },
    serviceEnvironments: { forService: () => ({}) },
  }).find((processDefinition) => processDefinition.serviceId === "validifier-public").env;
  const envExample = documentedSources[0];

  for (const setting of VALIDIFIER_HARDENING_SETTINGS) {
    for (const source of documentedSources) {
      assert.match(source, new RegExp(`\\b${setting.key}\\b`), `${setting.key} is missing from a config surface`);
    }
    assert.match(localCatalog, new RegExp(`\\b${setting.key}\\b`), `${setting.key} is missing from local deployment`);
    assert.equal(
      String(productionEnvironment[setting.key]),
      String(setting.defaultValue),
      `${setting.key} production default has drifted from its schema default`
    );
    assert.match(
      envExample,
      new RegExp(`^${setting.key}=${setting.defaultValue}$`, "m"),
      `${setting.key} has drifted from its schema default`
    );
    assert.match(
      localCatalog,
      new RegExp(`${setting.key}[\\s\\S]{0,240}${setting.defaultValue}`),
      `${setting.key} local deployment default has drifted from its schema default`
    );
  }
});
