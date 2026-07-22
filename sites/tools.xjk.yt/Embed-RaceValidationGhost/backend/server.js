import { startToolServerIfMain } from "../../shared/backend/http.js";
import { createEmbedApp } from "./src/app.js";

const { app, runtime } = createEmbedApp({ metaUrl: import.meta.url });
startToolServerIfMain(import.meta.url, {
  app,
  port: runtime.config.port,
  details: [
    `TOOL_PATH=${runtime.config.toolPath}`,
    `REPLAY_EXTRACT_TOOL_PATH=${runtime.replayExtractToolPath}`,
    runtime.resolvedGbxlzoPath
      ? `GBXLZO_PATH=${runtime.resolvedGbxlzoPath}`
      : "GBXLZO_PATH could not be auto-resolved; embed may fail unless gbxlzo.exe is on PATH.",
    `UPLOAD_DIR=${runtime.config.uploadDir}`,
    `OUTPUT_DIR=${runtime.config.outputDir}`,
  ],
});

export { app };
