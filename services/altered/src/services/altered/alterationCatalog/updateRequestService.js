import { normalizeMapUid, toText } from "../serviceSupport.js";

class UpdateRequestService {
  constructor({ repository, getTrackerSyncService }) {
    this.repository = repository;
    this.getTrackerSyncService = getTrackerSyncService;
  }

  async submitUpdateRequest({ uid, name, reason, requesterIp = "", requesterUserAgent = "" } = {}) {
    const mapUid = normalizeMapUid(uid);
    if (!mapUid) return { error: "Map UID is required." };

    const recent = this.repository.activity.getRecentUpdateRequest(mapUid, 60);
    if (recent) {
      return {
        error: "This map was already requested recently. Please wait before requesting again.",
      };
    }

    const mapInfo = this.repository.maps.getMapInfo(mapUid);
    const mapName = toText(name) || toText(mapInfo?.map?.name) || toText(mapInfo?.name) || mapUid;
    const nowIso = new Date().toISOString();
    const request = this.repository.activity.insertUpdateRequest({
      mapUid,
      mapName,
      reason: toText(reason),
      status: "queued",
      requesterIp: toText(requesterIp),
      requesterUserAgent: toText(requesterUserAgent),
      createdAt: nowIso,
    });
    if (!request) return { error: "Unable to store update request." };

    let trackerWarning = null;
    try {
      const ensureResult = await this.getTrackerSyncService().ensureMapIsKnownToTracker(mapUid);
      if (!ensureResult?.ok) {
        trackerWarning = ensureResult?.error || "Tracker sync failed.";
      } else {
        const trackingResult = await this.getTrackerSyncService().updateMapTrackingAcrossTargets(mapUid, {
          tracked: true,
          status: "live",
        });
        if (!trackingResult?.ok) {
          trackerWarning = trackingResult?.error || "Unable to update tracker map status.";
        }
      }
    } catch (error) {
      trackerWarning = error?.message || "Tracker prep failed.";
    }

    return {
      ok: true,
      request,
      tracker: {
        prepared: !trackerWarning,
        warning: trackerWarning,
      },
    };
  }

  listUpdateRequests({ status = "", q = "", limit = 100, offset = 0 } = {}) {
    const requests = this.repository.activity.listUpdateRequests({
      status,
      q,
      limit,
      offset,
    });
    return {
      requests,
      count: requests.length,
    };
  }

  updateUpdateRequestStatus({ requestId, status, resolutionNote = "" } = {}) {
    const updated = this.repository.activity.updateUpdateRequestStatus({
      requestId,
      status,
      resolutionNote,
    });
    if (!updated) return { error: "Request not found or invalid status." };
    return {
      ok: true,
      request: updated,
    };
  }
}

export { UpdateRequestService };
