import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

function ensureDirectorySync(directoryPath) {
  if (!directoryPath) return;
  fs.mkdirSync(directoryPath, { recursive: true });
}

function ensureParentDirectorySync(filePath) {
  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath) return;
  ensureDirectorySync(path.dirname(normalizedPath));
}

function safeUnlinkSync(filePath) {
  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath) return false;
  try {
    fs.unlinkSync(normalizedPath);
    return true;
  } catch {
    return false;
  }
}

function readJsonFileSync(filePath, fallback = null) {
  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath) return fallback;
  try {
    return JSON.parse(fs.readFileSync(normalizedPath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFileSync(filePath, value) {
  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath) return false;
  ensureParentDirectorySync(normalizedPath);
  fs.writeFileSync(normalizedPath, JSON.stringify(value, null, 2), "utf8");
  return true;
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  const normalizedPath = String(filePath ?? "").trim();
  if (!normalizedPath) throw new Error("A JSON output path is required.");
  await fsp.mkdir(path.dirname(normalizedPath), { recursive: true });
  await fsp.writeFile(normalizedPath, JSON.stringify(value, null, 2), "utf8");
}

export {
  ensureDirectorySync,
  ensureParentDirectorySync,
  readJsonFile,
  readJsonFileSync,
  safeUnlinkSync,
  writeJsonFile,
  writeJsonFileSync,
};
