import { safeRm, safeUnlink } from "./filesystem.js";

export function createTempCleanup({
  keepFiles = false,
  files = [],
  directories = [],
  unlink = safeUnlink,
  removeDirectory = safeRm,
} = {}) {
  let cleanupPromise;

  return function cleanup() {
    if (keepFiles) return Promise.resolve();
    if (!cleanupPromise) {
      cleanupPromise = Promise.all([
        ...files.filter(Boolean).map((filePath) => unlink(filePath)),
        ...directories.filter(Boolean).map((directory) => removeDirectory(directory)),
      ]).then(() => undefined);
    }
    return cleanupPromise;
  };
}
