import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createUploadErrorHandler } from "../../../shared/backend/http.js";
import { createTempCleanup } from "../../../shared/backend/lifecycle.js";
import { sendFileDownload } from "../../../shared/backend/responses.js";
import { isTrackmaniaReplayFilename } from "../../../shared/backend/uploads.js";
import { safeUnlink } from "../../../shared/backend/filesystem.js";
import { makeEmbeddedMapDownloadName, processedFilePath } from "./fileNames.js";
import { createReplayInspector, parseNonNegativeInt } from "./replayInspection.js";
import { createEmbedRuntime } from "./runtime.js";

async function tryCopy(sourcePath, destinationPath, logger) {
  try {
    await fsp.copyFile(sourcePath, destinationPath);
  } catch (error) {
    logger.warn(`copy failed (${sourcePath} -> ${destinationPath}):`, error);
  }
}

function createEmbedApp({ metaUrl, env = process.env, logger = console } = {}) {
  const runtime = createEmbedRuntime({ metaUrl, env });
  const replayInspector = createReplayInspector({ runtime, logger });
  const { app, config, paths } = runtime;

  app.post(
    "/api/inspect-replay",
    runtime.admit,
    runtime.replayInspectUpload.single("replay"),
    runtime.enforceUploadBudget,
    async (req, res) => {
      const replayFile = req.file;
      if (!replayFile) return res.status(400).json({ error: "No replay file uploaded." });
      try {
        const replay = await replayInspector.inspect(replayFile.path, randomUUID());
        if (!replay || replay.ghostCount < 1) throw new Error("Replay file contains zero ghosts.");
        return res.status(200).json({ ok: true, inputKind: "replay", replay, selectedGhostIndex: 0 });
      } catch (error) {
        return res.status(500).json({ error: String(error?.message || error) });
      } finally {
        await safeUnlink(replayFile.path);
      }
    }
  );

  app.post(
    "/api/embed",
    runtime.admit,
    runtime.embedUpload.fields([
      { name: "map", maxCount: 1 },
      { name: "source", maxCount: 1 },
    ]),
    runtime.enforceUploadBudget,
    async (req, res) => {
      const mapFile = req.files?.map?.[0];
      const sourceFile = req.files?.source?.[0];
      if (!mapFile || !sourceFile) {
        await Promise.all([safeUnlink(mapFile?.path), safeUnlink(sourceFile?.path)]);
        return res.status(400).json({ error: "Both files are required: one map and one ghost/replay source file." });
      }
      const sourceKindValue = String(req.body?.sourceKind || "")
        .trim()
        .toLowerCase();
      const sourceKind =
        sourceKindValue === "replay"
          ? "replay"
          : sourceKindValue === "ghost"
            ? "ghost"
            : isTrackmaniaReplayFilename(sourceFile.originalname)
              ? "replay"
              : "ghost";
      const selectedGhostIndex = sourceKind === "replay" ? parseNonNegativeInt(req.body?.ghostIndex, 0) : 0;
      const requestId = randomUUID();
      const outputPath = path.join(paths.workDir, `${requestId}.Map.Gbx`);
      const cleanup = createTempCleanup({
        keepFiles: config.keepFiles,
        files: [mapFile.path, sourceFile.path, outputPath],
      });
      try {
        const { stdout, stderr } = await runtime.runEmbedTool(
          mapFile.path,
          sourceFile.path,
          outputPath,
          selectedGhostIndex
        );
        if (stdout?.trim()) logger.log(`embed stdout (${requestId}):\n${stdout}`);
        if (stderr?.trim()) logger.warn(`embed stderr (${requestId}):\n${stderr}`);
        if (config.keepFiles) {
          const copyJobs = [
            tryCopy(
              outputPath,
              processedFilePath(paths.processedMapsDir, requestId, mapFile.originalname, "map"),
              logger
            ),
          ];
          const sourceDirectory = sourceKind === "replay" ? paths.processedReplaysDir : paths.processedGhostsDir;
          copyJobs.push(
            tryCopy(
              sourceFile.path,
              processedFilePath(sourceDirectory, requestId, sourceFile.originalname, sourceKind),
              logger
            )
          );
          await Promise.all(copyJobs);
        }
        return sendFileDownload({
          res,
          filePath: outputPath,
          downloadName: makeEmbeddedMapDownloadName(
            mapFile.originalname,
            sourceKind === "replay" ? selectedGhostIndex : null
          ),
          cleanup,
          errorMessage: "Failed to read embedded map.",
        });
      } catch (error) {
        await cleanup();
        return res.status(500).json({ error: String(error?.message || error) });
      }
    }
  );

  app.use(
    createUploadErrorHandler({
      multer: runtime.multer,
      maxFileMb: config.maxFileMb,
      fileTooLargeMessage: `File too large. Max size is ${config.maxFileMb} MB per file.`,
    })
  );
  return { app, runtime };
}

export { createEmbedApp, tryCopy };
