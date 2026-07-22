import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readArgument(name, fallback = "", argv = process.argv) {
  const prefix = `--${name}=`;
  const argument = argv.find((value) => String(value).startsWith(prefix));
  return argument ? String(argument).slice(prefix.length) : fallback;
}

function hasFlag(name, argv = process.argv) {
  return argv.includes(`--${name}`);
}

function normalizeProjectKey(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function resolveDatabasePath({ argumentName, environmentName, fileName, argv = process.argv, env = process.env }) {
  const dataRoot =
    String(env.XJK_ALTERED_DATA_ROOT || "").trim() || path.join(repoRoot, "sites", "altered.xjk.yt", "data");
  const configuredPath = readArgument(argumentName, String(env[environmentName] || "").trim(), argv);
  return path.resolve(configuredPath || path.join(dataRoot, fileName));
}

export { hasFlag, normalizeProjectKey, readArgument, repoRoot, resolveDatabasePath };
