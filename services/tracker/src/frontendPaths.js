import path from "node:path";

export function resolveTrackerSharedFrontendDir(frontendDir) {
  const modeDirectory = path.resolve(String(frontendDir || ""));
  const runtimeDirectory = path.dirname(modeDirectory);
  const sharedDirectory = path.join(runtimeDirectory, "shared");

  if (path.dirname(sharedDirectory) !== runtimeDirectory) {
    throw new Error("Tracker shared frontend directory escaped the runtime root.");
  }

  return sharedDirectory;
}
