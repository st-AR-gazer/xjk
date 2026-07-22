import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeMkdir, safeRm, safeUnlink } from "../../../shared/backend/filesystem.js";
import { createTempCleanup } from "../../../shared/backend/lifecycle.js";
import { sendFileDownload } from "../../../shared/backend/responses.js";
import { sanitizeDownloadName } from "../../../shared/backend/values.js";
import { buildZipBuffer } from "../../../shared/backend/zip.js";
import { parseConversionOptions, stripMapExtension } from "./options.js";

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function ensureUniqueZipEntryName(name, usedNames) {
  const safe = sanitizeDownloadName(name);
  if (!usedNames.has(safe)) {
    usedNames.add(safe);
    return safe;
  }
  const extension = path.extname(safe);
  const base = safe.slice(0, safe.length - extension.length);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}${extension}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  const fallback = `${base}-${randomUUID().slice(0, 8)}${extension}`;
  usedNames.add(fallback);
  return fallback;
}

function inferOutputVariantLabel(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.includes("meshless")) return "Meshless";
  if (lower.includes("normal")) return "Normal";
  return null;
}

function makeBatchOutputName(originalName, suffix, variantRequest, outputFileName, outputIndex, outputCount) {
  const base = stripMapExtension(originalName).trim() || "map";
  const safeSuffix = String(suffix || "Underwater").trim() || "Underwater";
  let label = null;
  if (variantRequest === "both") {
    label = inferOutputVariantLabel(outputFileName);
    if (!label) label = outputCount > 1 ? `Output${outputIndex + 1}` : "Output";
  }
  return `${base}-${safeSuffix}${label ? `-${label}` : ""}.Map.Gbx`;
}

async function moveFile(sourcePath, destinationPath) {
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await fsp.rename(sourcePath, destinationPath);
  } catch {
    await fsp.copyFile(sourcePath, destinationPath);
    await fsp.unlink(sourcePath);
  }
}

function createBatchJobWorkflow({ runtime, logger = console }) {
  const { cleanupIntervalMs, jobsDir, maxStoredJobs, ttlMs } = runtime.jobConfig;
  const activeJobs = new Map();
  let maintenanceTimer = null;

  async function writeStatus(jobDir, status) {
    const output = { ...status, updatedAt: new Date().toISOString() };
    await fsp.writeFile(path.join(jobDir, "status.json"), JSON.stringify(output, null, 2), "utf8");
    return output;
  }

  async function readStatus(jobDir) {
    return JSON.parse(await fsp.readFile(path.join(jobDir, "status.json"), "utf8"));
  }

  async function processJob(jobDir, initialStatus) {
    const inputsDir = path.join(jobDir, "inputs");
    const workRoot = path.join(jobDir, "work");
    safeMkdir(workRoot);
    let status = await writeStatus(jobDir, { ...initialStatus, state: "processing" });
    const zipEntries = [];
    const usedNames = new Set();
    const errors = (status.rejectedFiles || []).map((item) => ({ name: item?.name, reason: item?.reason }));

    for (const file of status.files) {
      file.status = "processing";
      file.outputs = [];
      file.error = null;
      status = await writeStatus(jobDir, status);
      const itemWorkDir = path.join(workRoot, file.id);
      safeMkdir(itemWorkDir);
      const inputPath = path.join(inputsDir, file.storedName);
      try {
        const { stdout, stderr } = await runtime.run(
          [
            "make-underwater-map",
            inputPath,
            status.options.suffix,
            "--variant",
            status.options.variant,
            "--coverage",
            status.options.coverage,
          ],
          { cwd: itemWorkDir }
        );
        if (stdout?.trim()) logger.log(`tool stdout (${status.id}/${file.id}):\n${stdout}`);
        if (stderr?.trim()) logger.warn(`tool stderr (${status.id}/${file.id}):\n${stderr}`);
        const produced = (await fsp.readdir(itemWorkDir)).filter((item) => item.toLowerCase().endsWith(".gbx"));
        if (!produced.length) throw new Error("Conversion produced no output maps.");
        produced.sort((left, right) => left.localeCompare(right));
        produced.forEach((producedFile, index) => {
          const outputName = makeBatchOutputName(
            file.originalName,
            status.options.suffix,
            status.options.variant,
            producedFile,
            index,
            produced.length
          );
          const zipName = ensureUniqueZipEntryName(outputName, usedNames);
          zipEntries.push({ name: zipName, path: path.join(itemWorkDir, producedFile) });
          file.outputs.push(zipName);
        });
        file.status = "done";
        status.counts.ok += 1;
      } catch (error) {
        file.status = "error";
        file.error = String(error?.message || error);
        errors.push({ name: file.originalName, reason: file.error });
        status.counts.failed += 1;
      } finally {
        status.counts.done += 1;
        status = await writeStatus(jobDir, status);
      }
    }

    const errorsPath = path.join(jobDir, "errors.json");
    await fsp.writeFile(
      errorsPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), options: status.options, counts: status.counts, errors },
        null,
        2
      ),
      "utf8"
    );
    zipEntries.push({ name: "errors.json", path: errorsPath });
    const hasAnyMaps = zipEntries.some((entry) => entry.name.toLowerCase().endsWith(".gbx"));
    const zipBuffer = await buildZipBuffer(zipEntries, { sanitizeName: sanitizeDownloadName });
    await fsp.writeFile(path.join(jobDir, "result.zip"), zipBuffer);
    status.state = "done";
    if (!hasAnyMaps) status.message = "No maps were converted successfully.";
    else if (status.message) delete status.message;
    status.zip = {
      name: `underwater-${sanitizeDownloadName(status.options.suffix)}-${status.id.slice(0, 8)}.zip`,
      path: "result.zip",
      bytes: zipBuffer.length,
    };
    await writeStatus(jobDir, status);
    if (!runtime.config.keepFiles) {
      await safeRm(inputsDir);
      await safeRm(workRoot);
      await safeUnlink(errorsPath);
    }
  }

  function queue(jobDir, status, jobLease) {
    if (activeJobs.has(status.id)) {
      jobLease.release();
      return;
    }
    const promise = processJob(jobDir, status)
      .catch(async (error) => {
        logger.error(`Batch job failed (${status.id}):`, error);
        await writeStatus(jobDir, { ...status, state: "error", message: String(error?.message || error) }).catch(
          () => undefined
        );
        if (!runtime.config.keepFiles) {
          await safeRm(path.join(jobDir, "inputs"));
          await safeRm(path.join(jobDir, "work"));
        }
      })
      .finally(() => {
        activeJobs.delete(status.id);
        jobLease.release();
      });
    activeJobs.set(status.id, promise);
  }

  async function cleanupOldJobs() {
    const entries = await fsp.readdir(jobsDir, { withFileTypes: true }).catch(() => []);
    const now = Date.now();
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && isUuidLike(entry.name) && !activeJobs.has(entry.name))
        .map(async (entry) => {
          const jobDir = path.join(jobsDir, entry.name);
          const stat = await fsp.stat(jobDir).catch(() => null);
          if (stat && now - stat.mtimeMs > ttlMs) await safeRm(jobDir);
        })
    );
  }

  async function countStoredJobs() {
    const entries = await fsp.readdir(jobsDir, { withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isDirectory() && isUuidLike(entry.name)).length;
  }

  function startMaintenance() {
    if (runtime.config.keepFiles || maintenanceTimer) return maintenanceTimer;
    cleanupOldJobs().catch((error) => logger.warn("Job cleanup failed:", error));
    maintenanceTimer = setInterval(() => {
      cleanupOldJobs().catch((error) => logger.warn("Job cleanup failed:", error));
    }, cleanupIntervalMs);
    maintenanceTimer.unref?.();
    return maintenanceTimer;
  }

  function stopMaintenance() {
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }

  return {
    cleanupOldJobs,
    countStoredJobs,
    maxStoredJobs,
    queue,
    readStatus,
    startMaintenance,
    stopMaintenance,
    writeStatus,
  };
}

function registerBatchRoutes({ app, runtime, workflow }) {
  const { jobsDir, maxFileCount } = runtime.jobConfig;
  app.post(
    "/api/convert-batch",
    runtime.limiters.batch,
    runtime.admit,
    runtime.uploadBatch.array("maps", maxFileCount),
    runtime.enforceUploadBudget,
    async (req, res) => {
      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const rejectedFiles = Array.isArray(req.rejectedFiles) ? req.rejectedFiles : [];
      const cleanupUploads = createTempCleanup({ keepFiles: false, files: uploadedFiles.map((file) => file.path) });
      const options = parseConversionOptions(req.body);
      if (options.error) {
        await cleanupUploads();
        return res.status(400).json({ error: options.error });
      }
      if (!uploadedFiles.length) {
        return res.status(400).json({
          error: rejectedFiles.length ? "No valid map files uploaded." : "No files uploaded.",
          rejected: rejectedFiles,
        });
      }
      if (!runtime.config.keepFiles) await workflow.cleanupOldJobs();
      if ((await workflow.countStoredJobs()) >= workflow.maxStoredJobs) {
        await cleanupUploads();
        res.setHeader("Retry-After", "60");
        return res.status(503).json({
          error: "Batch result storage is currently full. Try again after older jobs expire.",
          code: "TOOL_JOB_STORAGE_FULL",
          retryAfterSeconds: 60,
        });
      }
      const jobId = randomUUID();
      const jobDir = path.join(jobsDir, jobId);
      const inputsDir = path.join(jobDir, "inputs");
      try {
        safeMkdir(inputsDir);
        const files = [];
        for (const file of uploadedFiles) {
          await moveFile(file.path, path.join(inputsDir, file.filename));
          files.push({
            id: randomUUID(),
            originalName: file.originalname,
            storedName: file.filename,
            status: "queued",
            outputs: [],
            error: null,
          });
        }
        const status = await workflow.writeStatus(jobDir, {
          id: jobId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          state: "queued",
          options,
          counts: {
            total: files.length + rejectedFiles.length,
            accepted: files.length,
            rejected: rejectedFiles.length,
            done: 0,
            ok: 0,
            failed: 0,
          },
          files,
          rejectedFiles,
          zip: null,
        });
        workflow.queue(jobDir, status, req.toolJobLease.retain());
        return res.status(202).json({
          jobId,
          statusUrl: `/api/batch/${jobId}/status`,
          downloadUrl: `/api/batch/${jobId}/download`,
        });
      } catch (error) {
        await cleanupUploads();
        await safeRm(jobDir);
        return res.status(500).json({ error: String(error?.message || error) });
      }
    }
  );

  app.get("/api/batch/:id/status", runtime.limiters.status, async (req, res) => {
    if (!isUuidLike(req.params.id)) return res.status(400).json({ error: "Invalid job id." });
    try {
      const status = await workflow.readStatus(path.join(jobsDir, req.params.id));
      res.setHeader("Cache-Control", "no-store");
      return res.json(status);
    } catch {
      return res.status(404).json({ error: "Job not found." });
    }
  });

  app.get("/api/batch/:id/download", runtime.limiters.status, async (req, res) => {
    if (!isUuidLike(req.params.id)) return res.status(400).json({ error: "Invalid job id." });
    const jobDir = path.join(jobsDir, req.params.id);
    const status = await workflow.readStatus(jobDir).catch(() => null);
    if (!status) return res.status(404).json({ error: "Job not found." });
    if (status.state !== "done" || !status.zip?.path) {
      return res.status(409).json({ error: "Job not finished yet.", state: status.state, counts: status.counts });
    }
    const zipPath = path.join(jobDir, status.zip.path);
    if (
      !(await fsp.access(zipPath).then(
        () => true,
        () => false
      ))
    ) {
      return res.status(404).json({ error: "Zip not found." });
    }
    return sendFileDownload({
      res,
      filePath: zipPath,
      downloadName: status.zip.name,
      contentType: "application/zip",
      errorMessage: "Failed to read zip file.",
      cleanup: runtime.config.keepFiles ? undefined : () => safeRm(jobDir),
    });
  });
}

export { createBatchJobWorkflow, ensureUniqueZipEntryName, isUuidLike, makeBatchOutputName, registerBatchRoutes };
