import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function normalizePid(value) {
  const pid = Number(value);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function normalizePathForComparison(value, platform = process.platform) {
  const normalized = String(value || "")
    .trim()
    .replaceAll("/", path.sep)
    .replaceAll("\\", path.sep);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function readWindowsProcessIdentity(pid, { spawn = spawnSync } = {}) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `try { $process = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if ($null -eq $process) { exit 3 }; $identity = [ordered]@{ pid = [int]$process.ProcessId; executable = [string]$process.ExecutablePath; commandLine = [string]$process.CommandLine; createdAt = $process.CreationDate.ToUniversalTime().ToString('o') } } catch { $process = Get-Process -Id ${pid} -ErrorAction Stop; $identity = [ordered]@{ pid = [int]$process.Id; executable = [string]$process.Path; commandLine = ''; createdAt = $process.StartTime.ToUniversalTime().ToString('o') } }`,
    "$identity | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !String(result.stdout || "").trim()) return null;
  try {
    return JSON.parse(String(result.stdout).trim());
  } catch {
    return null;
  }
}

function readProcProcessIdentity(pid, { readFile = fs.readFileSync, readLink = fs.readlinkSync } = {}) {
  try {
    const stat = String(readFile(`/proc/${pid}/stat`, "utf8"));
    const commandLine = String(readFile(`/proc/${pid}/cmdline`, "utf8"))
      .replaceAll("\0", " ")
      .trim();
    const closingParenthesis = stat.lastIndexOf(")");
    const fieldsAfterName = stat.slice(closingParenthesis + 2).split(/\s+/);
    const startTicks = fieldsAfterName[19];
    if (!startTicks) return null;
    return {
      pid,
      executable: String(readLink(`/proc/${pid}/exe`)),
      commandLine,
      createdAt: `proc-start-ticks:${startTicks}`,
    };
  } catch {
    return null;
  }
}

function readPosixProcessIdentity(pid, { spawn = spawnSync } = {}) {
  const result = spawn("ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const output = String(result.stdout || "").trim();
  if (result.error || result.status !== 0 || !output) return null;
  const match = output.match(/^(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/s);
  if (!match) return null;
  const commandLine = match[2].trim();
  return {
    pid,
    executable: commandLine.split(/\s+/)[0] || "",
    commandLine,
    createdAt: match[1],
  };
}

function readProcessIdentity(
  value,
  { platform = process.platform, spawn = spawnSync, readFile = fs.readFileSync, readLink = fs.readlinkSync } = {}
) {
  const pid = normalizePid(value);
  if (!pid) return null;
  const identity =
    platform === "win32"
      ? readWindowsProcessIdentity(pid, { spawn })
      : platform === "linux"
        ? readProcProcessIdentity(pid, { readFile, readLink })
        : readPosixProcessIdentity(pid, { spawn });
  if (!identity) return null;
  const executable = String(identity.executable || "").trim();
  const commandLine = String(identity.commandLine || "").trim();
  const createdAt = String(identity.createdAt || "").trim();
  if (!executable || !createdAt) return null;
  return { pid, executable, commandLine, createdAt };
}

function buildManagedProcessIdentity({ pid, entrypoint, runId, runNonce, ...identity } = {}) {
  const safePid = normalizePid(pid ?? identity.pid);
  const normalized = {
    pid: safePid,
    executable: String(identity.executable || "").trim(),
    commandLine: String(identity.commandLine || "").trim(),
    createdAt: String(identity.createdAt || "").trim(),
    entrypoint: String(entrypoint || "").trim(),
    runId: String(runId || "").trim(),
    runNonce: String(runNonce || "").trim(),
  };
  return [
    normalized.pid,
    normalized.executable,
    normalized.commandLine,
    normalized.createdAt,
    normalized.entrypoint,
    normalized.runId,
    normalized.runNonce,
  ].every(Boolean)
    ? normalized
    : null;
}

function managedProcessIdentityMatches(actual, expected, { platform = process.platform } = {}) {
  if (!actual || !expected) return false;
  const actualPid = normalizePid(actual.pid);
  const expectedPid = normalizePid(expected.pid);
  if (!actualPid || actualPid !== expectedPid) return false;

  const expectedExecutable = normalizePathForComparison(expected.executable, platform);
  const actualExecutable = normalizePathForComparison(actual.executable, platform);
  if (!expectedExecutable || actualExecutable !== expectedExecutable) return false;
  if (!expected.createdAt || String(actual.createdAt || "") !== String(expected.createdAt)) return false;

  const commandLine = normalizePathForComparison(actual.commandLine, platform);
  const entrypoint = normalizePathForComparison(expected.entrypoint, platform);
  const runId = normalizePathForComparison(expected.runId, platform);
  const runNonce = normalizePathForComparison(expected.runNonce, platform);
  if (!entrypoint || !runId || !runNonce) return false;
  if (!commandLine) return false;
  if (!commandLine.includes(entrypoint)) return false;
  if (!commandLine.includes(runId)) return false;
  return commandLine.includes(runNonce);
}

export { buildManagedProcessIdentity, managedProcessIdentityMatches, normalizePathForComparison, readProcessIdentity };
