import fs from "node:fs";
import { spawn } from "node:child_process";

export function runProcess({
  executable,
  args = [],
  timeoutMs,
  label = "Tool",
  pathLabel = "TOOL_PATH",
  rejectOnNonZero = true,
  cwd,
  env,
  maxOutputBytes = 8 * 1024 * 1024,
  spawnProcess = spawn,
}) {
  return new Promise((resolve, reject) => {
    if (!executable) {
      reject(new Error(`${pathLabel} is not set.`));
      return;
    }
    if (!fs.existsSync(executable)) {
      reject(new Error(`${label} not found at: ${executable}`));
      return;
    }

    const child = spawnProcess(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";
    let capturedBytes = 0;
    let settled = false;
    const runtime = { timer: null };
    const outputLimit = Math.max(1, Number(maxOutputBytes) || 8 * 1024 * 1024);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (runtime.timer) clearTimeout(runtime.timer);
      callback();
    };

    const capture = (streamName, data) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
      capturedBytes += chunk.length;
      if (capturedBytes > outputLimit) {
        try {
          child.kill("SIGKILL");
        } catch {}
        finish(() => reject(new Error(`${label} exceeded the ${outputLimit}-byte output limit.`)));
        return;
      }
      if (streamName === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
    };

    child.stdout.on("data", (data) => capture("stdout", data));
    child.stderr.on("data", (data) => capture("stderr", data));

    runtime.timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      finish(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (rejectOnNonZero && code !== 0) {
          reject(new Error(`${label} exited with code ${code}\n${stderr || stdout}`));
          return;
        }
        resolve({ code, stdout, stderr });
      });
    });
  });
}
