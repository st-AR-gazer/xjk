import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSER_ROOT_DIR = path.resolve(__dirname, "..", "..", "tools", "GbxMapLayoutParser");
const PARSER_PROJECT_PATH = path.resolve(
  PARSER_ROOT_DIR,
  "GbxMapLayoutParser.csproj"
);
const PARSER_RELEASE_DIR = path.resolve(PARSER_ROOT_DIR, "bin", "Release", "net8.0");
const PARSER_RELEASE_EXE_PATH = path.resolve(PARSER_RELEASE_DIR, "GbxMapLayoutParser.exe");
const PARSER_RELEASE_DLL_PATH = path.resolve(PARSER_RELEASE_DIR, "GbxMapLayoutParser.dll");

let cachedRunner = null;

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function safeFileName(value, fallback = "map") {
  const normalized = toText(value, fallback).replace(/[^A-Za-z0-9._-]+/g, "_");
  return normalized || fallback;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveParserRunner() {
  if (cachedRunner) return cachedRunner;

  // Prefer running the already-built Release binary to avoid `dotnet run` triggering a build
  // for every batch (which is slower and can fail under concurrent loads).
  if (process.platform === "win32" && (await fileExists(PARSER_RELEASE_EXE_PATH))) {
    cachedRunner = {
      command: PARSER_RELEASE_EXE_PATH,
      args: (requestPath, responsePath) => [requestPath, responsePath],
    };
    return cachedRunner;
  }

  if (await fileExists(PARSER_RELEASE_DLL_PATH)) {
    cachedRunner = {
      command: "dotnet",
      args: (requestPath, responsePath) => [PARSER_RELEASE_DLL_PATH, requestPath, responsePath],
    };
    return cachedRunner;
  }

  cachedRunner = {
    command: "dotnet",
    args: (requestPath, responsePath) => [
      "run",
      "--project",
      PARSER_PROJECT_PATH,
      "--configuration",
      "Release",
      "--",
      requestPath,
      responsePath,
    ],
  };
  return cachedRunner;
}

async function runParser(requestPath, responsePath, { timeoutMs = 120000 } = {}) {
  const runner = await resolveParserRunner();
  return new Promise((resolve, reject) => {
    const child = spawn(
      runner.command,
      runner.args(requestPath, responsePath),
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`GBX parser timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== 2) {
        reject(
          new Error(
            `GBX parser exited with code ${code}. ${toText(stderr) || toText(stdout) || ""}`.trim()
          )
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function parseGbxMapLayouts(inputs = [], { timeoutMs = 120000 } = {}) {
  const maps = Array.isArray(inputs) ? inputs : [];
  if (!maps.length) {
    return {
      ok: true,
      parserVersion: null,
      maps: [],
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "altered-gbx-layout-"));
  const requestPath = path.join(tempDir, "request.json");
  const responsePath = path.join(tempDir, "response.json");

  try {
    const requestPayload = { maps: [] };
    for (const map of maps) {
      const mapUid = toText(map?.mapUid);
      if (!mapUid) continue;
      let filePath = toText(map?.filePath || map?.localFilePath || map?.sourcePath);
      if (!filePath) {
        if (!Buffer.isBuffer(map?.buffer)) continue;
        filePath = path.join(tempDir, `${safeFileName(mapUid)}.Map.Gbx`);
        await fs.writeFile(filePath, map.buffer);
      }
      requestPayload.maps.push({
        mapUid,
        filePath,
      });
    }

    await fs.writeFile(requestPath, JSON.stringify(requestPayload), "utf8");
    await runParser(requestPath, responsePath, { timeoutMs });

    const responseText = await fs.readFile(responsePath, "utf8");
    return JSON.parse(responseText);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export { PARSER_PROJECT_PATH, parseGbxMapLayouts };
