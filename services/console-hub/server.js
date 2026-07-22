import { createConsoleHubApp } from "./src/app.js";
import { loadConsoleHubConfig } from "./src/config.js";

const app = await createConsoleHubApp({ config: loadConsoleHubConfig() });
await app.start();
