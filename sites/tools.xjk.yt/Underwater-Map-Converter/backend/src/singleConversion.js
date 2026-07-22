import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeMkdir } from "../../../shared/backend/filesystem.js";
import { createTempCleanup } from "../../../shared/backend/lifecycle.js";
import { sendBufferDownload, sendFileDownload } from "../../../shared/backend/responses.js";
import { sanitizeDownloadName } from "../../../shared/backend/values.js";
import { buildZipBuffer } from "../../../shared/backend/zip.js";
import { makeDownloadName, parseConversionOptions, stripMapExtension } from "./options.js";

function registerSingleConversionRoute({ app, runtime, logger = console }) {
  app.post(
    "/api/convert",
    runtime.limiters.single,
    runtime.admit,
    runtime.uploadSingle.single("map"),
    runtime.enforceUploadBudget,
    async (req, res) => {
      const uploaded = req.file;
      if (!uploaded) return res.status(400).json({ error: "No file uploaded." });
      const inputPath = uploaded.path;
      const cleanupUpload = createTempCleanup({ keepFiles: false, files: [inputPath] });
      const requestId = randomUUID();
      const options = parseConversionOptions(req.body);
      if (options.error) {
        await cleanupUpload();
        return res.status(400).json({ error: options.error });
      }
      const { variant, coverage, suffix } = options;
      const workDir = path.join(runtime.config.outputDir, requestId);
      safeMkdir(workDir);
      const workInputPath = path.join(workDir, path.basename(inputPath));
      const cleanup = createTempCleanup({
        keepFiles: runtime.config.keepFiles,
        files: [inputPath],
        directories: [workDir],
      });

      try {
        await fsp.copyFile(inputPath, workInputPath);
        const { stdout, stderr } = await runtime.run(
          ["make-underwater-map", workInputPath, suffix, "--variant", variant, "--coverage", coverage],
          { cwd: workDir }
        );
        if (stdout?.trim()) logger.log(`tool stdout (${requestId}):\n${stdout}`);
        if (stderr?.trim()) logger.warn(`tool stderr (${requestId}):\n${stderr}`);
        const produced = (await fsp.readdir(workDir)).filter(
          (file) => file !== path.basename(workInputPath) && file.toLowerCase().endsWith(".gbx")
        );
        if (produced.length === 0) throw new Error("Conversion produced no output maps.");
        if (produced.length === 1) {
          return sendFileDownload({
            res,
            filePath: path.join(workDir, produced[0]),
            downloadName: makeDownloadName(uploaded.originalname, suffix),
            cleanup,
          });
        }
        const zipBuffer = await buildZipBuffer(
          produced.map((file) => ({ name: file, path: path.join(workDir, file) })),
          { sanitizeName: sanitizeDownloadName }
        );
        sendBufferDownload({
          res,
          buffer: zipBuffer,
          downloadName: `${stripMapExtension(uploaded.originalname)}-${suffix}.zip`,
        });
        await cleanup();
      } catch (error) {
        logger.error("Processing failed:", error);
        await cleanup();
        res.status(500).json({ error: String(error?.message || error) });
      }
    }
  );
}

export { registerSingleConversionRoute };
