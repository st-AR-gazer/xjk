import { clampInt, toText, resolveMapUid, chunk } from "./serviceSupport.js";

class TrackerSyncService {
  constructor({ repository, trackerClient, trackerMapSyncClients = [], getLiveMonitoringService }) {
    this.repository = repository;
    this.trackerClient = trackerClient;
    this.getLiveMonitoringService = getLiveMonitoringService;
    this.trackerMapSyncTargets = [];
    const pushTrackerTarget = ({ key, label, client, primary = false } = {}) => {
      if (!client || typeof client.bulkUpsertMaps !== "function") return;
      const targetKey =
        String(key || label || "tracker")
          .trim()
          .toLowerCase() || "tracker";
      const targetLabel = String(label || targetKey).trim() || targetKey;
      const adminBaseUrl = String(client?.adminBaseUrl || "").trim();
      const dedupeKey = adminBaseUrl ? `${targetKey}|${adminBaseUrl}` : targetKey;
      if (this.trackerMapSyncTargets.some((item) => item.dedupeKey === dedupeKey)) return;
      this.trackerMapSyncTargets.push({
        key: targetKey,
        label: targetLabel,
        dedupeKey,
        primary: Boolean(primary),
        adminBaseUrl,
        client,
      });
    };
    pushTrackerTarget({
      key: "wr",
      label: "tracker-wr",
      client: trackerClient,
      primary: true,
    });
    for (const target of Array.isArray(trackerMapSyncClients) ? trackerMapSyncClients : []) {
      pushTrackerTarget({
        key: target?.key,
        label: target?.label,
        client: target?.client,
        primary: false,
      });
    }
  }

  get liveMonitor() {
    return this.getLiveMonitoringService().liveMonitor;
  }

  getTrackerSyncTargetClient(targetKey = "") {
    const safeKey = String(targetKey || "")
      .trim()
      .toLowerCase();
    if (!safeKey) return null;
    const target = this.trackerMapSyncTargets.find(
      (item) =>
        String(item?.key || "")
          .trim()
          .toLowerCase() === safeKey
    );
    return target?.client || null;
  }

  async getTrackerRunHistory(limit = 50, { timeoutMs = null } = {}) {
    const safeLimit = clampInt(limit, { min: 1, max: 200, fallback: 50 });
    if (!this.trackerClient?.getTrackerRuns) {
      return {
        ok: false,
        error: "Tracker run history is unavailable.",
        runs: [],
      };
    }
    const result = await this.trackerClient.getTrackerRuns(safeLimit, { timeoutMs });
    if (!result?.ok) {
      return {
        ok: false,
        error: result?.error || "Tracker run history is unavailable.",
        runs: [],
      };
    }
    return {
      ok: true,
      runs: Array.isArray(result.data?.runs) ? result.data.runs : [],
    };
  }

  getTrackerMapSyncTargets() {
    const targets = Array.isArray(this.trackerMapSyncTargets) ? this.trackerMapSyncTargets : [];
    return targets.filter((target) => target?.client && typeof target.client.bulkUpsertMaps === "function");
  }

  async updateMapTrackingAcrossTargets(mapUid, payload = {}) {
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targets: [],
      };
    }

    const results = [];
    for (const target of targets) {
      const result = await target.client.updateMapTracking(mapUid, payload);
      results.push({
        key: target.key,
        label: target.label,
        ok: Boolean(result?.ok),
        error: result?.ok ? null : result?.error || "Tracker map-tracking update failed.",
      });
    }

    const failed = results.filter((item) => !item.ok);
    return {
      ok: failed.length === 0,
      targets: results,
      error: failed.length > 0 ? `Map tracking update failed on ${failed[0].label}: ${failed[0].error}` : null,
    };
  }

  async syncMapsToTrackerInChunks(maps = [], { onChunk, chunkSize = null } = {}) {
    const list = Array.isArray(maps) ? maps : [];
    if (!list.length) {
      return {
        ok: true,
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }
    const targets = this.getTrackerMapSyncTargets();
    if (!targets.length) {
      return {
        ok: false,
        error: "No tracker map-sync targets are configured.",
        targetCount: 0,
        targetResults: [],
        chunkCount: 0,
        mapsSynced: 0,
      };
    }

    const targetResults = [];
    const effectiveChunkSize = clampInt(chunkSize, {
      min: 10,
      max: 1000,
      fallback: this.liveMonitor.trackerChunkSize,
    });
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex];
      const chunks = chunk(list, effectiveChunkSize);
      let mapsSynced = 0;
      let ok = true;
      let errorMessage = null;
      let chunksSynced = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const part = chunks[index];
        const result = await target.client.bulkUpsertMaps(part);
        if (!result?.ok) {
          ok = false;
          errorMessage = `Tracker sync failed on ${target.label} chunk ${index + 1}/${chunks.length}: ${
            result?.error || "unknown error"
          }`;
          chunksSynced = index;
          break;
        }
        mapsSynced += part.length;
        chunksSynced = index + 1;
        if (typeof onChunk === "function") {
          const chunkMaps = part
            .map((map) => {
              const mapUid = resolveMapUid(map);
              const mapName = toText(map?.name || map?.mapName || map?.title || mapUid) || mapUid;
              if (!mapUid && !mapName) return null;
              return {
                mapUid: mapUid || null,
                mapName: mapName || mapUid || "Unknown map",
              };
            })
            .filter(Boolean);
          const firstMap = chunkMaps[0] || null;
          const lastMap = chunkMaps[chunkMaps.length - 1] || null;
          onChunk({
            index: index + 1,
            total: chunks.length,
            mapsSynced,
            chunkSize: part.length,
            targetKey: target.key,
            targetLabel: target.label,
            targetIndex: targetIndex + 1,
            targetTotal: targets.length,
            currentMapUid: firstMap?.mapUid || null,
            currentMapName: firstMap?.mapName || "",
            currentMaps: chunkMaps.slice(0, 6),
            currentChunkFirstMapUid: firstMap?.mapUid || null,
            currentChunkFirstMapName: firstMap?.mapName || "",
            currentChunkLastMapUid: lastMap?.mapUid || null,
            currentChunkLastMapName: lastMap?.mapName || "",
          });
        }
      }

      targetResults.push({
        key: target.key,
        label: target.label,
        ok,
        error: errorMessage,
        chunkCount: chunks.length,
        chunksSynced,
        mapsSynced,
      });

      if (!ok) {
        return {
          ok: false,
          error: errorMessage,
          targetCount: targets.length,
          targetResults,
          chunkCount: chunks.length,
          chunksSynced,
          mapsSynced,
        };
      }
    }

    const primaryResult =
      targetResults.find((result) => targets.find((target) => target.key === result.key && target.primary)) ||
      targetResults[0];
    return {
      ok: true,
      targetCount: targets.length,
      targetResults,
      chunkCount: Number(primaryResult?.chunkCount || 0),
      mapsSynced: Number(primaryResult?.mapsSynced || 0),
    };
  }

  async ensureMapIsKnownToTracker(mapUid) {
    const trackerMaps = this.repository.campaigns.getMapsForTracker([mapUid]);
    if (!trackerMaps.length) {
      return { ok: false, error: "Map not found in altered storage." };
    }
    const upsertResult = await this.syncMapsToTrackerInChunks(trackerMaps);
    if (!upsertResult.ok) return upsertResult;
    return { ok: true, syncedMaps: trackerMaps.length };
  }

  async updateMapTracking({ mapUid, tracked, status, checkFrequency }) {
    const hasTracked = typeof tracked === "boolean";
    const hasStatus = typeof status === "string";
    const hasFrequency = Number.isFinite(checkFrequency);
    if (!hasTracked && !hasStatus && !hasFrequency) {
      return { error: "Nothing to update. Provide tracked/status/checkFrequency." };
    }

    const updated = this.repository.campaigns.updateMapTracking({
      mapUid,
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });
    if (!updated) return { error: "Map not found." };

    const ensureResult = await this.ensureMapIsKnownToTracker(mapUid);
    if (!ensureResult.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to sync map into tracker: ${ensureResult.error}`,
      };
    }

    const trackerUpdate = await this.updateMapTrackingAcrossTargets(mapUid, {
      tracked: hasTracked ? tracked : undefined,
      status: hasStatus ? String(status) : undefined,
      checkFrequency: hasFrequency ? Number(checkFrequency) : undefined,
    });

    if (!trackerUpdate.ok) {
      return {
        updated,
        warning: `Updated altered storage but failed to update tracker state: ${trackerUpdate.error}`,
      };
    }

    return { updated };
  }

  async getTrackerStatus({ timeoutMs = null } = {}) {
    const result = await this.trackerClient.getTrackerStatus({ timeoutMs });
    if (!result.ok) return { error: result.error };
    return result.data;
  }

  async runTrackerNow() {
    const result = await this.trackerClient.runTrackerNow();
    if (!result.ok) return { error: result.error };
    return result.data;
  }
}

export { TrackerSyncService };
