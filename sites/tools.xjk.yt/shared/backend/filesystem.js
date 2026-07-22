import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export function firstExistingPath(paths) {
  for (const candidate of paths) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return "";
}

export function safeMkdir(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

export async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

export async function safeRm(targetPath) {
  if (!targetPath) return;
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {}
}

export async function readTextFileWithinLimit(
  filePath,
  { maxBytes = 8 * 1024 * 1024, encoding = "utf8", missingValue } = {}
) {
  const byteLimit = Math.max(1, Number(maxBytes) || 8 * 1024 * 1024);
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > byteLimit) {
      const error = new Error(`Generated output exceeds the ${byteLimit}-byte limit.`);
      error.code = "OUTPUT_FILE_TOO_LARGE";
      throw error;
    }

    const buffer = await fsp.readFile(filePath);
    if (buffer.length > byteLimit) {
      const error = new Error(`Generated output exceeds the ${byteLimit}-byte limit.`);
      error.code = "OUTPUT_FILE_TOO_LARGE";
      throw error;
    }
    return buffer.toString(encoding);
  } catch (error) {
    if (error?.code === "ENOENT" && missingValue !== undefined) return missingValue;
    throw error;
  }
}
