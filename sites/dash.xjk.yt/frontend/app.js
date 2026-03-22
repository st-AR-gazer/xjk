(function () {
  "use strict";

  const POLL_REFRESH_MS = 15000;
  const TABS = ["overview", "routes", "errors", "trackers", "altered", "logs"];
  const ROUTE_SUB_TABS = ["incoming", "outgoing", "nadeo"];

  /* ── Formatters ──────────────────────────────── */

  function fmtNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toLocaleString();
  }

  function fmtPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return `${n.toFixed(2)}%`;
  }

  function fmtRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    if (n >= 100) return n.toFixed(0);
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }

  function fmtOneReqEverySeconds(rateValue) {
    const rate = Number(rateValue);
    if (!Number.isFinite(rate) || rate <= 0) return "-";
    const seconds = 1 / rate;
    if (seconds >= 100) return `${seconds.toFixed(0)} sec`;
    if (seconds >= 10) return `${seconds.toFixed(1)} sec`;
    return `${seconds.toFixed(2)} sec`;
  }

  function fmtMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "-";
    if (n < 1000) return `${Math.round(n)}ms`;
    return `${(n / 1000).toFixed(2)}s`;
  }

  function fmtSeconds(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "-";
    if (n >= 3600) return `${(n / 3600).toFixed(2)}h`;
    if (n >= 60) return `${(n / 60).toFixed(1)}m`;
    if (n >= 10) return `${n.toFixed(1)}s`;
    return `${n.toFixed(2)}s`;
  }

  function fmtBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let current = n;
    let idx = 0;
    while (current >= 1024 && idx < units.length - 1) {
      current /= 1024;
      idx += 1;
    }
    const digits = current >= 100 ? 0 : current >= 10 ? 1 : 2;
    return `${current.toFixed(digits)} ${units[idx]}`;
  }

  function fmtDateTime(value) {
    const ts = Date.parse(String(value || ""));
    if (!Number.isFinite(ts)) return "-";
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
  }

  function fmtAgo(value) {
    const ts = Date.parse(String(value || ""));
    if (!Number.isFinite(ts)) return "-";
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (deltaSeconds < 5) return "just now";
    if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
    if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
    if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
    return `${Math.floor(deltaSeconds / 86400)}d ago`;
  }

  function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  }

  /* ── DOM helpers ─────────────────────────────── */

  function setStatus(text) {
    const el = document.getElementById("statusLine");
    if (el) el.textContent = text;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function waitForNextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  /* ── URL splitting ─────────────────────────────── */

  function splitRouteKey(key) {
    const str = String(key || "-");
    if (str === "-") return { host: null, path: str, query: null, raw: str };

    const slashIdx = str.indexOf("/");
    let host = null;
    let fullPath = str;

    if (slashIdx > 0 && !str.startsWith("/")) {
      host = str.substring(0, slashIdx);
      fullPath = str.substring(slashIdx);
    }

    const qIdx = fullPath.indexOf("?");
    const path = qIdx >= 0 ? fullPath.substring(0, qIdx) : fullPath;
    const query = qIdx >= 0 ? fullPath.substring(qIdx) : null;

    return { host, path, query, raw: str };
  }

  function renderKeyCellHtml(key) {
    const parsed = splitRouteKey(key);
    if (parsed.host) {
      return (
        `<span class="cell-key-host">${escapeHtml(parsed.host)}</span>` +
        `<span class="cell-key-path">${escapeHtml(parsed.path)}</span>`
      );
    }
    return `<span class="cell-key-path">${escapeHtml(parsed.path)}</span>`;
  }

  /* ── Fetch helpers ───────────────────────────── */

  async function fetchJson(url, { method = "GET", body = undefined } = {}) {
    const separator = url.includes("?") ? "&" : "?";
    const bust = `${url}${separator}_t=${Date.now()}`;
    const headers = {
      "cache-control": "no-cache",
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(bust, {
      method,
      cache: "no-store",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || `${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const DASH_API_BASES = ["/api/private/dash", "/api/v1/private/dash"];

  async function fetchDashJson(pathAndQuery, options = {}) {
    let lastError = null;
    for (const base of DASH_API_BASES) {
      try {
        return await fetchJson(`${base}${pathAndQuery}`, options);
      } catch (error) {
        lastError = error;
        if (!error || error.status !== 404) {
          break;
        }
      }
    }
    throw lastError || new Error("Dashboard API unavailable.");
  }

  /* ── State ───────────────────────────────────── */

  const state = {
    filters: {
      windowHours: 168,
      projectKey: "",
      service: "",
    },
    activeTab: "overview",
    routeSubTab: "incoming",
    errors: {
      page: 1,
      limit: 50,
      totalPages: 1,
      total: 0,
      q: "",
      direction: "",
    },
    projects: [],
    services: [],
    cached: {
      incoming: [],
      outgoing: [],
      nadeo: [],
      errors: [],
    },
    logs: {
      services: [],
      service: "",
      stream: "out",
      lines: 200,
      followTail: true,
    },
    altered: {
      summary: null,
      syncRuns: [],
      pollRuns: [],
      checkEvents: [],
      checkQuery: "",
    },
    trackers: {
      payload: null,
      lastLoadedAt: null,
      lastErrorAt: null,
      lastErrorMessage: "",
    },
    nadeoQueue: {
      open: false,
      pendingCount: 0,
      rows: [],
      generatedAt: "",
    },
  };

  function buildQuery(extra = {}) {
    const params = new URLSearchParams();
    params.set("window_hours", String(state.filters.windowHours));
    if (state.filters.projectKey) params.set("project_key", state.filters.projectKey);
    if (state.filters.service) params.set("service", state.filters.service);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    return params.toString();
  }

  /* ── Detail Drawer ───────────────────────────── */

  function openDrawer(title, entries) {
    const drawer = document.getElementById("detailDrawer");
    const titleEl = document.getElementById("drawerTitle");
    const contentEl = document.getElementById("drawerContent");
    if (!drawer || !titleEl || !contentEl) return;

    titleEl.textContent = title;

    let html = '<div class="drawer-entries">';
    entries.forEach((entry) => {
      if (entry.separator) {
        html += '<div class="drawer-separator"></div>';
        return;
      }
      const fullClass = entry.full ? " full" : "";
      const valueClass = entry.mono ? " mono" : "";
      html +=
        `<div class="drawer-entry${fullClass}">` +
        `<span class="drawer-entry-label">${escapeHtml(entry.label)}</span>` +
        `<span class="drawer-entry-value${valueClass}">${escapeHtml(entry.value)}</span>` +
        `</div>`;
    });
    html += "</div>";
    contentEl.innerHTML = html;

    drawer.hidden = false;
  }

  function closeDrawer() {
    const drawer = document.getElementById("detailDrawer");
    if (drawer) drawer.hidden = true;
  }

  function openRouteDetail(item, subTabType) {
    const typeLabels = { incoming: "Incoming Route", outgoing: "Outgoing Target", nadeo: "Nadeo Route" };
    const title = typeLabels[subTabType] || "Route Detail";
    const keyLabel = subTabType === "outgoing" ? "Target" : "Route";

    openDrawer(title, [
      { label: keyLabel, value: item.key || "-", full: true, mono: true },
      { separator: true },
      { label: "Requests", value: fmtNumber(item.requests || 0) },
      { label: "Errors", value: fmtNumber(item.errorRequests || 0) },
      { label: "Error Rate", value: fmtPercent(item.errorRatePct || 0) },
      { label: "Avg Duration", value: fmtMs(item.avgDurationMs || 0) },
      { separator: true },
      { label: "Bytes In", value: fmtBytes(item.bytesIn || 0) },
      { label: "Bytes Out", value: fmtBytes(item.bytesOut || 0) },
    ]);
  }

  function openErrorDetail(item) {
    const requestText = `${item.method || "-"} ${item.route || "-"}`;
    const targetText =
      item.direction === "incoming"
        ? "-"
        : item.target || `${item.targetHost || "-"}${item.targetPath || ""}`;

    const entries = [
      { label: "Time", value: fmtDateTime(item.occurredAt), full: true },
      { separator: true },
      { label: "Direction", value: item.direction || "-" },
      { label: "Service", value: item.service || "-" },
      { label: "Method", value: item.method || "-" },
      { label: "Status", value: String(item.statusCode || "-") },
      { separator: true },
      { label: "Request", value: requestText, full: true, mono: true },
    ];

    if (item.direction !== "incoming") {
      entries.push({ label: "Target Host", value: item.targetHost || "-", full: true, mono: true });
      if (item.targetPath) {
        entries.push({ label: "Target Path", value: item.targetPath, full: true, mono: true });
      }
    }

    entries.push(
      { separator: true },
      { label: "Duration", value: fmtMs(item.durationMs || 0) },
      { label: "Bytes In", value: fmtBytes(item.bytesIn || 0) },
      { label: "Bytes Out", value: fmtBytes(item.bytesOut || 0) },
      { label: "Project", value: item.projectKey || "-" },
      { separator: true },
      { label: "Source", value: item.sourceLabel || "-" },
      { label: "Nadeo Target", value: item.isNadeoOutgoing ? "Yes" : "No" },
      { label: "Internal Target", value: item.isInternalOutgoing ? "Yes" : "No" },
    );

    openDrawer("Error Detail", entries);
  }

  /* ── Table rendering ─────────────────────────── */

  function setTopTableLoading(bodyId, isLoading, message = "") {
    const body = document.getElementById(bodyId);
    if (!body) return;
    body.dataset.loading = isLoading ? "1" : "0";
    if (isLoading) {
      body.dataset.loadingMessage = String(message || "Refreshing...");
    } else {
      delete body.dataset.loadingMessage;
    }
  }

  function renderTopTable(bodyId, rows = [], cacheKey = null, emptyMessage = "No traffic samples in this range.") {
    if (cacheKey) state.cached[cacheKey] = rows;

    const body = document.getElementById(bodyId);
    if (!body) return;
    setTopTableLoading(bodyId, false);
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted">${escapeHtml(emptyMessage)}</td></tr>`;
      return;
    }
    rows.forEach((item, idx) => {
      const tr = document.createElement("tr");
      tr.className = "clickable-row";
      tr.dataset.detailType = cacheKey;
      tr.dataset.detailIdx = String(idx);
      tr.innerHTML =
        `<td class="cell-key" title="${escapeHtml(item.key || "-")}">${renderKeyCellHtml(item.key)}</td>` +
        `<td>${fmtNumber(item.requests || 0)}</td>` +
        `<td>${fmtNumber(item.errorRequests || 0)}</td>` +
        `<td>${fmtPercent(item.errorRatePct || 0)}</td>` +
        `<td>${fmtMs(item.avgDurationMs || 0)}</td>` +
        `<td>${fmtBytes(item.bytesIn || 0)}</td>` +
        `<td>${fmtBytes(item.bytesOut || 0)}</td>`;
      body.appendChild(tr);
    });
  }

  function renderTableMessage(bodyId, message, { cacheKey = null, colspan = 7 } = {}) {
    if (cacheKey) state.cached[cacheKey] = [];
    const body = document.getElementById(bodyId);
    if (!body) return;
    setTopTableLoading(bodyId, false);
    body.innerHTML = `<tr><td colspan="${colspan}" class="muted">${escapeHtml(message)}</td></tr>`;
  }

  /* ── Tab management ──────────────────────────── */

  function setActiveTab(nextTab) {
    const tab = TABS.includes(nextTab) ? nextTab : "overview";
    state.activeTab = tab;

    document.querySelectorAll(".tab-nav .tab-btn").forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    TABS.forEach((t) => {
      const panelId = "tab" + t.charAt(0).toUpperCase() + t.slice(1);
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = t !== tab;
    });
  }

  function setActiveRouteSubTab(subtab) {
    const active = ROUTE_SUB_TABS.includes(subtab) ? subtab : "incoming";
    state.routeSubTab = active;

    document.querySelectorAll("#tabRoutes .sub-tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.subtab === active);
    });

    ROUTE_SUB_TABS.forEach((s) => {
      const panelId = "routes" + s.charAt(0).toUpperCase() + s.slice(1);
      const panel = document.getElementById(panelId);
      if (panel) panel.hidden = s !== active;
    });
  }

  /* ── Error rendering ─────────────────────────── */

  function renderErrorsSummary(errors = {}) {
    const statusSpread = Array.isArray(errors?.summary?.statusCounts)
      ? errors.summary.statusCounts.map((item) => `${item.key}:${item.count}`).join("  ")
      : "";
    const topRoute = errors?.summary?.topIncomingRoutes?.[0] || null;
    const topTarget = errors?.summary?.topOutgoingTargets?.[0] || null;

    setText("mErrorsTotal", fmtNumber(errors.total || 0));
    setText("mErrorsShowing", `${fmtNumber(errors.count || 0)} / page`);
    setText("mErrorsStatusSpread", statusSpread || "-");
    setText("mErrorsTopRoute", topRoute ? `${topRoute.key} (${fmtNumber(topRoute.count)})` : "-");
    setText("mErrorsTopTarget", topTarget ? `${topTarget.key} (${fmtNumber(topTarget.count)})` : "-");
  }

  function renderErrorsTable(errors = {}) {
    const rows = Array.isArray(errors.items) ? errors.items : [];
    state.cached.errors = rows;

    const body = document.getElementById("errorsBody");
    if (!body) return;

    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="9" class="muted">No errors found for the current filter.</td></tr>';
    } else {
      rows.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.dataset.detailType = "errors";
        tr.dataset.detailIdx = String(idx);
        const method = item.method || "-";
        const route = item.route || "-";
        const requestText = `${method} ${route}`;
        const targetText =
          item.direction === "incoming"
            ? "-"
            : item.target || `${item.targetHost || "-"}${item.targetPath || ""}`;
        const requestCellHtml =
          `<span class="cell-key-host">${escapeHtml(method)}</span>` +
          renderKeyCellHtml(route);
        tr.innerHTML =
          `<td>${escapeHtml(fmtDateTime(item.occurredAt))}</td>` +
          `<td>${escapeHtml(item.direction || "-")}</td>` +
          `<td>${escapeHtml(item.service || "-")}</td>` +
          `<td class="cell-key" title="${escapeHtml(requestText)}">${requestCellHtml}</td>` +
          `<td class="cell-key" title="${escapeHtml(targetText)}">${renderKeyCellHtml(targetText)}</td>` +
          `<td>${escapeHtml(String(item.statusCode || "-"))}</td>` +
          `<td>${escapeHtml(fmtMs(item.durationMs || 0))}</td>` +
          `<td>${escapeHtml(item.projectKey || "-")}</td>` +
          `<td>${escapeHtml(item.sourceLabel || "-")}</td>`;
        body.appendChild(tr);
      });
    }

    const page = Number(errors.page || 1);
    const totalPages = Math.max(1, Number(errors.totalPages || 1));
    state.errors.page = page;
    state.errors.totalPages = totalPages;
    state.errors.total = Number(errors.total || 0);

    const pageLabel = document.getElementById("errorsPageLabel");
    if (pageLabel) pageLabel.textContent = `Page ${page}/${totalPages}`;

    const prevBtn = document.getElementById("errorsPrevBtn");
    const nextBtn = document.getElementById("errorsNextBtn");
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    renderErrorsSummary(errors);
  }

  /* ── Tracker rendering ───────────────────────── */

  function trackerRuntimeSummary(key, statusPayload) {
    if (!statusPayload || typeof statusPayload !== "object") return "-";
    if (key === "wr" || key === "leaderboard") {
      const runtime = statusPayload.runtime || {};
      const runs = Number(runtime.totalRuns || 0);
      const checked = Number(runtime.totalChecked || 0);
      return `runs:${fmtNumber(runs)} checked:${fmtNumber(checked)} tick:${runtime.tickSeconds || "-"}s`;
    }
    if (key === "displayname") {
      const intervalSeconds = Number(statusPayload.maintenanceIntervalSeconds || 0);
      const minGapMs = Number(statusPayload.minRequestGapMs || 0);
      const gapSeconds = Number.isFinite(minGapMs) ? minGapMs / 1000 : 0;
      return (
        `sched:${statusPayload.schedulerEnabled ? "on" : "off"} ` +
        `tick:${intervalSeconds > 0 ? `${fmtRate(intervalSeconds)}s` : "-"} ` +
        `gap:${gapSeconds > 0 ? `${fmtRate(gapSeconds)}s` : "-"} ` +
        `queue:${fmtNumber(statusPayload.queueSize || 0)}`
      );
    }
    if (key === "club") {
      return `last ingest: ${statusPayload.lastIngestAt ? fmtDateTime(statusPayload.lastIngestAt) : "-"}`;
    }
    return "-";
  }

  function trackerEnabled(key, statusPayload) {
    if (!statusPayload || typeof statusPayload !== "object") return false;
    if (key === "wr" || key === "leaderboard") return Boolean(statusPayload?.runtime?.enabled);
    return Boolean(statusPayload.enabled);
  }

  function renderTrackerStatuses(payload = {}, { stale = false, errorMessage = "" } = {}) {
    const trackers = payload?.trackers || {};
    const rows = [
      ["wr", "trackerWrStatus", "trackerWrRuntime", "trackerWrToggleBtn"],
      ["leaderboard", "trackerLbStatus", "trackerLbRuntime", "trackerLbToggleBtn"],
      ["displayname", "trackerDnStatus", "trackerDnRuntime", "trackerDnToggleBtn"],
      ["club", "trackerClubStatus", "trackerClubRuntime", "trackerClubToggleBtn"],
    ];

    rows.forEach(([key, statusId, runtimeId, toggleId]) => {
      const entry = trackers[key] || {};
      const hasEntry = Object.keys(entry).length > 0;
      const statusEl = document.getElementById(statusId);
      const runtimeEl = document.getElementById(runtimeId);
      const toggleBtn = document.getElementById(toggleId);
      if (statusEl) {
        statusEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
      }
      if (runtimeEl) {
        runtimeEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
      }
      if (statusEl) {
        if (!hasEntry && errorMessage) {
          statusEl.textContent = "status unavailable";
          statusEl.classList.add("tracker-status-error");
        } else if (!entry.configured) {
          statusEl.textContent = "not configured";
          statusEl.classList.add("tracker-status-error");
        } else if (!entry.ok) {
          statusEl.textContent = `error: ${entry.error || "unreachable"}`;
          statusEl.classList.add("tracker-status-error");
        } else {
          statusEl.textContent = trackerEnabled(key, entry.status)
            ? stale
              ? "enabled (stale)"
              : "enabled"
            : stale
              ? "disabled (stale)"
              : "disabled";
          statusEl.classList.add(stale ? "tracker-status-stale" : "tracker-status-ok");
        }
      }
      if (runtimeEl) {
        if (entry.ok && entry.status) {
          runtimeEl.textContent =
            trackerRuntimeSummary(key, entry.status) +
            (stale ? ` | stale ${fmtAgo(state.trackers.lastLoadedAt)}` : "");
          runtimeEl.classList.add(stale ? "tracker-status-stale" : "tracker-status-ok");
        } else if (!hasEntry && errorMessage) {
          runtimeEl.textContent = errorMessage;
          runtimeEl.classList.add("tracker-status-error");
        } else {
          runtimeEl.textContent = stale
            ? `stale snapshot unavailable${errorMessage ? ` | ${errorMessage}` : ""}`
            : "-";
          if (stale) runtimeEl.classList.add("tracker-status-stale");
        }
      }
      if (toggleBtn) {
        const enabled = entry.ok && trackerEnabled(key, entry.status);
        toggleBtn.textContent = enabled ? "Disable" : "Enable";
        toggleBtn.dataset.enabled = enabled ? "1" : "0";
        toggleBtn.disabled = !hasEntry || !entry.configured;
        toggleBtn.title = stale
          ? `Tracker status is stale. Last success ${fmtAgo(state.trackers.lastLoadedAt)}.`
          : errorMessage && !hasEntry
            ? errorMessage
            : "";
      }
    });

    const priorityStatusEl = document.getElementById("trackerPriorityStatus");
    if (priorityStatusEl) {
      priorityStatusEl.textContent = summarizeTrackerPriorityStatus(trackers);
    }

    const refreshMetaEl = document.getElementById("trackerRefreshMeta");
    if (refreshMetaEl) {
      if (stale && state.trackers.lastLoadedAt) {
        refreshMetaEl.textContent =
          `Tracker snapshot stale. Last successful refresh ${fmtAgo(state.trackers.lastLoadedAt)} (${fmtDateTime(state.trackers.lastLoadedAt)}).` +
          (errorMessage ? ` Latest error: ${errorMessage}` : "");
        refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-error");
        refreshMetaEl.classList.add("tracker-status-stale");
      } else if (state.trackers.lastLoadedAt) {
        refreshMetaEl.textContent = `Last successful tracker refresh ${fmtAgo(state.trackers.lastLoadedAt)} (${fmtDateTime(state.trackers.lastLoadedAt)}).`;
        refreshMetaEl.classList.remove("tracker-status-error", "tracker-status-stale");
        refreshMetaEl.classList.add("tracker-status-ok");
      } else if (errorMessage) {
        refreshMetaEl.textContent = `Tracker status unavailable: ${errorMessage}`;
        refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-stale");
        refreshMetaEl.classList.add("tracker-status-error");
      } else {
        refreshMetaEl.textContent = "Tracker status not loaded yet.";
        refreshMetaEl.classList.remove("tracker-status-ok", "tracker-status-error", "tracker-status-stale");
      }
    }
  }

  async function refreshTrackerStatuses() {
    try {
      const payload = await fetchDashJson("/trackers/status");
      state.trackers.payload = payload || {};
      state.trackers.lastLoadedAt = new Date().toISOString();
      state.trackers.lastErrorAt = null;
      state.trackers.lastErrorMessage = "";
      renderTrackerStatuses(state.trackers.payload, { stale: false, errorMessage: "" });
    } catch (error) {
      state.trackers.lastErrorAt = new Date().toISOString();
      state.trackers.lastErrorMessage = error?.message || String(error || "unknown error");
      if (state.trackers.payload) {
        renderTrackerStatuses(state.trackers.payload, {
          stale: true,
          errorMessage: state.trackers.lastErrorMessage,
        });
      } else {
        renderTrackerStatuses({ trackers: {} }, {
          stale: false,
          errorMessage: state.trackers.lastErrorMessage,
        });
      }
      setStatus(`Error: ${error?.message || error}`);
    }
  }

  async function sendTrackerControl(tracker, action, payload = {}) {
    const response = await fetchDashJson("/trackers/control", {
      method: "POST",
      body: {
        tracker,
        action,
        ...payload,
      },
    });
    return response;
  }

  async function runTrackerAction(tracker, action, payload = {}) {
    try {
      setStatus(`Applying ${action} on ${tracker}...`);
      await sendTrackerControl(tracker, action, payload);
      await refreshTrackerStatuses();
      stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    }
  }

  function trackerLabel(key) {
    const labels = {
      wr: "WR",
      leaderboard: "Leaderboard",
      displayname: "Displayname",
      club: "Club",
    };
    return labels[String(key || "").trim().toLowerCase()] || String(key || "-");
  }

  function trackerSupportsInterval(key) {
    const safe = String(key || "").trim().toLowerCase();
    return safe === "wr" || safe === "leaderboard" || safe === "displayname";
  }

  function trackerIntervalSeconds(key, statusPayload) {
    const safe = String(key || "").trim().toLowerCase();
    if (safe === "wr" || safe === "leaderboard") {
      return Number(statusPayload?.runtime?.tickSeconds || 0);
    }
    if (safe === "displayname") {
      return Number(statusPayload?.maintenanceIntervalSeconds || 0);
    }
    return 0;
  }

  function summarizeTrackerPriorityStatus(trackers = {}) {
    const keys = ["wr", "leaderboard", "displayname", "club"];
    const enabledKeys = keys.filter((key) => Boolean(trackers?.[key]?.ok && trackerEnabled(key, trackers[key].status)));

    if (!enabledKeys.length) return "All trackers paused";
    if (enabledKeys.length === 1) {
      const key = enabledKeys[0];
      const status = trackers?.[key]?.status || {};
      const intervalSeconds = trackerIntervalSeconds(key, status);
      if (!trackerSupportsInterval(key) || intervalSeconds <= 0) {
        return `Priority mode active: ${trackerLabel(key)} only`;
      }
      if (key === "displayname") {
        const gapSeconds = Math.max(0, Number(status.minRequestGapMs || 0)) / 1000;
        return `Priority mode active: ${trackerLabel(key)} every ${fmtRate(intervalSeconds)}s` +
          ` (gap ${gapSeconds > 0 ? `${fmtRate(gapSeconds)}s` : "-"})`;
      }
      return `Priority mode active: ${trackerLabel(key)} every ${fmtRate(intervalSeconds)}s`;
    }
    return `Normal mode (${enabledKeys.map(trackerLabel).join(", ")} enabled)`;
  }

  function readTrackerPriorityControls() {
    const targetEl = document.getElementById("trackerPriorityTarget");
    const intervalEl = document.getElementById("trackerPriorityInterval");
    const pauseEl = document.getElementById("trackerPriorityPauseOthers");
    const target = String(targetEl?.value || "displayname").trim().toLowerCase();
    const intervalSeconds = clampInt(intervalEl?.value, { min: 3, max: 3600, fallback: 3 });
    const pauseOthers = Boolean(pauseEl?.checked);
    return { target, intervalSeconds, pauseOthers };
  }

  function syncTrackerPriorityControls() {
    const targetEl = document.getElementById("trackerPriorityTarget");
    const intervalEl = document.getElementById("trackerPriorityInterval");
    const target = String(targetEl?.value || "displayname").trim().toLowerCase();
    if (intervalEl) {
      intervalEl.disabled = !trackerSupportsInterval(target);
    }
  }

  function setTrackerPriorityButtonsDisabled(disabled) {
    const enableBtn = document.getElementById("trackerPriorityEnableBtn");
    const disableBtn = document.getElementById("trackerPriorityDisableBtn");
    if (enableBtn) enableBtn.disabled = Boolean(disabled);
    if (disableBtn) disableBtn.disabled = Boolean(disabled);
  }

  async function setTrackerPriorityMode(enablePriority) {
    const enable = Boolean(enablePriority);
    try {
      setTrackerPriorityButtonsDisabled(true);
      setStatus(enable ? "Applying priority mode..." : "Restoring tracker mode...");

      if (enable) {
        const { target, intervalSeconds, pauseOthers } = readTrackerPriorityControls();
        await fetchDashJson("/trackers/priority", {
          method: "POST",
          body: {
            action: "apply",
            target,
            intervalSeconds,
            pauseOthers,
          },
        });
      } else {
        await fetchDashJson("/trackers/priority", {
          method: "POST",
          body: {
            action: "restore",
          },
        });
      }

      await refreshTrackerStatuses();
      stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    } finally {
      setTrackerPriorityButtonsDisabled(false);
    }
  }

  function syncLogsServiceSelect() {
    const select = document.getElementById("logsService");
    if (!select) return;

    const services = Array.isArray(state.logs.services) ? state.logs.services : [];
    const currentService = state.logs.service;

    select.innerHTML = "";
    if (!services.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No services found";
      select.appendChild(option);
      select.disabled = true;
      state.logs.service = "";
      return;
    }

    services.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.service;
      const streamLabel =
        entry.hasOut && entry.hasError ? "" : entry.hasOut ? " (stdout only)" : " (stderr only)";
      option.textContent = `${entry.service}${streamLabel}`;
      select.appendChild(option);
    });

    const hasCurrent = services.some((entry) => entry.service === currentService);
    state.logs.service = hasCurrent ? currentService : services[0].service;
    select.value = state.logs.service;
    select.disabled = false;
  }

  function isLogOutputNearBottom(outputEl) {
    if (!outputEl) return true;
    const distanceFromBottom =
      outputEl.scrollHeight - (outputEl.scrollTop + outputEl.clientHeight);
    return distanceFromBottom <= 24;
  }

  function renderLogsResult(payload = {}) {
    const metaEl = document.getElementById("logsMeta");
    const outputEl = document.getElementById("logsOutput");
    if (!metaEl || !outputEl) return;

    const service = String(payload.service || state.logs.service || "-");
    const stream = String(payload.stream || state.logs.stream || "out");
    const rows = Array.isArray(payload.lines) ? payload.lines : [];
    const lineCount = Number(payload.lineCount || rows.length || 0);
    const sizeBytes = Number(payload.totalSizeBytes || 0);
    const truncated = Boolean(payload.truncated);
    const previousScrollTop = outputEl.scrollTop;
    const wasNearBottom = isLogOutputNearBottom(outputEl);

    metaEl.textContent =
      `${service} / ${stream} | ${lineCount} lines | ${fmtBytes(sizeBytes)}` +
      (truncated ? " | showing tail" : "") +
      (!state.logs.followTail ? " | follow off" : "");
    outputEl.textContent = rows.length ? rows.join("\n") : "(No log lines yet.)";
    if (state.logs.followTail || wasNearBottom) {
      outputEl.scrollTop = outputEl.scrollHeight;
    } else {
      outputEl.scrollTop = previousScrollTop;
    }
  }

  function renderLogsError(message) {
    const metaEl = document.getElementById("logsMeta");
    const outputEl = document.getElementById("logsOutput");
    if (metaEl) metaEl.textContent = "Logs unavailable";
    if (outputEl) outputEl.textContent = String(message || "Failed to load logs.");
  }

  async function refreshLogServices({ silent = false } = {}) {
    try {
      if (!silent) setStatus("Refreshing log services...");
      const payload = await fetchDashJson("/logs/services");
      state.logs.services = Array.isArray(payload?.services) ? payload.services : [];
      syncLogsServiceSelect();
      if (!silent) stampStatus("Updated");
    } catch (error) {
      state.logs.services = [];
      syncLogsServiceSelect();
      renderLogsError(error?.message || error);
      setStatus(`Error: ${error?.message || error}`);
    }
  }

  let logsRefreshBusy = false;

  async function refreshLogs({ silent = false, reloadServices = false } = {}) {
    if (logsRefreshBusy) return;
    logsRefreshBusy = true;
    try {
      if (reloadServices || !state.logs.services.length) {
        await refreshLogServices({ silent: true });
      }

      if (!state.logs.service) {
        renderLogsError("No log services available.");
        return;
      }

      if (silent && !reloadServices && !state.logs.followTail) {
        return false;
      }

      if (!silent) setStatus(`Refreshing logs (${state.logs.service})...`);
      const service = encodeURIComponent(state.logs.service);
      const stream = encodeURIComponent(state.logs.stream || "out");
      const lines = clampInt(state.logs.lines, { min: 10, max: 2000, fallback: 200 });
      const payload = await fetchDashJson(`/logs/service/${service}?stream=${stream}&lines=${lines}`);
      renderLogsResult(payload || {});
      if (!silent) stampStatus("Updated");
      return true;
    } catch (error) {
      renderLogsError(error?.message || error);
      setStatus(`Error: ${error?.message || error}`);
      return false;
    } finally {
      logsRefreshBusy = false;
    }
  }

  function renderAlteredSyncRuns(rows = []) {
    const body = document.getElementById("alteredSyncRunsBody");
    if (!body) return;
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No altered sync runs found.</td></tr>';
      return;
    }
    rows.forEach((run) => {
      const tr = document.createElement("tr");
      const mapsText =
        `${fmtNumber(run.mapsSeen || 0)} seen` +
        ` | +${fmtNumber(run.mapsInserted || 0)}` +
        ` | ~${fmtNumber(run.mapsUpdated || 0)}`;
      tr.innerHTML =
        `<td>#${escapeHtml(String(run.runId || "-"))}</td>` +
        `<td>${escapeHtml(String(run.status || "-"))}</td>` +
        `<td>${escapeHtml(fmtDateTime(run.finishedAt || run.startedAt))}</td>` +
        `<td>${escapeHtml(mapsText)}</td>` +
        `<td title="${escapeHtml(String(run.note || ""))}">${escapeHtml(String(run.note || "-"))}</td>`;
      body.appendChild(tr);
    });
  }

  function renderAlteredPollRuns(rows = []) {
    const body = document.getElementById("alteredPollRunsBody");
    if (!body) return;
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No altered check runs found.</td></tr>';
      return;
    }
    rows.forEach((run) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>#${escapeHtml(String(run.runId || "-"))}</td>` +
        `<td>${escapeHtml(String(run.status || "-"))}</td>` +
        `<td>${escapeHtml(fmtDateTime(run.finishedAt || run.startedAt))}</td>` +
        `<td>${escapeHtml(fmtNumber(run.mapsChecked || run.mapsTotal || 0))}</td>` +
        `<td>${escapeHtml(fmtNumber(run.mapsChanged || 0))}</td>`;
      body.appendChild(tr);
    });
  }

  function renderAlteredCheckHistory(rows = []) {
    const body = document.getElementById("alteredCheckBody");
    const metaEl = document.getElementById("alteredCheckMeta");
    if (!body) return;
    body.innerHTML = "";
    const query = String(state.altered.checkQuery || "").trim();
    if (metaEl) {
      metaEl.textContent = rows.length
        ? `${fmtNumber(rows.length)} recent checks loaded${query ? ` | filter: ${query}` : ""}`
        : query
          ? `No recent checks match "${query}".`
          : "No recent checks loaded.";
    }
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No altered check events found.</td></tr>';
      return;
    }
    rows.forEach((event) => {
      const result = event.error ? "error" : event.changed ? "WR changed" : "checked";
      const changeText = event.changed
        ? `${fmtMs(event.oldWrMs || 0)} -> ${fmtMs(event.newWrMs || 0)}`
        : "-";
      const mapText = `${String(event.mapName || "Unknown map")} | ${String(event.mapUid || "-")}`;
      const noteText = event.error ? String(event.error) : changeText;
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${escapeHtml(fmtDateTime(event.checkedAt))}</td>` +
        `<td class="cell-key" title="${escapeHtml(mapText)}">` +
          `<span class="cell-key-host">${escapeHtml(String(event.mapUid || "-"))}</span>` +
          `<span class="cell-key-path">${escapeHtml(String(event.mapName || "Unknown map"))}</span>` +
        `</td>` +
        `<td>${escapeHtml(result)}</td>` +
        `<td title="${escapeHtml(noteText)}">${escapeHtml(noteText)}</td>` +
        `<td>${escapeHtml(event.runId ? `#${event.runId}` : "-")}</td>`;
      body.appendChild(tr);
    });
  }

  function renderAlteredSummary(payload = {}) {
    const altered = payload?.altered || {};
    const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
    const degraded = Boolean(payload?.degraded) || warnings.length > 0;
    const hook = altered.hook || null;
    const syncRuns = Array.isArray(altered.syncRuns) ? altered.syncRuns : [];
    const liveStatus = altered.liveStatus || {};
    const monitor = liveStatus?.monitor || {};
    const pollRuns = Array.isArray(altered.pollRuns) ? altered.pollRuns : [];
    const opsOverview = altered.opsOverview || {};
    const scheduler = opsOverview?.scheduler || {};
    const latestSyncRun = hook?.latestRun || syncRuns[0] || null;
    const latestPollRun = pollRuns[0] || null;

    state.altered.summary = altered;
    state.altered.syncRuns = syncRuns;
    state.altered.pollRuns = pollRuns;

    const summaryLineEl = document.getElementById("alteredSummaryLine");
    if (summaryLineEl) {
      const clubName = String(hook?.clubName || "Altered").trim();
      const clubId = hook?.clubId ? `#${hook.clubId}` : "-";
      const schedulerText = scheduler?.enabled ? `ops scheduler ${scheduler.tickSeconds || "-"}s` : "ops scheduler paused";
      const warningText = degraded ? ` | partial:${warnings.length}` : "";
      summaryLineEl.textContent =
        `${clubName} (${clubId}) | full=${monitor.running ? "running" : "idle"} | discovery=${monitor.discoveryRunning ? "running" : monitor.discoveryEnabled ? "enabled" : "disabled"} | ${schedulerText}${warningText}`;
    }

    setText("alteredLastFull", monitor.lastFinishedAt ? fmtDateTime(monitor.lastFinishedAt) : monitor.lastError ? "error" : "-");
    setText("alteredNextFull", monitor.nextRunAt ? fmtDateTime(monitor.nextRunAt) : "-");
    setText(
      "alteredLatestSnapshot",
      latestSyncRun?.finishedAt ? fmtDateTime(latestSyncRun.finishedAt) : hook?.lastSyncedAt ? fmtDateTime(hook.lastSyncedAt) : "-"
    );
    setText(
      "alteredLatestPollRun",
      latestPollRun?.finishedAt
        ? `${fmtDateTime(latestPollRun.finishedAt)}`
        : latestPollRun?.startedAt
          ? fmtDateTime(latestPollRun.startedAt)
          : "-"
    );

    const hookStatusEl = document.getElementById("alteredHookStatus");
    if (hookStatusEl) {
      if (!hook) {
        const hookWarning = warnings.find((item) => item.key === "hook" || item.key === "syncRuns");
        hookStatusEl.textContent = hookWarning
          ? `Hook: partial | ${hookWarning.message}`
          : "Hook: unavailable";
      } else {
        const mapsSeen = latestSyncRun ? `${fmtNumber(latestSyncRun.mapsSeen || 0)} seen` : "-";
        const hookWarning = warnings.find((item) => item.key === "hook" || item.key === "syncRuns");
        hookStatusEl.textContent =
          `Hook ${hook.enabled ? "enabled" : "disabled"} | auto-track ${hook.autoTrackNewMaps ? "on" : "off"} | ` +
          `tracked maps ${fmtNumber(hook.trackedCount || 0)} / ${fmtNumber(hook.mapCount || 0)} | latest snapshot ${mapsSeen}` +
          (hookWarning ? ` | warning: ${hookWarning.message}` : "");
      }
    }

    const liveStatusEl = document.getElementById("alteredLiveStatus");
    if (liveStatusEl) {
      const liveWarning = warnings.find((item) => item.key === "liveStatus" || item.key === "opsOverview" || item.key === "pollRuns");
      if (!liveStatus || typeof liveStatus !== "object") {
        liveStatusEl.textContent = liveWarning
          ? `Monitor: partial | ${liveWarning.message}`
          : "Monitor: unavailable";
      } else if (monitor.lastSummary) {
        liveStatusEl.textContent =
          `Monitor ${monitor.enabled ? "enabled" : "disabled"} | last full sync ${fmtNumber(monitor.lastSummary.campaignsLoaded || 0)} campaigns, ` +
          `${fmtNumber(monitor.lastSummary.mapsLoaded || 0)} maps | ${fmtDateTime(monitor.lastFinishedAt)}` +
          (liveWarning ? ` | warning: ${liveWarning.message}` : "");
      } else if (monitor.lastError) {
        liveStatusEl.textContent = `Monitor error: ${monitor.lastError}`;
      } else {
        liveStatusEl.textContent =
          `Monitor ${monitor.enabled ? "enabled" : "disabled"} | last full sync pending` +
          (liveWarning ? ` | warning: ${liveWarning.message}` : "");
      }
    }

    renderAlteredSyncRuns(syncRuns);
    renderAlteredPollRuns(pollRuns);
  }

  let alteredRefreshBusy = false;
  let alteredActionBusy = false;

  async function refreshAlteredCheckHistory({ silent = false } = {}) {
    const params = new URLSearchParams();
    params.set("limit", "120");
    if (state.altered.checkQuery) params.set("q", state.altered.checkQuery);
    if (!silent) setStatus("Loading altered check history...");
    const payload = await fetchDashJson(`/altered/check-history?${params.toString()}`);
    state.altered.checkEvents = Array.isArray(payload?.events) ? payload.events : [];
    renderAlteredCheckHistory(state.altered.checkEvents);
  }

  async function refreshAlteredPanel({ silent = false } = {}) {
    if (alteredRefreshBusy) return;
    alteredRefreshBusy = true;
    try {
      if (!silent) setStatus("Loading altered summary...");
      const payload = await fetchDashJson("/altered/summary?sync_runs_limit=12&poll_runs_limit=20");
      renderAlteredSummary(payload || {});
      await waitForNextPaint();
      await refreshAlteredCheckHistory({ silent: true });
      if (!silent) stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
      renderAlteredCheckHistory([]);
      const summaryLineEl = document.getElementById("alteredSummaryLine");
      if (summaryLineEl) summaryLineEl.textContent = `Altered unavailable: ${error?.message || error}`;
    } finally {
      alteredRefreshBusy = false;
    }
  }

  async function runAlteredAction(action) {
    if (alteredActionBusy) return;
    alteredActionBusy = true;
    const isDiscovery = action === "run-discovery-sync";
    const runFullBtn = document.getElementById("alteredRunFullBtn");
    const runDiscoveryBtn = document.getElementById("alteredRunDiscoveryBtn");
    if (runFullBtn) runFullBtn.disabled = true;
    if (runDiscoveryBtn) runDiscoveryBtn.disabled = true;
    try {
      setStatus(isDiscovery ? "Starting altered discovery sync..." : "Starting altered full sync...");
      await fetchDashJson(isDiscovery ? "/altered/run-discovery-sync" : "/altered/run-full-sync", {
        method: "POST",
        body: {},
      });
      await refreshAlteredPanel({ silent: true });
      stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    } finally {
      if (runFullBtn) runFullBtn.disabled = false;
      if (runDiscoveryBtn) runDiscoveryBtn.disabled = false;
      alteredActionBusy = false;
    }
  }

  function setNadeoQueueOpen(isOpen) {
    state.nadeoQueue.open = Boolean(isOpen);
    const panel = document.getElementById("nadeoQueuePanel");
    if (panel) panel.hidden = !state.nadeoQueue.open;
    const toggleBtn = document.getElementById("nadeoQueueToggleBtn");
    if (toggleBtn) {
      toggleBtn.textContent = state.nadeoQueue.open ? "Hide Queue" : "Queue";
    }
  }

  function renderNadeoQueue(payload = {}) {
    const queue = payload?.queue || {};
    const rows = Array.isArray(queue.waiters) ? queue.waiters : [];
    state.nadeoQueue.rows = rows;
    state.nadeoQueue.pendingCount = Number(queue.pendingCount || 0);
    state.nadeoQueue.generatedAt = String(payload.generatedAt || "");

    setText("qPending", fmtNumber(queue.pendingCount || 0));
    setText("qActive", queue.activeWaiterId ? "yes" : "no");
    setText("qOldest", fmtSeconds(queue.oldestPendingSeconds));
    setText("qLastGrant", queue.lastGrantedAt ? fmtDateTime(queue.lastGrantedAt) : "-");

    const metaEl = document.getElementById("nadeoQueueMeta");
    if (metaEl) {
      if (queue.configured === false) {
        metaEl.textContent = queue.error || "Queue state file is not configured.";
      } else {
        const sourceText = queue.stateFile ? `source: ${queue.stateFile}` : "source: -";
        const minGapSec = Math.max(0, Number(queue.minGapMs || 0)) / 1000;
        const oneReqEvery = minGapSec > 0 ? `${minGapSec.toFixed(2)} sec` : "-";
        const lastReqText = queue.secondsSinceLastRequest >= 0 ? fmtSeconds(queue.secondsSinceLastRequest) : "-";
        metaEl.textContent = `${sourceText} | 1 req/${oneReqEvery} | last req ${lastReqText} ago`;
      }
    }

    const body = document.getElementById("nadeoQueueBody");
    if (!body) return;
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">Queue is empty.</td></tr>';
      return;
    }

    rows
      .slice()
      .sort((a, b) => Date.parse(String(a.enqueuedAt || "")) - Date.parse(String(b.enqueuedAt || "")))
      .forEach((item) => {
        const statusText = String(item.status || "-");
        const waitMs =
          Number(item.appliedWaitMs || 0) > 0
            ? Number(item.appliedWaitMs || 0)
            : Number(item.requestedWaitMs || 0);
        const tr = document.createElement("tr");
        tr.innerHTML =
          `<td>${escapeHtml(statusText)}</td>` +
          `<td>${escapeHtml(item.label || "-")}</td>` +
          `<td>${escapeHtml(String(item.pid || "-"))}</td>` +
          `<td>${escapeHtml(fmtMs(waitMs))}</td>` +
          `<td>${escapeHtml(fmtDateTime(item.enqueuedAt))}</td>` +
          `<td>${escapeHtml(fmtDateTime(item.grantedAt))}</td>` +
          `<td>${escapeHtml(fmtDateTime(item.completedAt))}</td>`;
        body.appendChild(tr);
      });
  }

  async function refreshNadeoQueue({ silent = false } = {}) {
    try {
      const payload = await fetchDashJson("/nadeo/queue?limit=120");
      renderNadeoQueue(payload || {});
      if (!silent) stampStatus("Updated");
    } catch (error) {
      const metaEl = document.getElementById("nadeoQueueMeta");
      if (metaEl) metaEl.textContent = `Queue unavailable: ${error?.message || error}`;
      const body = document.getElementById("nadeoQueueBody");
      if (body) body.innerHTML = '<tr><td colspan="7" class="muted">Failed to load queue.</td></tr>';
      if (!silent) setStatus(`Error: ${error?.message || error}`);
    }
  }

  /* ── Chart ───────────────────────────────────── */

  function renderTrafficChart(points = []) {
    const svg = document.getElementById("trafficChart");
    if (!svg) return;
    const width = 900;
    const height = 260;
    const padding = { left: 28, right: 10, top: 12, bottom: 26 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    if (!points.length) {
      svg.innerHTML =
        `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(125,169,255,0.35)" />` +
        `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="rgba(160,180,210,0.8)" font-size="13">No traffic in selected range.</text>`;
      return;
    }

    const maxY = Math.max(
      1,
      ...points.map((point) =>
        Math.max(
          Number(point.requests || 0),
          Number(point.incomingRequests || 0),
          Number(point.outgoingRequests || 0)
        )
      )
    );

    const xAt = (idx) =>
      points.length <= 1 ? padding.left : padding.left + (idx / (points.length - 1)) * innerW;
    const yAt = (val) => padding.top + innerH - (Math.max(0, Number(val || 0)) / maxY) * innerH;

    const pathFor = (selector) =>
      points
        .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xAt(idx).toFixed(2)} ${yAt(point[selector]).toFixed(2)}`)
        .join(" ");

    const grids = [0.25, 0.5, 0.75]
      .map((ratio) => {
        const y = padding.top + innerH - ratio * innerH;
        return `<line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}" stroke="rgba(125,169,255,0.12)" />`;
      })
      .join("");

    const legendY = height - 7;
    const legend = [
      { label: "All requests", color: "#55b2ff", x: padding.left + 8 },
      { label: "Incoming", color: "#73f2cc", x: padding.left + 170 },
      { label: "Outgoing", color: "#ffc774", x: padding.left + 290 },
    ]
      .map(
        (item) =>
          `<circle cx="${item.x}" cy="${legendY - 4}" r="3" fill="${item.color}"></circle>` +
          `<text x="${item.x + 9}" y="${legendY}" fill="rgba(170,190,220,0.9)" font-size="11">${item.label}</text>`
      )
      .join("");

    svg.innerHTML =
      grids +
      `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(125,169,255,0.35)" />` +
      `<path d="${pathFor("requests")}" fill="none" stroke="#55b2ff" stroke-width="2.6"></path>` +
      `<path d="${pathFor("incomingRequests")}" fill="none" stroke="#73f2cc" stroke-width="2"></path>` +
      `<path d="${pathFor("outgoingRequests")}" fill="none" stroke="#ffc774" stroke-width="2" stroke-dasharray="5 4"></path>` +
      legend;
  }

  /* ── Filter sync ─────────────────────────────── */

  function syncControls() {
    document.getElementById("windowHours").value = String(state.filters.windowHours);

    const projectSelect = document.getElementById("projectKey");
    const selectedProject = state.filters.projectKey;
    projectSelect.innerHTML = '<option value="">All projects</option>';
    state.projects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.projectKey;
      option.textContent = project.projectName || project.projectKey;
      projectSelect.appendChild(option);
    });
    projectSelect.value = [...projectSelect.options].some((option) => option.value === selectedProject)
      ? selectedProject
      : "";
    state.filters.projectKey = projectSelect.value;

    const serviceSelect = document.getElementById("serviceName");
    const selectedService = state.filters.service;
    serviceSelect.innerHTML = '<option value="">All services</option>';
    state.services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service;
      option.textContent = service;
      serviceSelect.appendChild(option);
    });
    serviceSelect.value = [...serviceSelect.options].some((option) => option.value === selectedService)
      ? selectedService
      : "";
    state.filters.service = serviceSelect.value;

    const errorsSearch = document.getElementById("errorsSearch");
    if (errorsSearch && errorsSearch.value !== state.errors.q) {
      errorsSearch.value = state.errors.q;
    }
    const errorsDirection = document.getElementById("errorsDirection");
    if (errorsDirection) {
      errorsDirection.value = state.errors.direction || "";
    }

    syncLogsServiceSelect();
    const logsStream = document.getElementById("logsStream");
    if (logsStream) logsStream.value = state.logs.stream || "out";
    const logsLines = document.getElementById("logsLines");
    if (logsLines) logsLines.value = String(clampInt(state.logs.lines, { min: 10, max: 2000, fallback: 200 }));
    const logsFollowTail = document.getElementById("logsFollowTail");
    if (logsFollowTail) logsFollowTail.checked = Boolean(state.logs.followTail);
    const alteredCheckSearch = document.getElementById("alteredCheckSearch");
    if (alteredCheckSearch && alteredCheckSearch.value !== state.altered.checkQuery) {
      alteredCheckSearch.value = state.altered.checkQuery;
    }
  }

  /* ── Overview metrics ────────────────────────── */

  function updateOverview(overview = {}) {
    const live = overview.live || {};
    setText("mRequests", fmtNumber(overview.requests || 0));
    setText("mRps", fmtRate(live.requestsPerSecond || 0));
    setText("mRpm", fmtNumber(live.requestsPerMinute || 0));
    setText("mIncoming", fmtNumber(overview.incomingRequests || 0));
    setText("mOutgoing", fmtNumber(overview.outgoingRequests || 0));
    setText("mNadeoOut", fmtNumber(overview.nadeoOutgoingRequests || 0));
    setText("mInternalOut", fmtNumber(overview.internalOutgoingRequests || 0));
    setText("mPublicNonNadeoOut", fmtNumber(overview.publicNonNadeoOutgoingRequests || 0));
    setText("mIncomingRps", fmtRate(live.incomingPerSecond || 0));
    setText("mOutgoingRps", fmtRate(live.outgoingPerSecond || 0));
    setText("mNadeoRps", fmtRate(live.nadeoOutgoingPerSecond || 0));
    setText("mNadeoPerSec", `1 req/${fmtOneReqEverySeconds(live.nadeoOutgoingPerSecond || 0)}`);
    setText("mNadeoRpm", fmtNumber(live.nadeoOutgoingPerMinute || 0));
    setText("mInternalRps", fmtRate(live.internalOutgoingPerSecond || 0));
    setText("mPublicNonNadeoRps", fmtRate(live.publicNonNadeoOutgoingPerSecond || 0));
    setText("mErrors", fmtNumber(overview.errorRequests || 0));
    setText("mErrorRate", fmtPercent(overview.errorRatePct || 0));
    setText("mDuration", fmtMs(overview.avgDurationMs || 0));
    setText("mBytesIn", fmtBytes(overview.bytesIn || 0));
    setText("mBytesOut", fmtBytes(overview.bytesOut || 0));
    setText("mNadeoBytes", fmtBytes(overview.nadeoTransferBytes || 0));
    setText("mInternalBytes", fmtBytes(overview.internalTransferBytes || 0));
    setText("mPublicNonNadeoBytes", fmtBytes(overview.publicNonNadeoTransferBytes || 0));
  }

  /* ── Refresh logic ───────────────────────────── */

  let fullRefreshBusy = false;
  let errorRefreshBusy = false;

  function stampStatus(prefix = "Updated") {
    setStatus(
      `${prefix} ${new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
      })}`
    );
  }

  async function refreshOverviewPanel({ silent = false } = {}) {
    if (!silent) setStatus("Loading overview...");
    const query = buildQuery();
    const overviewPayload = await fetchDashJson(`/traffic/overview?${query}`);
    updateOverview(overviewPayload?.overview || {});
    if (state.nadeoQueue.open) {
      await refreshNadeoQueue({ silent: true });
    }
    await waitForNextPaint();
    if (!silent) setStatus("Loading timeline...");
    const bucket = state.filters.windowHours <= 6 ? "minute" : "hour";
    const seriesPayload = await fetchDashJson(`/traffic/timeseries?${query}&bucket=${bucket}`);
    const points = Array.isArray(seriesPayload?.series?.points) ? seriesPayload.series.points : [];
    renderTrafficChart(points);
  }

  async function refreshErrorsOnly({ silent = false } = {}) {
    if (errorRefreshBusy) return;
    errorRefreshBusy = true;
    try {
      if (!silent) setStatus("Refreshing errors...");
      const query = buildQuery({
        status_min: 400,
        q: state.errors.q,
        direction: state.errors.direction,
        page: state.errors.page,
        limit: state.errors.limit,
      });
      const payload = await fetchDashJson(`/traffic/errors?${query}`);
      const errors = payload?.errors || {};
      renderErrorsTable(errors);
      if (!silent) stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    } finally {
      errorRefreshBusy = false;
    }
  }

  function routeSubtabRequest(subtab) {
    const active = ROUTE_SUB_TABS.includes(subtab) ? subtab : "incoming";
    const query = buildQuery();
    if (active === "outgoing") {
      return {
        bodyId: "outgoingBody",
        cacheKey: "outgoing",
        emptyMessage: "No outbound traffic in this range.",
        path: `/traffic/top?${query}&direction=outgoing&dimension=target&limit=12`,
      };
    }
    if (active === "nadeo") {
      return {
        bodyId: "nadeoBody",
        cacheKey: "nadeo",
        emptyMessage: "No Nadeo outbound traffic in this range.",
        path: `/traffic/top?${query}&direction=outgoing&dimension=nadeo_route&limit=12`,
      };
    }
    return {
      bodyId: "incomingBody",
      cacheKey: "incoming",
      emptyMessage: state.filters.service
        ? `No incoming traffic for selected service (${state.filters.service}).`
        : "No traffic samples in this range.",
      path: `/traffic/top?${query}&direction=incoming&dimension=route&limit=12`,
    };
  }

  async function refreshRoutesPanel({ silent = false } = {}) {
    const request = routeSubtabRequest(state.routeSubTab);
    if (!silent) setStatus(`Loading ${state.routeSubTab} routes...`);
    setTopTableLoading(request.bodyId, true, `Refreshing ${state.routeSubTab} routes...`);
    try {
      const payload = await fetchDashJson(request.path);
      renderTopTable(request.bodyId, payload?.top?.items || [], request.cacheKey, request.emptyMessage);
    } catch (error) {
      setTopTableLoading(request.bodyId, false);
      throw error;
    }
  }

  async function loadFilters({ refreshProjects = false } = {}) {
    const tasks = [
      fetchDashJson(`/traffic/facets?window_hours=${encodeURIComponent(state.filters.windowHours)}`),
    ];
    if (refreshProjects || !state.projects.length) {
      tasks.unshift(fetchDashJson("/projects?limit=250"));
    }
    const results = await Promise.all(tasks);
    const projectsPayload = refreshProjects || !state.projects.length ? results[0] : null;
    const facetsPayload = results[results.length - 1];
    if (projectsPayload) {
      state.projects = Array.isArray(projectsPayload?.projects) ? projectsPayload.projects : [];
    }
    const facets = facetsPayload?.facets || {};
    state.services = Array.isArray(facets.services) ? facets.services : [];
    syncControls();
  }

  async function refresh() {
    if (fullRefreshBusy) return;
    fullRefreshBusy = true;
    try {
      if (state.activeTab === "logs") {
        const refreshed = await refreshLogs({ silent: true, reloadServices: false });
        if (refreshed) {
          stampStatus("Updated");
        }
        return;
      }
      if (state.activeTab === "trackers") {
        await refreshTrackerStatuses();
        stampStatus("Updated");
        return;
      }
      if (state.activeTab === "altered") {
        await refreshAlteredPanel({ silent: false });
        return;
      }

      if (state.activeTab === "errors") {
        await refreshErrorsOnly({ silent: false });
        return;
      }

      if (state.activeTab === "routes") {
        await refreshRoutesPanel({ silent: false });
        stampStatus("Updated");
        return;
      }

      await refreshOverviewPanel({ silent: false });

      stampStatus("Updated");
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    } finally {
      fullRefreshBusy = false;
    }
  }

  /* ── Event binding ───────────────────────────── */

  function bindControls() {
    document.getElementById("windowHours").addEventListener("change", async (event) => {
      state.filters.windowHours = Math.max(1, Number(event.target.value || 24));
      state.errors.page = 1;
      await loadFilters({ refreshProjects: false });
      await refresh();
    });

    document.getElementById("projectKey").addEventListener("change", async (event) => {
      state.filters.projectKey = String(event.target.value || "").trim();
      state.errors.page = 1;
      await loadFilters({ refreshProjects: false });
      await refresh();
    });

    document.getElementById("serviceName").addEventListener("change", async (event) => {
      state.filters.service = String(event.target.value || "").trim();
      state.errors.page = 1;
      await refresh();
    });

    document.getElementById("refreshBtn").addEventListener("click", async () => {
      if (state.activeTab === "errors") {
        await refreshErrorsOnly();
      } else if (state.activeTab === "trackers") {
        await refreshTrackerStatuses();
        stampStatus("Updated");
      } else if (state.activeTab === "altered") {
        await refreshAlteredPanel({ silent: false });
      } else if (state.activeTab === "logs") {
        await refreshLogs({ reloadServices: true });
      } else {
        await refresh();
      }
    });

    document.getElementById("nadeoQueueToggleBtn")?.addEventListener("click", async () => {
      const nextOpen = !state.nadeoQueue.open;
      setNadeoQueueOpen(nextOpen);
      if (nextOpen) {
        await refreshNadeoQueue({ silent: true });
      }
    });

    document.getElementById("nadeoQueueRefreshBtn")?.addEventListener("click", async () => {
      await refreshNadeoQueue();
    });

    document.getElementById("nadeoQueueCloseBtn")?.addEventListener("click", () => {
      setNadeoQueueOpen(false);
    });

    /* Main tab buttons */
    document.querySelectorAll(".tab-nav .tab-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tab = btn.dataset.tab;
        if (tab === state.activeTab) return;
        setActiveTab(tab);

        if (tab === "errors") {
          state.errors.page = 1;
        }
        await refresh();
      });
    });

    /* Route sub-tab buttons */
    document.querySelectorAll("#tabRoutes .sub-tab-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const subtab = btn.dataset.subtab;
        if (subtab === state.routeSubTab) return;
        setActiveRouteSubTab(subtab);
        if (state.activeTab === "routes") {
          await refreshRoutesPanel({ silent: false });
          stampStatus("Updated");
        }
      });
    });

    /* Clickable rows - delegated to document */
    document.addEventListener("click", (event) => {
      const row = event.target.closest("tr.clickable-row");
      if (!row) return;

      const type = row.dataset.detailType;
      const idx = Number(row.dataset.detailIdx);
      if (!type || !Number.isFinite(idx)) return;

      const cache = state.cached[type];
      if (!cache || !cache[idx]) return;

      if (type === "errors") {
        openErrorDetail(cache[idx]);
      } else {
        openRouteDetail(cache[idx], type);
      }
    });

    /* Drawer close */
    document.getElementById("drawerCloseBtn")?.addEventListener("click", closeDrawer);
    document.querySelector(".drawer-backdrop")?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer();
    });

    /* Error controls */
    document.getElementById("errorsApplyBtn")?.addEventListener("click", async () => {
      state.errors.q = String(document.getElementById("errorsSearch")?.value || "").trim();
      state.errors.direction = String(document.getElementById("errorsDirection")?.value || "").trim();
      state.errors.page = 1;
      await refreshErrorsOnly();
    });

    document.getElementById("errorsSearch")?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      state.errors.q = String(document.getElementById("errorsSearch")?.value || "").trim();
      state.errors.page = 1;
      await refreshErrorsOnly();
    });

    document.getElementById("errorsDirection")?.addEventListener("change", async (event) => {
      state.errors.direction = String(event.target?.value || "").trim();
      state.errors.page = 1;
      await refreshErrorsOnly();
    });

    document.getElementById("errorsPrevBtn")?.addEventListener("click", async () => {
      if (state.errors.page <= 1) return;
      state.errors.page -= 1;
      await refreshErrorsOnly();
    });

    document.getElementById("errorsNextBtn")?.addEventListener("click", async () => {
      if (state.errors.page >= state.errors.totalPages) return;
      state.errors.page += 1;
      await refreshErrorsOnly();
    });

    /* Tracker controls */
    document.getElementById("trackerRefreshBtn")?.addEventListener("click", async () => {
      await refreshTrackerStatuses();
    });
    document.getElementById("trackerPriorityTarget")?.addEventListener("change", () => {
      syncTrackerPriorityControls();
    });
    document.getElementById("trackerPriorityEnableBtn")?.addEventListener("click", async () => {
      await setTrackerPriorityMode(true);
    });
    document.getElementById("trackerPriorityDisableBtn")?.addEventListener("click", async () => {
      await setTrackerPriorityMode(false);
    });

    document.getElementById("trackerWrRunNowBtn")?.addEventListener("click", async () => {
      await runTrackerAction("wr", "run-now");
    });
    document.getElementById("trackerLbRunNowBtn")?.addEventListener("click", async () => {
      await runTrackerAction("leaderboard", "run-now");
    });
    document.getElementById("trackerDnRunNowBtn")?.addEventListener("click", async () => {
      await runTrackerAction("displayname", "run-now");
    });

    document.getElementById("trackerWrToggleBtn")?.addEventListener("click", async (event) => {
      const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
      await runTrackerAction("wr", enabledNow ? "disable" : "enable");
    });
    document.getElementById("trackerLbToggleBtn")?.addEventListener("click", async (event) => {
      const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
      await runTrackerAction("leaderboard", enabledNow ? "disable" : "enable");
    });
    document.getElementById("trackerDnToggleBtn")?.addEventListener("click", async (event) => {
      const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
      await runTrackerAction("displayname", enabledNow ? "disable" : "enable");
    });
    document.getElementById("trackerClubToggleBtn")?.addEventListener("click", async (event) => {
      const enabledNow = String(event.currentTarget?.dataset?.enabled || "0") === "1";
      await runTrackerAction("club", enabledNow ? "disable" : "enable");
    });

    document.getElementById("alteredRefreshBtn")?.addEventListener("click", async () => {
      await refreshAlteredPanel({ silent: false });
    });
    document.getElementById("alteredRunFullBtn")?.addEventListener("click", async () => {
      await runAlteredAction("run-full-sync");
    });
    document.getElementById("alteredRunDiscoveryBtn")?.addEventListener("click", async () => {
      await runAlteredAction("run-discovery-sync");
    });
    document.getElementById("alteredCheckApplyBtn")?.addEventListener("click", async () => {
      state.altered.checkQuery = String(document.getElementById("alteredCheckSearch")?.value || "").trim();
      await refreshAlteredCheckHistory({ silent: false });
      stampStatus("Updated");
    });
    document.getElementById("alteredCheckClearBtn")?.addEventListener("click", async () => {
      state.altered.checkQuery = "";
      const input = document.getElementById("alteredCheckSearch");
      if (input) input.value = "";
      await refreshAlteredCheckHistory({ silent: false });
      stampStatus("Updated");
    });
    document.getElementById("alteredCheckSearch")?.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      state.altered.checkQuery = String(event.currentTarget?.value || "").trim();
      await refreshAlteredCheckHistory({ silent: false });
      stampStatus("Updated");
    });

    /* Logs controls */
    document.getElementById("logsRefreshBtn")?.addEventListener("click", async () => {
      await refreshLogs({ reloadServices: true });
    });

    document.getElementById("logsService")?.addEventListener("change", async (event) => {
      state.logs.service = String(event.target?.value || "").trim();
      await refreshLogs({ reloadServices: false });
    });

    document.getElementById("logsStream")?.addEventListener("change", async (event) => {
      state.logs.stream = String(event.target?.value || "out").trim().toLowerCase() === "error" ? "error" : "out";
      await refreshLogs({ reloadServices: false });
    });

    document.getElementById("logsLines")?.addEventListener("change", async (event) => {
      state.logs.lines = clampInt(event.target?.value, { min: 10, max: 2000, fallback: 200 });
      await refreshLogs({ reloadServices: false });
    });

    document.getElementById("logsFollowTail")?.addEventListener("change", async (event) => {
      state.logs.followTail = Boolean(event.target?.checked);
      if (state.logs.followTail) {
        const outputEl = document.getElementById("logsOutput");
        if (outputEl) outputEl.scrollTop = outputEl.scrollHeight;
        await refreshLogs({ reloadServices: false });
      }
    });

    document.getElementById("logsOutput")?.addEventListener("scroll", (event) => {
      const outputEl = event.currentTarget;
      if (!outputEl) return;
      const nextFollow = isLogOutputNearBottom(outputEl);
      if (nextFollow === state.logs.followTail) return;
      state.logs.followTail = nextFollow;
      const followToggle = document.getElementById("logsFollowTail");
      if (followToggle) followToggle.checked = nextFollow;
    });
  }

  /* ── Init ────────────────────────────────────── */

  setActiveTab("overview");
  setActiveRouteSubTab("incoming");
  setNadeoQueueOpen(false);
  bindControls();
  syncTrackerPriorityControls();
  loadFilters({ refreshProjects: true })
    .then(async () => {
      await refresh();
    })
    .catch((error) => setStatus(`Error: ${error?.message || error}`));
  setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }, POLL_REFRESH_MS);
})();
