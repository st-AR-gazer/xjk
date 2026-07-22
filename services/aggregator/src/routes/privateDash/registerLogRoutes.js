import { clampInt } from "../../../../shared/valueUtils.js";
import { collectServiceLogs, readLogTail } from "./logFiles.js";

function registerLogRoutes(router, { logDir }) {
  router.get("/logs/services", async (req, res) => {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const result = await collectServiceLogs(logDir);
    if (result.error) return res.status(503).json({ error: result.error, logDir: result.logDir });

    const services = Array.isArray(result.services)
      ? result.services.filter(
          (item) =>
            !q ||
            String(item.service || "")
              .toLowerCase()
              .includes(q)
        )
      : [];
    return res.json({
      generatedAt: new Date().toISOString(),
      logDir: result.logDir,
      services: services.map((item) => ({
        service: item.service,
        hasOut: Boolean(item.hasOut),
        hasError: Boolean(item.hasError),
        outSizeBytes: Number(item.outSizeBytes || 0),
        errorSizeBytes: Number(item.errorSizeBytes || 0),
        outUpdatedAt: item.outUpdatedAt || null,
        errorUpdatedAt: item.errorUpdatedAt || null,
      })),
      count: services.length,
    });
  });

  router.get("/logs/service/:service", async (req, res) => {
    const stream = String(req.query.stream || "out")
      .trim()
      .toLowerCase();
    if (stream !== "out" && stream !== "error") {
      return res.status(400).json({ error: "Invalid stream. Use 'out' or 'error'." });
    }

    const requestedService = String(req.params.service || "")
      .trim()
      .toLowerCase();
    if (!requestedService) return res.status(400).json({ error: "Missing service." });

    const lines = clampInt(req.query.lines, { min: 10, max: 2000, fallback: 200 });
    const result = await collectServiceLogs(logDir);
    if (result.error) return res.status(503).json({ error: result.error, logDir: result.logDir });

    const service = (result.services || []).find(
      (item) =>
        String(item.service || "")
          .trim()
          .toLowerCase() === requestedService
    );
    if (!service) return res.status(404).json({ error: "Service logs not found." });

    const filePath = service.files?.[stream];
    if (!filePath) return res.status(404).json({ error: `No ${stream} log for this service.` });

    try {
      const tail = await readLogTail(filePath, { lines });
      return res.json({
        generatedAt: new Date().toISOString(),
        logDir: result.logDir,
        service: service.service,
        stream,
        lines: tail.lines,
        lineCount: tail.lines.length,
        truncated: Boolean(tail.truncated),
        totalSizeBytes: Number(tail.totalSizeBytes || 0),
      });
    } catch (error) {
      return res.status(500).json({ error: `Failed to read log: ${error?.message || "unknown error"}` });
    }
  });
}

export { registerLogRoutes };
