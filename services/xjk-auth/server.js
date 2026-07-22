import path from "node:path";
import { pathToFileURL } from "node:url";
import { createXjkAuthRuntime } from "./src/runtime.js";

const runtime = createXjkAuthRuntime();
const { config, handleRequest, server, startServer } = runtime;

const directEntryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (directEntryUrl === import.meta.url) startServer();

export { config, handleRequest, server, startServer };
