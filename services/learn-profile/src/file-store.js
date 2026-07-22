import fsp from "node:fs/promises";

export function createLearnFileStore({ config, paths, logger = console } = {}) {
  async function ensureDataDir() {
    await fsp.mkdir(config.dataDir, { recursive: true });
  }

  async function readJson(filePath, fallback = null) {
    try {
      return JSON.parse(await fsp.readFile(filePath, "utf8"));
    } catch {
      return fallback;
    }
  }

  async function readText(filePath, fallback = null) {
    try {
      return await fsp.readFile(filePath, "utf8");
    } catch {
      return fallback;
    }
  }

  async function writeJsonAtomic(filePath, payload, { trailingNewline = false } = {}) {
    await ensureDataDir();
    const temporaryPath = `${filePath}.tmp`;
    const suffix = trailingNewline ? "\n" : "";
    await fsp.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}${suffix}`);
    await fsp.rename(temporaryPath, filePath);
  }

  async function appendJsonLine(filePath, payload) {
    await ensureDataDir();
    await fsp.appendFile(filePath, `${JSON.stringify(payload)}\n`);
  }

  async function readJsonLines(filePath, { limit = 0, reverse = false } = {}) {
    let raw = "";
    try {
      raw = await fsp.readFile(filePath, "utf8");
    } catch {
      return [];
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    let values = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (limit > 0) values = values.slice(-limit);
    return reverse ? values.reverse() : values;
  }

  async function auditAdmin(actor, action, detail = {}) {
    try {
      await appendJsonLine(paths.auditFile, {
        at: new Date().toISOString(),
        action,
        actor: actor
          ? {
              id: actor.id || null,
              username: actor.username || actor.displayName || null,
              role: actor.role || null,
            }
          : null,
        detail,
      });
    } catch (error) {
      logger.warn(`[learn-admin] failed to write audit log: ${error?.message || error}`);
    }
  }

  return {
    paths,
    ensureDataDir,
    readText,
    readJson,
    writeJsonAtomic,
    appendJsonLine,
    readJsonLines,
    auditAdmin,
  };
}
