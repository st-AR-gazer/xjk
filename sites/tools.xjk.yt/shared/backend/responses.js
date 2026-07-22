import fs from "node:fs";
import { parseJsonSafe } from "../../../../services/shared/valueUtils.js";
import { sanitizeDownloadName } from "./values.js";

export function sendJsonToolResult({
  res,
  code,
  outputText,
  stdout = "",
  stderr = "",
  resultKey = "result",
  processName = "Tool",
}) {
  const parsed = parseJsonSafe(outputText || stdout || "");
  if (!parsed) {
    const error =
      code === 0 ? `${processName} did not return valid JSON output.` : `${processName} failed with exit code ${code}.`;
    return res.status(500).json({ error, stderr: stderr || null });
  }

  return res.status(200).json({
    ok: true,
    toolExitCode: code,
    [resultKey]: parsed,
    stderr: stderr?.trim() || null,
  });
}

export async function runJsonToolRequest({
  res,
  run,
  readOutput = async () => "",
  cleanup = async () => undefined,
  resultKey = "result",
  processName = "Tool",
}) {
  try {
    const { code, stdout, stderr } = await run();
    return sendJsonToolResult({
      res,
      code,
      outputText: await readOutput(),
      stdout,
      stderr,
      resultKey,
      processName,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error) });
  } finally {
    await cleanup();
  }
}

export function sendBufferDownload({
  res,
  buffer,
  downloadName,
  contentType = "application/zip",
  sanitizeName = sanitizeDownloadName,
}) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeName(downloadName)}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}

export function sendFileDownload({
  res,
  filePath,
  downloadName,
  cleanup = () => undefined,
  errorMessage = "Failed to read output file.",
  contentType = "application/octet-stream",
  sanitizeName = sanitizeDownloadName,
  createReadStream = fs.createReadStream,
  logger = console,
}) {
  let cleanupPromise;
  const runCleanup = () => {
    cleanupPromise ||= Promise.resolve().then(cleanup);
    return cleanupPromise;
  };

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeName(downloadName)}"`);

  const stream = createReadStream(filePath);
  stream.on("error", async (error) => {
    logger.error("ReadStream error:", error);
    if (!res.headersSent) res.status(500);
    res.end(errorMessage);
    await runCleanup();
  });

  stream.pipe(res);
  res.once("finish", runCleanup);
  res.once("close", runCleanup);
  return stream;
}
