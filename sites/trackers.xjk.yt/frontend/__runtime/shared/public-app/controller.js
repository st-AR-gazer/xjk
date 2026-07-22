function normalizeFeed(payload) {
  if (Array.isArray(payload?.feed)) return payload.feed;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return Array.isArray(payload) ? payload : [];
}

function createTrackerController({ applySiteDataLinks, config, documentRef, state, transport, view, windowRef }) {
  async function refreshData({ silent = false } = {}) {
    try {
      const [status, runs] = await Promise.allSettled([
        transport.api("api/v1/tracker/status"),
        transport.api("api/v1/tracker/runs?limit=20"),
      ]);

      if (status.status === "fulfilled") {
        state.status = status.value;
        state.mode = String(status.value?.runtime?.mode || "wr").toLowerCase() === "leaderboard" ? "leaderboard" : "wr";
        view.applyModeUI();
      }
      if (runs.status === "fulfilled") state.runs = Array.isArray(runs.value?.runs) ? runs.value.runs : [];

      const feedPath =
        state.mode === "leaderboard" ? "api/v1/leaderboard/latest?limit=30" : "api/v1/wr/latest?limit=30";
      try {
        state.wrFeed = normalizeFeed(await transport.api(feedPath));
      } catch {
        state.wrFeed = [];
      }

      view.renderStats();
      view.renderFeed();
      view.renderEngine();
      view.renderRuns();
      view.applyRunNowAvailability();
      if (state.wrFeed.length) view.renderSpotlight(state.wrFeed[0]);

      transport
        .api("api/v1/tracked/maps?limit=2000")
        .then((tracked) => {
          state.maps = Array.isArray(tracked?.maps) ? tracked.maps : [];
          view.renderMaps();
        })
        .catch((error) => {
          if (!silent) view.elements.engineError.textContent = error.message;
        });
    } catch (error) {
      view.applyRunNowAvailability();
      if (!silent) {
        view.elements.engineStatus.textContent = "error";
        view.elements.engineError.textContent = error.message;
      }
    }
  }

  async function boot({ commands, liveStream }) {
    const hash = windowRef.location.hash.slice(1);
    if (hash && documentRef.querySelector(`.dock-btn[data-view="${hash}"]`)) view.switchTab(hash);

    view.updateFeedNote();
    const adminLink = documentRef.querySelector("[data-tracker-admin-link]");
    if (adminLink) adminLink.href = config.routes.admin("login");
    applySiteDataLinks().catch(() => {});
    view.applyModeUI();
    commands.bindEvents();
    view.applyRunNowAvailability();
    await refreshData();
    liveStream.connect();
    windowRef.setInterval(() => refreshData({ silent: true }), config.fallbackRefreshMs);
    windowRef.addEventListener("beforeunload", () => liveStream.stop());
  }

  return { boot, refreshData };
}

export { createTrackerController, normalizeFeed };
