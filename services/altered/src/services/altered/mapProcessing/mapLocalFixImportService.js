import { createHash, fs, path, buildLocalMapFixRelativePath, toText } from "../serviceSupport.js";

class MapLocalFixImportService {
  constructor({ repository, getMapNameWorkspaceService, getLocalMapFileAbsolutePath, ensureMapContentSignatures }) {
    this.repository = repository;
    this.getMapNameWorkspaceService = getMapNameWorkspaceService;
    this.getLocalMapFileAbsolutePath = getLocalMapFileAbsolutePath;
    this.ensureMapContentSignatures = ensureMapContentSignatures;
  }

  async importMapLocalFileFix({ mapUid, sourceFilePath, note = "", recomputeSimilarity = true } = {}) {
    const uid = toText(mapUid);
    if (!uid) return { error: "mapUid is required." };

    const safeSourceFilePath = toText(sourceFilePath);
    if (!safeSourceFilePath) return { error: "sourceFilePath is required." };

    const mapInfo = this.repository.maps.getMapInfo(uid);
    if (!mapInfo?.exists || !mapInfo.map) {
      return { error: "Map not found." };
    }

    let sourceStat = null;
    try {
      sourceStat = await fs.stat(safeSourceFilePath);
    } catch (error) {
      return {
        error: `Source file could not be read: ${error?.message || error}`,
      };
    }
    if (!sourceStat?.isFile?.()) {
      return { error: "sourceFilePath must point to a file." };
    }

    const buffer = await fs.readFile(safeSourceFilePath);
    const relativePath = buildLocalMapFixRelativePath(uid, safeSourceFilePath);
    const absolutePath = this.getLocalMapFileAbsolutePath(uid, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, absolutePath);

    const now = new Date().toISOString();
    const fileSha256 = createHash("sha256").update(buffer).digest("hex");
    const fixRecord = {
      mapUid: uid,
      relativePath,
      sourceFilePath: safeSourceFilePath,
      fileSha256,
      fileSizeBytes: buffer.length,
      importedAt: now,
      verifiedAt: now,
      status: "ready",
      note: toText(note) || null,
      lastError: null,
    };

    const fixUpsert = this.repository.mapFiles.upsertMapLocalFileFixes({
      records: [fixRecord],
    });
    if (fixUpsert?.error) {
      return fixUpsert;
    }

    const signatures = await this.ensureMapContentSignatures([mapInfo.map], {
      force: true,
    });
    const similarity = recomputeSimilarity
      ? await this.getMapNameWorkspaceService().assignStoredMapNumbersBySimilarity({
          mapUids: [uid],
          limit: 1,
          force: true,
          persistCandidates: true,
        })
      : null;

    return {
      ok: true,
      mapUid: uid,
      mapName: toText(mapInfo.map?.name) || uid,
      relativePath,
      absolutePath,
      sourceFilePath: safeSourceFilePath,
      fileSha256,
      fileSizeBytes: buffer.length,
      fixUpsert,
      signatures,
      similarity,
    };
  }
}

export { MapLocalFixImportService };
