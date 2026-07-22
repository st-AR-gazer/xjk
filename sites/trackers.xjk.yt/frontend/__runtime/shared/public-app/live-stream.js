function createTrackerLiveStream({ config, refreshData, state, transport, view, windowRef }) {
  let queuedRefresh = false;

  function queueRefresh() {
    if (queuedRefresh) return;
    queuedRefresh = true;
    windowRef.setTimeout(async () => {
      queuedRefresh = false;
      await refreshData({ silent: true });
    }, 120);
  }

  function addLiveCheck(rawPayload) {
    const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
    const map = payload.map && typeof payload.map === "object" ? payload.map : {};
    const wr = payload.wr && typeof payload.wr === "object" ? payload.wr : {};
    const progress = payload.progress && typeof payload.progress === "object" ? payload.progress : {};
    const record = {
      checkedAt: payload.at || new Date().toISOString(),
      mapUid: String(map.uid || ""),
      mapName: String(map.name || "Unknown"),
      campaign: String(map.campaign || ""),
      slot: Number(map.slot || 0),
      changed: Boolean(wr.changed),
      oldWrMs: Number(wr.oldMs || 0),
      newWrMs: Number(wr.newMs || 0),
      oldHolder: String(wr.oldHolder || ""),
      newHolder: String(wr.newHolder || ""),
      source: String(payload.source || "unknown"),
      note: String(payload.note || "checked"),
      progressCurrent: Number(progress.current || 0),
      progressTotal: Number(progress.total || 0),
    };

    const progressLabel =
      Number.isFinite(record.progressCurrent) && Number.isFinite(record.progressTotal) && record.progressTotal > 0
        ? `${record.progressCurrent}/${record.progressTotal}`
        : "1/1";
    if (view.elements.feedNote) {
      view.elements.feedNote.textContent = `Live: checked ${progressLabel} - ${record.mapName}`;
    }
    view.renderSpotlight(record);

    if (!view.hasCheckFeed) {
      state.wrFeed.unshift({
        at: record.checkedAt,
        mapName: `[Checked] ${record.mapName}`,
        holder: record.newHolder || record.oldHolder || "-",
        newWrMs: record.newWrMs || record.oldWrMs || 0,
        oldWrMs: record.changed ? record.oldWrMs : 0,
      });
      if (state.wrFeed.length > 30) state.wrFeed.length = 30;
      view.renderFeed();
      return;
    }

    state.liveChecks.unshift(record);
    if (state.liveChecks.length > 50) state.liveChecks.length = 50;
    view.elements.checkFeedNote.textContent = `Latest: ${record.mapName} (${view.formatAgo(record.checkedAt)})`;
    view.renderLiveChecks();
  }

  function clearReconnectTimer() {
    if (!state.stream.reconnectTimer) return;
    windowRef.clearTimeout(state.stream.reconnectTimer);
    state.stream.reconnectTimer = null;
  }

  function cleanup() {
    if (state.stream.source) {
      try {
        state.stream.source.close();
      } catch {}
      state.stream.source = null;
    }
    state.stream.connected = false;
  }

  function scheduleReconnect() {
    if (state.stream.reconnectTimer) return;
    state.stream.reconnectTimer = windowRef.setTimeout(() => {
      state.stream.reconnectTimer = null;
      connect();
    }, config.streamReconnectMs);
  }

  function connect() {
    if (!windowRef.EventSource) {
      view.updateFeedNote();
      return;
    }
    cleanup();
    const usePrimaryStream = state.source.usePrimaryRead && state.source.primaryReadHealthy;
    const streamUrl = usePrimaryStream
      ? transport.primaryApiUrl("/api/v1/stream")
      : config.routes.resolve("/api/v1/stream");
    const source = new windowRef.EventSource(streamUrl);
    state.stream.source = source;

    source.addEventListener("open", () => {
      clearReconnectTimer();
      state.stream.connected = true;
      view.updateFeedNote();
    });
    source.addEventListener("connected", queueRefresh);
    source.addEventListener("tracker-update", (event) => {
      try {
        const payload = JSON.parse(String(event?.data || "{}"));
        const run = payload?.run;
        if (run && typeof run === "object") {
          if (!state.status) state.status = {};
          state.status.latestRun = { ...(state.status.latestRun || {}), ...run };
          view.renderStats();
          view.renderEngine();
        }
      } catch {}
      queueRefresh();
    });
    source.addEventListener("map-checked", (event) => {
      try {
        addLiveCheck(JSON.parse(String(event?.data || "{}")));
      } catch {}
    });
    source.addEventListener("ping", () => {});
    source.addEventListener("error", () => {
      state.stream.connected = false;
      if (usePrimaryStream) state.source.primaryReadHealthy = false;
      view.updateFeedNote();
      cleanup();
      scheduleReconnect();
    });
  }

  function stop() {
    clearReconnectTimer();
    cleanup();
  }

  return { addLiveCheck, connect, stop };
}

export { createTrackerLiveStream };
