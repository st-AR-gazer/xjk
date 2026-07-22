import path from "node:path";
import { parseEnvFile } from "../envUtils.js";

export function loadEnvFile(filePath) {
  for (const [key, value] of Object.entries(parseEnvFile(filePath))) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined && String(process.env[key]).trim() !== "") continue;
    process.env[key] = value;
  }
}

export function parseList(value) {
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

export function normalizePath(value, fallback, baseDir = process.cwd()) {
  const raw = String(value || "").trim();
  const candidate = raw || fallback;
  return path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate);
}
