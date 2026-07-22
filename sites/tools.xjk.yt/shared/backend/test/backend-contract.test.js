import assert from "node:assert/strict";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { safeRm } from "../filesystem.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = path.resolve(TEST_DIR, "..", "..", "..");

async function startBackend(context, toolName, { environmentOverrides = {}, beforeImport } = {}) {
  const runtimeRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "xjk-tool-contract-"));
  const backendDir = path.join(TOOLS_DIR, toolName, "backend");
  const environment = {
    TOOL_PATH: process.execPath,
    FRONTEND_DIR: path.join(runtimeRoot, "frontend"),
    UPLOAD_DIR: path.join(runtimeRoot, "uploads"),
    OUTPUT_DIR: path.join(runtimeRoot, "processed"),
    JOBS_DIR: path.join(runtimeRoot, "jobs"),
    KEEP_FILES: "false",
    ...environmentOverrides,
  };
  const previousEnvironment = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  if (beforeImport) await beforeImport({ runtimeRoot, environment });

  const runtime = { server: null };

  context.after(async () => {
    if (runtime.server?.listening) {
      await new Promise((resolve) => runtime.server.close(resolve));
    }
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await safeRm(runtimeRoot);
  });

  const serverUrl = pathToFileURL(path.join(backendDir, "server.js"));
  serverUrl.searchParams.set("contract", path.basename(runtimeRoot));
  const { app } = await import(serverUrl.href);
  runtime.server = app.listen(0, "127.0.0.1");
  await once(runtime.server, "listening");
  const { port } = runtime.server.address();

  return { app, baseUrl: `http://127.0.0.1:${port}`, runtimeRoot };
}

test("medal modifier preserves health and upload-validation contracts", async (context) => {
  const { baseUrl } = await startBackend(context, "Gbx-Medal-Time-Modifier");

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "ok");

  const form = new FormData();
  form.append("map", new Blob(["not a map"]), "fixture.txt");
  const response = await fetch(`${baseUrl}/api/modify`, { method: "POST", body: form });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Upload a Trackmania .Map.Gbx / .Gbx map file.",
  });
});

test("underwater converter rejects invalid options without retaining uploads", async (context) => {
  const { baseUrl, runtimeRoot } = await startBackend(context, "Underwater-Map-Converter");
  const form = new FormData();
  form.append("map", new Blob(["fixture"]), "fixture.Map.Gbx");
  form.append("variant", "lava");

  const response = await fetch(`${baseUrl}/api/convert`, { method: "POST", body: form });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid variant. Use: normal, meshless, both" });
  assert.deepEqual(await fsp.readdir(path.join(runtimeRoot, "uploads")), []);
});

test("underwater batch storage fails closed before invoking a native runner and cleans its upload", async (context) => {
  const existingJobId = "11111111-1111-4111-8111-111111111111";
  const { baseUrl, runtimeRoot } = await startBackend(context, "Underwater-Map-Converter", {
    environmentOverrides: { MAX_STORED_JOBS: "1" },
    beforeImport: async ({ environment }) => {
      await fsp.mkdir(path.join(environment.JOBS_DIR, existingJobId), { recursive: true });
    },
  });
  const form = new FormData();
  form.append("maps", new Blob(["fixture"]), "fixture.Map.Gbx");

  const response = await fetch(`${baseUrl}/api/convert-batch`, { method: "POST", body: form });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), {
    error: "Batch result storage is currently full. Try again after older jobs expire.",
    code: "TOOL_JOB_STORAGE_FULL",
    retryAfterSeconds: 60,
  });
  assert.deepEqual(await fsp.readdir(path.join(runtimeRoot, "uploads")), []);
});

test("configuration-file field limits reject and clean multipart work before native execution", async (context) => {
  const { baseUrl, runtimeRoot } = await startBackend(context, "Embedded-Blocks-And-Items-Checker");
  const form = new FormData();
  form.append("map", new Blob(["fixture"]), "fixture.Map.Gbx");
  form.append("manualOverrides", new Blob([Buffer.alloc(1024 * 1024 + 1)]), "manual.json");

  const response = await fetch(`${baseUrl}/api/check`, { method: "POST", body: form });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: "Upload field 'manualOverrides' is too large. Max 1 MB.",
    code: "UPLOAD_FIELD_BUDGET_EXCEEDED",
  });
  assert.deepEqual(await fsp.readdir(path.join(runtimeRoot, "uploads", "maps")), []);
  assert.deepEqual(await fsp.readdir(path.join(runtimeRoot, "uploads", "manual")), []);
});

test("Clip upload retention has a fail-fast storage ceiling", async (context) => {
  const { baseUrl } = await startBackend(context, "Clip-To-Ghost", {
    environmentOverrides: { MAX_STORED_UPLOADS: "1" },
    beforeImport: async ({ environment }) => {
      const cacheDir = path.join(environment.UPLOAD_DIR, "cache");
      await fsp.mkdir(cacheDir, { recursive: true });
      await fsp.writeFile(path.join(cacheDir, "11111111-1111-4111-8111-111111111111.json"), "{}", "utf8");
    },
  });

  const response = await fetch(`${baseUrl}/api/upload-map`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-Map-Filename": "fixture.Map.Gbx" },
    body: Buffer.from("fixture"),
  });

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual(await response.json(), {
    error: "Stored upload capacity is full. Try again after an older upload expires.",
    code: "TOOL_UPLOAD_STORAGE_FULL",
    retryAfterSeconds: 60,
  });
});

test("every public executable route admits capacity before reading an upload", async (context) => {
  const executableRoutes = {
    "Clip-To-Ghost": ["/api/upload-map", "/api/inspect", "/api/export"],
    "Embed-RaceValidationGhost": ["/api/inspect-replay", "/api/embed"],
    "Embedded-Blocks-And-Items-Checker": ["/api/check"],
    "Extract-Replay-Data": ["/api/extract"],
    "Gbx-Medal-Time-Modifier": ["/api/modify"],
    "Map-Validation-Checker": ["/api/check"],
    "Strip-RaceValidationGhost": ["/api/strip"],
    "Underwater-Map-Converter": ["/api/convert", "/api/convert-batch"],
  };

  for (const [toolName, routePaths] of Object.entries(executableRoutes)) {
    const { app } = await startBackend(context, toolName);
    for (const routePath of routePaths) {
      const routeLayer = app._router.stack.find((layer) => layer.route?.path === routePath);
      assert.ok(routeLayer, `${toolName} is missing ${routePath}`);

      const handlers = routeLayer.route.stack.map((layer) => layer.handle.name);
      const admissionIndex = handlers.indexOf("admit");
      const bodyReaderIndex = handlers.findIndex((name) => name === "multerMiddleware" || name === "rawParser");
      assert.ok(admissionIndex >= 0, `${toolName} ${routePath} has no bounded-capacity admission`);
      assert.ok(bodyReaderIndex > admissionIndex, `${toolName} ${routePath} reads its upload before admission`);
    }
  }
});
