import { createLearnProfileApp } from "./src/app.js";
import { loadLearnProfileConfig } from "./src/config.js";

const app = await createLearnProfileApp({ config: loadLearnProfileConfig() });
await app.start();
