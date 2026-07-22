import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeMkdir, safeUnlink } from "../../../shared/backend/filesystem.js";
import { createUploadErrorHandler } from "../../../shared/backend/http.js";
import { createTempCleanup } from "../../../shared/backend/lifecycle.js";
import { sendBufferDownload, sendFileDownload } from "../../../shared/backend/responses.js";
import { parseBool } from "../../../shared/backend/values.js";
import { buildZipBuffer } from "../../../shared/backend/zip.js";
import {
  buildManifestDownloadName,
  buildZipDownloadName,
  createClipWorkflow,
  parseTemplateMode,
} from "./clipWorkflow.js";
import { createClipRuntime } from "./runtime.js";
import { createUploadStore, sanitizeDownloadName } from "./uploadStore.js";

function missingMapResponse(req, res) {
  if (req.body?.uploadId) return res.status(404).json({ error: "uploadId was not found or has expired." });
  return res.status(400).json({ error: "Map file is required (multipart 'map', JSON 'mapBase64', or 'uploadId')." });
}

function createClipApp({ metaUrl, env = process.env, logger = console } = {}) {
  const runtime = createClipRuntime({ metaUrl, env });
  const uploadStore = createUploadStore({ runtime, logger });
  const workflow = createClipWorkflow(runtime);
  const { app, config } = runtime;

  app.post(
    "/api/upload-map",
    runtime.uploadLimiter,
    runtime.admit,
    runtime.express.raw({ type: () => true, limit: `${config.maxFileMb}mb` }),
    async (req, res) => {
      try {
        const stored = await uploadStore.materializeRaw(req);
        return res.status(200).json({ ok: true, uploadId: stored.uploadId, fileName: stored.originalname });
      } catch (error) {
        if (error?.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
        return res.status(error?.statusCode || 400).json({
          error: String(error?.message || error),
          ...(error?.code ? { code: error.code } : {}),
          ...(error?.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        });
      }
    }
  );

  app.post(
    "/api/inspect",
    runtime.admit,
    runtime.upload.fields([{ name: "map", maxCount: 1 }]),
    runtime.enforceUploadBudget,
    async (req, res) => {
      let mapFile = null;
      try {
        mapFile = await uploadStore.fromRequest(req);
        if (!mapFile) return missingMapResponse(req, res);
        const requestId = randomUUID();
        const manifestPath = path.join(runtime.paths.workDir, `${requestId}-inspect.manifest.json`);
        const cleanup = createTempCleanup({
          keepFiles: config.keepFiles,
          files: [mapFile.transient ? mapFile.path : null, manifestPath],
        });
        try {
          const { code, stdout, stderr, manifest } = await workflow.inspect({
            mapPath: mapFile.path,
            manifestPath,
            selection: req.body,
          });
          if (code === 0 && manifest) {
            return res.status(200).json({
              ok: true,
              toolExitCode: code,
              manifest,
              stdout: stdout.trim() || null,
              stderr: stderr.trim() || null,
            });
          }
          const message = stderr.trim() || stdout.trim() || "Clip inspection failed.";
          if (code === 3) return res.status(404).json({ error: message, toolExitCode: code });
          return res.status(code === 1 || code === 2 ? 400 : 500).json({
            error: message,
            toolExitCode: code,
            manifest: manifest || null,
          });
        } finally {
          await cleanup();
        }
      } catch (error) {
        if (mapFile?.transient) await safeUnlink(mapFile.path);
        return res.status(error?.statusCode || 500).json({ error: String(error?.message || error) });
      }
    }
  );

  app.post(
    "/api/export",
    runtime.admit,
    runtime.upload.fields([
      { name: "map", maxCount: 1 },
      { name: "templateGhost", maxCount: 1 },
    ]),
    runtime.enforceUploadBudget,
    async (req, res) => {
      let mapFile = null;
      const templateGhostFile = req.files?.templateGhost?.[0];
      try {
        mapFile = await uploadStore.fromRequest(req);
        if (!mapFile) {
          await safeUnlink(templateGhostFile?.path);
          return missingMapResponse(req, res);
        }
        const templateMode = parseTemplateMode(req.body?.templateMode);
        if (templateMode === "custom" && !templateGhostFile) {
          if (mapFile.transient) await safeUnlink(mapFile.path);
          return res.status(400).json({ error: "Custom template mode requires a template ghost file." });
        }
        const includeManifest = parseBool(req.body?.includeManifest, true);
        const requestId = randomUUID();
        const workDir = path.join(runtime.paths.workDir, requestId);
        safeMkdir(workDir);
        const manifestPath = path.join(workDir, "clip-to-ghost.manifest.json");
        const cleanup = createTempCleanup({
          keepFiles: config.keepFiles,
          files: [mapFile.transient ? mapFile.path : null, templateGhostFile?.path],
          directories: [workDir],
        });
        try {
          const { code, stdout, stderr, manifest, ghosts } = await workflow.exportGhosts({
            mapPath: mapFile.path,
            manifestPath,
            selection: req.body,
            templateGhostPath: templateGhostFile?.path,
            templateMode,
            workDir,
          });
          if (!ghosts.length) {
            await cleanup();
            const message = stderr.trim() || stdout.trim() || "No ghosts were exported.";
            const statusCode = code === 3 ? 404 : 500;
            return res.status(statusCode).json({ error: message, toolExitCode: code, manifest: manifest || null });
          }
          if (ghosts.length === 1 && code === 0 && !includeManifest) {
            return sendFileDownload({
              res,
              filePath: ghosts[0].path,
              downloadName: ghosts[0].name,
              sanitizeName: sanitizeDownloadName,
              cleanup,
              errorMessage: "Failed to read output ghost.",
            });
          }
          const zipEntries = ghosts.map((ghost) => ({ name: ghost.name, path: ghost.path }));
          if (manifest && (includeManifest || ghosts.length > 1 || code !== 0)) {
            zipEntries.push({ name: buildManifestDownloadName(mapFile.originalname), path: manifestPath });
          }
          const zipBuffer = await buildZipBuffer(zipEntries, { sanitizeName: sanitizeDownloadName });
          sendBufferDownload({
            res,
            buffer: zipBuffer,
            downloadName: buildZipDownloadName(mapFile.originalname),
            sanitizeName: sanitizeDownloadName,
          });
          await cleanup();
        } catch (error) {
          await cleanup();
          return res.status(500).json({ error: String(error?.message || error) });
        }
      } catch (error) {
        if (mapFile?.transient) await safeUnlink(mapFile.path);
        await safeUnlink(templateGhostFile?.path);
        return res.status(error?.statusCode || 500).json({ error: String(error?.message || error) });
      }
    }
  );

  app.use(
    createUploadErrorHandler({
      multer: runtime.multer,
      maxFileMb: config.maxFileMb,
      entityTooLargeMessage: `request entity too large (JSON limit ${runtime.jsonLimitMb} MB, decoded file limit ${config.maxFileMb} MB). Increase JSON_LIMIT_MB and/or MAX_FILE_MB on the Clip-To-Ghost backend.`,
    })
  );
  return { app, runtime, uploadStore, workflow };
}

export { createClipApp, missingMapResponse };
