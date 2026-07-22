import {
  buildMapViewerDiffPayload,
  normalizeMapUid,
  resolveMapCampaignName,
  resolveMapSlot,
  resolveMapUid,
  toText,
} from "../serviceSupport.js";

class MapViewerDiffService {
  constructor({ repository, getPreferredMapLocalFiles, getLocalMapFileAbsolutePath, parseMapLayouts }) {
    this.repository = repository;
    this.getPreferredMapLocalFiles = getPreferredMapLocalFiles;
    this.getLocalMapFileAbsolutePath = getLocalMapFileAbsolutePath;
    this.parseMapLayouts = parseMapLayouts;
  }

  async getMapViewerDiffPayload({ targetMapUid, referenceMapUid } = {}) {
    const targetUid = normalizeMapUid(targetMapUid);
    const referenceUid = normalizeMapUid(referenceMapUid);
    if (!targetUid) return { error: "targetMapUid is required." };
    if (!referenceUid) return { error: "referenceMapUid is required." };

    const targetInfo = this.repository.maps.getMapInfo(targetUid);
    if (!targetInfo?.exists || !targetInfo.map) {
      return {
        error: "Target map not found.",
        targetMapUid: targetUid,
      };
    }

    const referenceInfo = this.repository.maps.getMapInfo(referenceUid);
    if (!referenceInfo?.exists || !referenceInfo.map) {
      return {
        error: "Reference map not found.",
        referenceMapUid: referenceUid,
      };
    }

    const localFilesByUid = new Map(
      this.getPreferredMapLocalFiles({ mapUids: [targetUid, referenceUid] })
        .filter((record) => record?.mapUid)
        .map((record) => [String(record.mapUid || "").toLowerCase(), record])
    );
    const targetLocalFile = localFilesByUid.get(targetUid.toLowerCase()) || null;
    const referenceLocalFile = localFilesByUid.get(referenceUid.toLowerCase()) || null;

    if (!targetLocalFile || String(targetLocalFile.status || "") !== "ready") {
      return {
        error: "Target local map copy is not ready.",
        targetMapUid: targetUid,
        localFile: targetLocalFile,
      };
    }
    if (!referenceLocalFile || String(referenceLocalFile.status || "") !== "ready") {
      return {
        error: "Reference local map copy is not ready.",
        referenceMapUid: referenceUid,
        localFile: referenceLocalFile,
      };
    }

    const targetFilePath = this.getLocalMapFileAbsolutePath(targetUid, targetLocalFile.relativePath);
    const referenceFilePath = this.getLocalMapFileAbsolutePath(referenceUid, referenceLocalFile.relativePath);

    const parsedLayouts = await this.parseMapLayouts([
      { mapUid: targetUid, filePath: targetFilePath },
      { mapUid: referenceUid, filePath: referenceFilePath },
    ]);
    const parsedByUid = new Map(
      (Array.isArray(parsedLayouts?.maps) ? parsedLayouts.maps : [])
        .filter((entry) => entry?.mapUid)
        .map((entry) => [String(entry.mapUid || "").toLowerCase(), entry])
    );
    const targetLayout = parsedByUid.get(targetUid.toLowerCase()) || null;
    const referenceLayout = parsedByUid.get(referenceUid.toLowerCase()) || null;

    if (!targetLayout) {
      return {
        error: "Target map layout could not be parsed.",
        targetMapUid: targetUid,
      };
    }
    if (targetLayout?.error) {
      return {
        error: `Target map parse failed: ${targetLayout.error}`,
        targetMapUid: targetUid,
      };
    }
    if (!referenceLayout) {
      return {
        error: "Reference map layout could not be parsed.",
        referenceMapUid: referenceUid,
      };
    }
    if (referenceLayout?.error) {
      return {
        error: `Reference map parse failed: ${referenceLayout.error}`,
        referenceMapUid: referenceUid,
      };
    }

    return buildMapViewerDiffPayload({
      targetMap: {
        mapUid: resolveMapUid(targetInfo.map),
        name: toText(targetInfo.map.name) || targetLayout.mapName || targetUid,
        campaign: resolveMapCampaignName(targetInfo.map) || "Unassigned",
        slot: resolveMapSlot(targetInfo.map) || null,
      },
      referenceMap: {
        mapUid: resolveMapUid(referenceInfo.map),
        name: toText(referenceInfo.map.name) || referenceLayout.mapName || referenceUid,
        campaign: resolveMapCampaignName(referenceInfo.map) || "Unassigned",
        slot: resolveMapSlot(referenceInfo.map) || null,
      },
      targetLocalFile: {
        ...targetLocalFile,
        absolutePath: targetFilePath,
      },
      referenceLocalFile: {
        ...referenceLocalFile,
        absolutePath: referenceFilePath,
      },
      targetLayout,
      referenceLayout,
    });
  }
}

export { MapViewerDiffService };
