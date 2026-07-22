import { createClickRoute } from "./click-router.js?v=2";

export function createNamingClickRoutes(context) {
  const {
    api,
    buildNamingDetailFallbackPayload,
    doNameReview,
    guarded,
    loadApi,
    loadDashboard,
    loadMaps,
    mergeNamingDetailPayload,
    openNamingDetailDrawer,
    post,
    promptForName,
    rerenderSimilarityBackfillSurfaces,
    setHash,
    state,
    toast,
  } = context;

  return [
    createClickRoute("[data-candidate-detail]", async (control) => {
      const mapUid = String(control.dataset.candidateDetail || "").trim();
      const fallbackPayload = buildNamingDetailFallbackPayload(mapUid);
      openNamingDetailDrawer(fallbackPayload, { activeTab: "overview" });
      await guarded(`candidate-detail:${mapUid}`, async () => {
        try {
          const payload = await api(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/detail`);
          openNamingDetailDrawer(mergeNamingDetailPayload(fallbackPayload, payload), {
            activeTab: state.drawerUi.activeTab || "overview",
          });
        } catch (error) {
          openNamingDetailDrawer(
            {
              ...fallbackPayload,
              loading: false,
              loadError: error?.message || "Failed to load naming detail.",
            },
            { activeTab: state.drawerUi.activeTab || "overview" }
          );
          throw error;
        }
      });
    }),
    createClickRoute("[data-recompute-similarity]", async (control) => {
      const mapUid = control.dataset.recomputeSimilarity;
      await guarded(`recompute-similarity:${mapUid}`, async () => {
        await post("/api/v1/admin/naming/similarity/backfill", { mapUids: [mapUid], limit: 1 });
        await Promise.all([loadMaps(true), loadDashboard()]);
        const payload = await api(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/detail`);
        openNamingDetailDrawer(payload);
        toast(`Similarity recomputed for ${mapUid}.`, "ok");
      });
    }),
    createClickRoute("[data-candidate-review]", (control) =>
      doNameReview({ mapUid: control.dataset.mapUid, reviewState: control.dataset.candidateReview })
    ),
    createClickRoute("[data-candidate-manual]", async (control) => {
      const name = promptForName("Enter manual name:", "");
      if (name === null) return;
      await doNameReview({ mapUid: control.dataset.candidateManual, reviewState: "approved", manualName: name });
    }),
    createClickRoute("[data-request-status]", async (control) => {
      const requestId = control.dataset.requestId;
      const requestStatus = control.dataset.requestStatus;
      await guarded(
        `req-${requestId}-${requestStatus}`,
        async () => {
          await post(`/api/v1/admin/update-requests/${requestId}/status`, {
            status: requestStatus,
            resolutionNote: "Set from admin v2.",
          });
          await loadMaps(true);
          await loadDashboard();
        },
        `Request moved to ${requestStatus}.`
      );
    }),
    createClickRoute("[data-run-naming-process]", async () => {
      await guarded("naming-rebuild", async () => {
        const result = await post("/api/v1/admin/naming/process", { q: state.maps.filters.naming.q || "" });
        await loadMaps(true);
        await loadDashboard();
        toast(`Naming rebuilt. ${result.processed || 0} processed.`, "ok");
      });
    }),
    createClickRoute("[data-cancel-naming-similarity]", async () => {
      await guarded("naming-similarity-cancel", async () => {
        const cancel = await post("/api/v1/admin/naming/similarity/backfill/cancel", {
          reason: "admin-v2-cancel",
        });
        state.similarityBackfillStatusSupported = true;
        state.similarityBackfill = cancel.status || state.similarityBackfill;
        rerenderSimilarityBackfillSurfaces();
        toast(cancel.canceled ? "Similarity backfill canceled." : "No similarity backfill was running.", "info");
      });
    }),
    createClickRoute("[data-run-naming-similarity]", async (control) => {
      await guarded("naming-similarity", () => runSimilarityBackfill(context, control));
    }),
    createClickRoute("[data-open-unmatched-naming]", async () => {
      state.maps.view = "naming";
      state.maps.filters.naming = {
        ...state.maps.filters.naming,
        automationState: "unmatched",
        reviewState: "pending",
      };
      state.maps.page.naming = 1;
      setHash("maps", { view: "naming" });
      await guarded("open-unmatched-naming", () => loadMaps(true));
    }),
    createClickRoute("[data-api-action]", async (control) => {
      if (control.dataset.apiAction !== "backfill-map-metadata") return;
      await guarded("api-backfill-map-metadata", async () => {
        const result = await post("/api/v1/admin/naming/backfill", { limit: 120000 });
        await Promise.all([loadApi(), loadMaps(true), loadDashboard()]);
        toast(`Map metadata backfill complete. ${result.processed || 0} processed.`, "ok");
      });
    }),
  ];
}

export async function runSimilarityBackfill(context, control) {
  const { isNotFoundError, post, rerenderSimilarityBackfillSurfaces, state, toast } = context;
  const mode = String(control.getAttribute("data-run-naming-similarity") || "incremental")
    .trim()
    .toLowerCase();
  const sourceKey = String(state.namingSimilaritySourceKey || "")
    .trim()
    .toLowerCase();
  const campaignName = String(state.namingSimilarityCampaignName || "").trim();
  const rescanAll = mode === "rescan-all" || mode === "selected-source";

  try {
    const kickoff = await post("/api/v1/admin/naming/similarity/backfill/start", {
      reason: campaignName
        ? `admin-v2-rescan-campaign-${campaignName}`
        : sourceKey
          ? `admin-v2-rescan-${sourceKey}`
          : rescanAll
            ? "admin-v2-rescan-all-candidates"
            : "admin-v2-full-all-candidates",
      sourceKey: sourceKey || undefined,
      campaignName: campaignName || undefined,
      clubId: state.namingSimilarityClubId ? Number(state.namingSimilarityClubId) : undefined,
      reviewState: state.namingSimilarityPendingOnly ? "pending" : undefined,
      force: state.namingSimilarityForce || undefined,
      rescanAll,
    });
    state.similarityBackfillStatusSupported = true;
    state.similarityBackfill = kickoff.status || state.similarityBackfill;
    rerenderSimilarityBackfillSurfaces();
    toast(similarityKickoffMessage(kickoff, { campaignName, sourceKey, rescanAll }), "info");
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    state.similarityBackfillStatusSupported = false;
    rerenderSimilarityBackfillSurfaces();
    throw new Error(
      "Live similarity progress is unavailable on the current backend. Restart the altered backend and refresh the page."
    );
  }
}

export function similarityKickoffMessage(kickoff, { campaignName, sourceKey, rescanAll }) {
  const emptySelection = Boolean(
    kickoff.emptySelection || kickoff.status?.progress?.emptySelection || kickoff.status?.lastSummary?.emptySelection
  );
  if (kickoff.started) {
    if (campaignName) return `Similarity rescan for campaign "${campaignName}" started. Progress is now live.`;
    if (sourceKey) return `Similarity rescan for ${sourceKey} started. Progress is now live.`;
    return rescanAll
      ? "Full similarity rescan started. Progress is now live."
      : "Similarity backfill started. Progress is now live.";
  }
  if (kickoff.alreadyRunning) return "Similarity backfill is already running.";
  if (emptySelection) return "No maps matched the current scoped similarity selection.";
  return "Similarity backfill did not start.";
}
