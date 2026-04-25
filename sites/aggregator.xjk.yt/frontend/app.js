(function () {
  "use strict";

  const PER_PAGE = 25;
  const POLL_REFRESH_MS = 15000;
  function configureLocalLinks() {
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port || "80";
    const isLocal = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
    if (!isLocal) return;

    const map = {
      main: `http://xjk.localhost:${port}/`,
      altered: `http://altered.localhost:${port}/`,
      tools: `http://tools.localhost:${port}/`,
      plugins: `http://plugins.localhost:${port}/`,
      trackers: `http://trackers.localhost:${port}/`,
      aggregator: `http://aggregator.localhost:${port}/`,
    };

    document.querySelectorAll("[data-link]").forEach((el) => {
      const key = el.getAttribute("data-link");
      if (map[key]) el.setAttribute("href", map[key]);
    });
  }
  function fmtDate(value) {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString(undefined, {
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

  function fmtNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toLocaleString();
  }

  function fmtBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let idx = 0;
    let current = n;
    while (current >= 1024 && idx < units.length - 1) {
      current /= 1024;
      idx += 1;
    }
    const digits = current >= 100 ? 0 : current >= 10 ? 1 : 2;
    return `${current.toFixed(digits)} ${units[idx]}`;
  }

  function fmtPercent(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return `${n.toFixed(digits)}%`;
  }

  function fmtDurationSeconds(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "-";
    if (n < 60) return `${n.toFixed(1)}s`;
    const minutes = Math.floor(n / 60);
    const seconds = Math.round(n % 60);
    return `${minutes}m ${seconds}s`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderChangeBadge(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "*" || raw === "new") {
      return '<span class="change-flag is-new">*</span>';
    }
    if (raw === "yes" || raw === "changed" || raw === "1" || raw === "true") {
      return '<span class="change-flag is-yes">yes</span>';
    }
    if (raw === "no" || raw === "0" || raw === "false") {
      return '<span class="change-flag is-no">no</span>';
    }
    return '<span class="change-flag is-none">-</span>';
  }

  function setStatus(text) {
    const el = document.getElementById("statusLine");
    if (el) el.textContent = text;
  }

  function waitForNextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `${response.status} ${response.statusText}`);
    }
    return payload;
  }
  const state = {
    activeTab: "events",
    projectKey: "",
    projects: [],
    projectView: "maps",
    events: [],
    eventsMeta: {
      page: 1,
      pageSize: PER_PAGE,
      total: 0,
      totalPages: 1,
    },
    eventFilters: {
      projectKey: "",
      source: "",
      eventType: "",
      range: "24h",
      fromIso: "",
      toIso: "",
      q: "",
      changedOnly: false,
      includeSystem: false,
    },
    eventFacets: {
      sources: [],
      eventTypes: [],
    },
    maps: [],
    names: [],
    namesMeta: {
      mode: "cached",
      cachedCount: 0,
      candidateCount: 0,
    },
    page: { events: 1, maps: 1, names: 1 },
    db: {
      table: "",
      limit: 50,
      offset: 0,
      sortBy: "",
      sortDir: "desc",
      tableMetaByName: new Map(),
      columns: [],
    },
    metrics: {
      bucket: "hour",
      windowHours: 168,
    },
  };
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `tab-${tabId}`);
    });
    history.replaceState(null, "", `#${tabId}`);
  }
  function paginate(items, page) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const clamped = Math.max(1, Math.min(page, totalPages));
    const start = (clamped - 1) * PER_PAGE;
    return {
      slice: items.slice(start, start + PER_PAGE),
      page: clamped,
      totalPages,
      total,
    };
  }

  function updatePaginationUI(prefix, page, totalPages) {
    const info = document.getElementById(`${prefix}PageInfo`);
    const prev = document.getElementById(`${prefix}Prev`);
    const next = document.getElementById(`${prefix}Next`);
    if (info) info.textContent = `Page ${page} of ${totalPages}`;
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  }

  function toDatetimeLocalInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  function setEventRangeInputsEnabled() {
    const range = document.getElementById("eventsRangeFilter").value || "24h";
    const custom = range === "custom";
    document.getElementById("eventsFrom").disabled = !custom;
    document.getElementById("eventsTo").disabled = !custom;
  }

  function deriveEventTimeRange(filters) {
    const range = String(filters.range || "24h").toLowerCase();
    const now = Date.now();
    let fromIso = "";
    let toIso = "";

    if (range === "custom") {
      const fromMs = Date.parse(String(filters.fromIso || ""));
      const toMs = Date.parse(String(filters.toIso || ""));
      if (Number.isFinite(fromMs)) fromIso = new Date(fromMs).toISOString();
      if (Number.isFinite(toMs)) toIso = new Date(toMs).toISOString();
      return { fromIso, toIso };
    }
    if (range === "all") return { fromIso: "", toIso: "" };

    const lookup = {
      "1h": 1,
      "6h": 6,
      "24h": 24,
      "7d": 24 * 7,
      "30d": 24 * 30,
    };
    const hours = Number(lookup[range] || 24);
    fromIso = new Date(now - hours * 60 * 60 * 1000).toISOString();
    toIso = "";
    return { fromIso, toIso };
  }

  function readEventFiltersFromUI() {
    const range = document.getElementById("eventsRangeFilter").value || "24h";
    const fromLocal = String(document.getElementById("eventsFrom").value || "").trim();
    const toLocal = String(document.getElementById("eventsTo").value || "").trim();
    return {
      projectKey: String(document.getElementById("eventsProjectFilter").value || "").trim(),
      source: String(document.getElementById("eventsSourceFilter").value || "").trim(),
      eventType: String(document.getElementById("eventsTypeFilter").value || "").trim(),
      range,
      fromIso: fromLocal ? new Date(fromLocal).toISOString() : "",
      toIso: toLocal ? new Date(toLocal).toISOString() : "",
      q: String(document.getElementById("eventsQuery").value || "").trim(),
      changedOnly: Boolean(document.getElementById("eventsChangedOnly").checked),
      includeSystem: Boolean(document.getElementById("eventsIncludeSystem").checked),
    };
  }

  function syncEventFilterControlsFromState() {
    document.getElementById("eventsProjectFilter").value = state.eventFilters.projectKey || "";
    document.getElementById("eventsSourceFilter").value = state.eventFilters.source || "";
    document.getElementById("eventsTypeFilter").value = state.eventFilters.eventType || "";
    document.getElementById("eventsRangeFilter").value = state.eventFilters.range || "24h";
    document.getElementById("eventsFrom").value = state.eventFilters.fromIso
      ? toDatetimeLocalInputValue(new Date(state.eventFilters.fromIso))
      : "";
    document.getElementById("eventsTo").value = state.eventFilters.toIso
      ? toDatetimeLocalInputValue(new Date(state.eventFilters.toIso))
      : "";
    document.getElementById("eventsQuery").value = state.eventFilters.q || "";
    document.getElementById("eventsChangedOnly").checked = Boolean(state.eventFilters.changedOnly);
    document.getElementById("eventsIncludeSystem").checked = Boolean(state.eventFilters.includeSystem);
    setEventRangeInputsEnabled();
  }

  function populateEventFilterOptions() {
    const projectSelect = document.getElementById("eventsProjectFilter");
    const sourceSelect = document.getElementById("eventsSourceFilter");
    const typeSelect = document.getElementById("eventsTypeFilter");
    if (!projectSelect || !sourceSelect || !typeSelect) return;

    const selectedProject = state.eventFilters.projectKey || "";
    const selectedSource = state.eventFilters.source || "";
    const selectedType = state.eventFilters.eventType || "";

    projectSelect.innerHTML = '<option value="">All projects</option>';
    for (const project of state.projects) {
      const option = document.createElement("option");
      option.value = String(project.projectKey || "");
      option.textContent = String(project.projectName || project.projectKey || "");
      projectSelect.appendChild(option);
    }
    projectSelect.value = [...projectSelect.options].some((opt) => opt.value === selectedProject)
      ? selectedProject
      : "";

    const sources =
      state.eventFacets.sources.length > 0
        ? state.eventFacets.sources
        : [
            ...new Set(
              state.projects
                .map((project) => String(project.sourceLabel || "").trim())
                .filter(Boolean)
            ),
          ].sort((a, b) => a.localeCompare(b));
    sourceSelect.innerHTML = '<option value="">All sources</option>';
    for (const source of sources) {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      sourceSelect.appendChild(option);
    }
    sourceSelect.value = [...sourceSelect.options].some((opt) => opt.value === selectedSource)
      ? selectedSource
      : "";

    const eventTypes = state.eventFacets.eventTypes || [];
    typeSelect.innerHTML = '<option value="">All events</option>';
    for (const eventType of eventTypes) {
      const option = document.createElement("option");
      option.value = eventType;
      option.textContent = eventType;
      typeSelect.appendChild(option);
    }
    typeSelect.value = [...typeSelect.options].some((opt) => opt.value === selectedType)
      ? selectedType
      : "";

    state.eventFilters.projectKey = projectSelect.value;
    state.eventFilters.source = sourceSelect.value;
    state.eventFilters.eventType = typeSelect.value;
  }
  async function loadMeta() {
    const payload = await fetchJson("/api/v1/meta");
    const summary = payload?.summary || {};
    document.getElementById("mProjects").textContent = fmtNumber(summary.projects);
    document.getElementById("mMaps").textContent = fmtNumber(summary.maps);
    document.getElementById("mEvents").textContent = fmtNumber(summary.events);
    document.getElementById("mLatestEvent").textContent = fmtDate(summary.latestEventAt);
  }

  async function loadProjects() {
    const payload = await fetchJson("/api/v1/projects?limit=120");
    const projects = payload?.projects || [];
    state.projects = projects;
    const select = document.getElementById("projectSelect");
    const previous = state.projectKey;

    select.innerHTML = "";
    projects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.projectKey;
      option.textContent = `${project.projectName} (${project.projectKey})`;
      select.appendChild(option);
    });

    state.projectKey =
      projects.find((project) => project.projectKey === previous)?.projectKey ||
      projects[0]?.projectKey ||
      "";
    select.value = state.projectKey;
    populateEventFilterOptions();
    syncEventFilterControlsFromState();
  }

  async function loadEventFacets() {
    const range = deriveEventTimeRange(state.eventFilters);
    const params = new URLSearchParams();
    if (state.eventFilters.projectKey) params.set("project_key", state.eventFilters.projectKey);
    if (state.eventFilters.includeSystem) params.set("include_system", "1");
    if (range.fromIso) params.set("from_iso", range.fromIso);
    if (range.toIso) params.set("to_iso", range.toIso);

    const payload = await fetchJson(`/api/v1/events/facets?${params.toString()}`);
    state.eventFacets.sources = Array.isArray(payload?.sources) ? payload.sources : [];
    state.eventFacets.eventTypes = Array.isArray(payload?.eventTypes) ? payload.eventTypes : [];
    populateEventFilterOptions();
    syncEventFilterControlsFromState();
  }

  function isDisplaynameProject(project) {
    const key = String(project?.projectKey || "").toLowerCase();
    const name = String(project?.projectName || "").toLowerCase();
    return key.includes("displayname") || name.includes("displayname");
  }

  function setProjectTableHeaders(labels = ["Map", "Checks", "Changes", "Last Checked"]) {
    const ids = ["projectCol1", "projectCol2", "projectCol3", "projectCol4"];
    ids.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (el) el.textContent = labels[idx] || "-";
    });
  }

  async function loadProjectData() {
    const key = state.projectKey || document.getElementById("projectSelect").value;
    if (!key) return;
    state.projectKey = key;
    const project = state.projects.find((item) => item.projectKey === key) || null;
    const displaynameMode = isDisplaynameProject(project);
    state.projectView = displaynameMode ? "displayname" : "maps";

    const changedOnlyToggle = document.getElementById("changedOnly");
    const changedOnly = changedOnlyToggle.checked ? "1" : "0";
    changedOnlyToggle.disabled = displaynameMode;
    if (displaynameMode) changedOnlyToggle.checked = false;

    const instancesPromise = fetchJson(`/api/v1/projects/${encodeURIComponent(key)}/instances?limit=80`);
    let rowsPromise;
    if (displaynameMode) {
      setProjectTableHeaders(["Account", "Name", "Source", "Observed"]);
      rowsPromise = fetchJson("/api/v1/display-names?limit=500");
    } else {
      setProjectTableHeaders(["Map", "Checks", "Changes", "Last Checked"]);
      rowsPromise = fetchJson(
        `/api/v1/projects/${encodeURIComponent(key)}/maps?limit=500&changed_only=${changedOnly}`
      );
    }

    const [rowsPayload, instancesPayload] = await Promise.all([rowsPromise, instancesPromise]);
    state.maps = displaynameMode ? rowsPayload?.names || [] : rowsPayload?.maps || [];
    state.page.maps = 1;
    const suffix = displaynameMode ? " | displayname cache" : "";
    document.getElementById("projectInstances").textContent = `${instancesPayload?.count || 0} active/known${suffix}`;
    renderMaps();
  }

  async function loadEvents({ page = state.eventsMeta.page } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const range = deriveEventTimeRange(state.eventFilters);
    const requestedPageSize = Number(document.getElementById("eventsPageSize")?.value || state.eventsMeta.pageSize || PER_PAGE);
    state.eventsMeta.pageSize = Math.max(1, Math.min(500, requestedPageSize || PER_PAGE));
    const params = new URLSearchParams();
    params.set("limit", String(state.eventsMeta.pageSize || PER_PAGE));
    params.set("page", String(safePage));
    if (state.eventFilters.projectKey) params.set("project_key", state.eventFilters.projectKey);
    if (state.eventFilters.source) params.set("source", state.eventFilters.source);
    if (state.eventFilters.eventType) params.set("event_type", state.eventFilters.eventType);
    if (state.eventFilters.changedOnly) params.set("changed_only", "1");
    if (state.eventFilters.includeSystem) params.set("include_system", "1");
    if (range.fromIso) params.set("from_iso", range.fromIso);
    if (range.toIso) params.set("to_iso", range.toIso);
    if (state.eventFilters.q) params.set("q", state.eventFilters.q);

    const payload = await fetchJson(`/api/v1/events/recent?${params.toString()}`);
    state.events = payload?.events || [];
    state.eventsMeta.page = Math.max(1, Number(payload?.page || safePage));
    state.eventsMeta.pageSize = Math.max(1, Number(payload?.limit || state.eventsMeta.pageSize || PER_PAGE));
    state.eventsMeta.total = Math.max(0, Number(payload?.total || state.events.length));
    state.eventsMeta.totalPages = Math.max(1, Number(payload?.totalPages || 1));
    renderEvents();
  }

  async function loadNames() {
    const payload = await fetchJson("/api/v1/display-names?limit=500");
    const names = Array.isArray(payload?.names) ? payload.names : [];
    state.namesMeta.cachedCount = Number(payload?.count || names.length || 0);
    state.namesMeta.candidateCount = 0;

    if (names.length) {
      state.namesMeta.mode = "cached";
      state.names = names;
    } else {
      let candidates = [];
      try {
        const candidatePayload = await fetchJson(
          "/api/v1/display-names/candidates/details?limit=500&stale_after_seconds=3600"
        );
        candidates = Array.isArray(candidatePayload?.candidates) ? candidatePayload.candidates : [];
        state.namesMeta.candidateCount = Number(candidatePayload?.count || candidates.length || 0);
      } catch {
        candidates = [];
      }

      state.namesMeta.mode = "pending";
      state.names = candidates.map((candidate) => ({
        accountId: candidate.accountId || "-",
        displayName: null,
        observedAt: candidate.observedAt || null,
        lastSeenAt: candidate.lastSeenAt || null,
        stale: Boolean(candidate.stale),
        pending: true,
      }));
    }

    state.page.names = 1;
    renderNames();
  }

  async function loadClubSummary() {
    const clubId = Number(document.getElementById("clubId").value || 0);
    const [tablePayload, recentEventsPayload] = await Promise.all([
      fetchJson("/api/v1/db/tables?include_counts=1").catch(() => ({ tables: [] })),
      fetchJson("/api/v1/events/recent?limit=10&event_type=club.snapshot&include_system=1").catch(
        () => ({ events: [] })
      ),
    ]);

    const clubTables = (Array.isArray(tablePayload?.tables) ? tablePayload.tables : [])
      .filter((item) => /^clubs?$|^club_/i.test(String(item?.table || "")))
      .map((item) => ({
        table: item.table,
        rowCount: Number(item?.rowCount || 0),
      }));
    const clubRowsTotal = clubTables.reduce((acc, item) => acc + Number(item.rowCount || 0), 0);
    const recentSnapshots = (Array.isArray(recentEventsPayload?.events) ? recentEventsPayload.events : [])
      .slice(0, 5)
      .map((event) => ({
        occurredAt: event.occurredAt || null,
        projectKey: event.projectKey || null,
        detail: event.eventDetail || event.detail2 || "-",
      }));

    let summaryPayload = null;
    let campaignsPayload = null;
    let summaryError = null;

    if (clubId > 0 && clubRowsTotal > 0) {
      try {
        [summaryPayload, campaignsPayload] = await Promise.all([
          fetchJson(`/api/v1/clubs/${clubId}/summary`),
          fetchJson(`/api/v1/clubs/${clubId}/campaigns?limit=10`),
        ]);
      } catch (error) {
        summaryError = error;
      }
    }

    const payload = {
      clubId: clubId || null,
      summary: summaryPayload?.summary || null,
      campaigns: campaignsPayload?.campaigns || [],
      tableCounts: clubTables,
      recentSnapshots,
    };

    if (!clubId) {
      payload.note = "Enter a club ID to query a specific club snapshot.";
    } else if (clubRowsTotal <= 0) {
      payload.note = "No club snapshots ingested yet. Club tables are currently empty.";
    } else if (!payload.summary) {
      payload.note = summaryError?.message
        ? `No snapshot found for club ${clubId}: ${summaryError.message}`
        : `No snapshot found for club ${clubId}.`;
    }

    document.getElementById("clubSummary").textContent = JSON.stringify(
      payload,
      null,
      2
    );
  }
  function renderEvents() {
    const page = state.eventsMeta.page;
    const totalPages = state.eventsMeta.totalPages;
    const total = state.eventsMeta.total;

    document.getElementById("eventsCount").textContent = `${fmtNumber(total)} events`;
    const body = document.getElementById("eventsBody");
    body.innerHTML = "";

    if (!state.events.length) {
      body.innerHTML = '<tr><td colspan="5" class="muted">No events yet.</td></tr>';
    } else {
      state.events.forEach((row) => {
        const tr = document.createElement("tr");
        const eventDetail = [row.eventType || row.event || "-", row.eventDetail || row.detail2 || null]
          .filter(Boolean)
          .join(" | ");
        const changedLabel =
          row.changedLabel !== undefined ? row.changedLabel : row.changed ? "yes" : "no";
        tr.innerHTML =
          `<td>${fmtDate(row.occurredAt || row.checkedAt)}</td>` +
          `<td>${escapeHtml(row.projectName || row.projectKey)}</td>` +
          `<td>${escapeHtml(row.item || row.detail1 || row.mapName || row.mapUid || "-")}</td>` +
          `<td>${escapeHtml(eventDetail)}</td>` +
          `<td>${renderChangeBadge(changedLabel)}</td>`;
        body.appendChild(tr);
      });
    }

    updatePaginationUI("events", page, totalPages);
    const jump = document.getElementById("eventsPageJump");
    if (jump) {
      jump.min = "1";
      jump.max = String(Math.max(1, totalPages));
      jump.value = String(page);
    }
  }
  function renderMaps() {
    const { slice, page, totalPages, total } = paginate(state.maps, state.page.maps);
    state.page.maps = page;

    const displaynameMode = state.projectView === "displayname";
    document.getElementById("mapsCount").textContent = displaynameMode ? `${total} names` : `${total} maps`;
    const body = document.getElementById("projectMapsBody");
    body.innerHTML = "";

    if (!slice.length) {
      body.innerHTML = displaynameMode
        ? '<tr><td colspan="4" class="muted">No display names cached for this project yet.</td></tr>'
        : '<tr><td colspan="4" class="muted">No maps in cache for this project yet.</td></tr>';
    } else {
      slice.forEach((row) => {
        const tr = document.createElement("tr");
        if (displaynameMode) {
          tr.innerHTML =
            `<td>${escapeHtml(row.accountId || "-")}</td>` +
            `<td>${escapeHtml(row.displayName || "-")}</td>` +
            `<td>${escapeHtml(row.source || "-")}</td>` +
            `<td>${fmtDate(row.observedAt)}</td>`;
        } else {
          tr.innerHTML =
            `<td>${escapeHtml(row.mapName || row.mapUid)}<div class="muted">${escapeHtml(row.mapUid)}</div></td>` +
            `<td>${fmtNumber(row.checkCount || 0)}</td>` +
            `<td>${fmtNumber(row.changeCount || 0)}</td>` +
            `<td>${fmtDate(row.latestCheckedAt)}</td>`;
        }
        body.appendChild(tr);
      });
    }

    updatePaginationUI("maps", page, totalPages);
  }
  function renderNames() {
    const { slice, page, totalPages, total } = paginate(state.names, state.page.names);
    state.page.names = page;

    const mode = String(state.namesMeta?.mode || "cached");
    const cachedCount = Number(state.namesMeta?.cachedCount || 0);
    const candidateCount = Number(state.namesMeta?.candidateCount || 0);
    document.getElementById("namesCount").textContent =
      mode === "pending"
        ? `${fmtNumber(cachedCount)} cached | ${fmtNumber(candidateCount)} pending`
        : `${fmtNumber(total)} names`;
    const body = document.getElementById("namesBody");
    body.innerHTML = "";

    if (!slice.length) {
      body.innerHTML = '<tr><td colspan="3" class="muted">No display names or pending candidates yet.</td></tr>';
    } else {
      slice.forEach((row) => {
        const tr = document.createElement("tr");
        const nameCell = row.pending
          ? `<span class="muted">pending lookup${row.stale ? " (stale)" : ""}</span>`
          : escapeHtml(row.displayName || "-");
        const observed = row.pending
          ? fmtDate(row.lastSeenAt || row.observedAt)
          : fmtDate(row.observedAt);
        tr.innerHTML =
          `<td>${escapeHtml(row.accountId)}</td>` +
          `<td>${nameCell}</td>` +
          `<td>${observed}</td>`;
        body.appendChild(tr);
      });
    }

    updatePaginationUI("names", page, totalPages);
  }
  function setDbTableStats(text) {
    const el = document.getElementById("dbTableStats");
    if (el) el.textContent = text;
  }

  async function loadDbTables() {
    const payload = await fetchJson("/api/v1/db/tables?include_counts=1");
    const tables = payload?.tables || [];
    const select = document.getElementById("dbTableSelect");
    const previous = state.db.table;
    state.db.tableMetaByName = new Map();

    select.innerHTML = "";
    tables.forEach((item) => {
      state.db.tableMetaByName.set(item.table, item);
      const option = document.createElement("option");
      option.value = item.table;
      option.textContent = `${item.table} (${fmtNumber(item.rowCount)} rows)`;
      select.appendChild(option);
    });

    const previousMatch = tables.find((item) => item.table === previous);
    const firstNonEmpty = tables.find((item) => Number(item?.rowCount || 0) > 0);
    state.db.table = (previousMatch || firstNonEmpty || tables[0] || {}).table || "";
    select.value = state.db.table;
    state.db.offset = 0;
    if (!tables.length) {
      setDbTableStats("No tables available.");
    }
  }

  function renderSchemaPills(columns = []) {
    const root = document.getElementById("dbSchemaPills");
    root.innerHTML = "";
    columns.forEach((column) => {
      const el = document.createElement("span");
      el.className = "pill";
      const typeText = String(column.type || "").trim() || "any";
      const pkText = column.primaryKey ? " pk" : "";
      el.innerHTML = `<b>${escapeHtml(column.name)}</b> ${escapeHtml(typeText)}${pkText}`;
      root.appendChild(el);
    });
  }

  function renderDbSortColumns(columns = []) {
    const sortSelect = document.getElementById("dbSortBy");
    const previous = state.db.sortBy;
    sortSelect.innerHTML = "";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Default order";
    sortSelect.appendChild(none);

    columns.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      sortSelect.appendChild(option);
    });

    state.db.sortBy = columns.includes(previous) ? previous : "";
    sortSelect.value = state.db.sortBy;
  }

  function renderDbRows(data) {
    const head = document.getElementById("dbRowsHead");
    const body = document.getElementById("dbRowsBody");
    const columns = data?.columns || [];
    const rows = data?.rows || [];

    if (!columns.length) {
      head.innerHTML = "";
      body.innerHTML = '<tr><td class="muted">No columns available.</td></tr>';
      return;
    }

    head.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`;
    body.innerHTML = "";

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${columns.length}" class="muted">No rows in this range.</td></tr>`;
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = columns
        .map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return "<td class='muted'>null</td>";
          if (typeof value === "object") return `<td>${escapeHtml(JSON.stringify(value))}</td>`;
          return `<td>${escapeHtml(String(value))}</td>`;
        })
        .join("");
      body.appendChild(tr);
    });
  }

  async function loadDbSchema() {
    if (!state.db.table) {
      state.db.columns = [];
      renderSchemaPills([]);
      renderDbSortColumns([]);
      return;
    }
    const payload = await fetchJson(`/api/v1/db/tables/${encodeURIComponent(state.db.table)}/schema`);
    const schema = payload?.schema || {};
    const columns = schema.columns || [];
    state.db.columns = columns.map((column) => String(column.name || ""));
    renderSchemaPills(columns);
    renderDbSortColumns(state.db.columns);
  }

  async function loadDbRows() {
    if (!state.db.table) {
      renderDbRows({ columns: [], rows: [] });
      setDbTableStats("No table selected.");
      return;
    }

    const params = new URLSearchParams();
    params.set("limit", String(state.db.limit));
    params.set("offset", String(state.db.offset));
    if (state.db.sortBy) {
      params.set("sort_by", state.db.sortBy);
      params.set("sort_dir", state.db.sortDir);
    }

    const data = await fetchJson(
      `/api/v1/db/tables/${encodeURIComponent(state.db.table)}/rows?${params.toString()}`
    );
    renderDbRows(data);

    const total = Number(data?.total || 0);
    const from = total ? state.db.offset + 1 : 0;
    const to = Math.min(total, state.db.offset + state.db.limit);
    setDbTableStats(`${state.db.table} | rows ${from}-${to} of ${fmtNumber(total)}`);
  }
  function renderMetricTopProjects(projects = []) {
    const body = document.getElementById("metricTopProjectsBody");
    if (!body) return;
    body.innerHTML = "";
    if (!projects.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted">No project metrics available.</td></tr>';
      return;
    }
    projects.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${escapeHtml(row.projectName || row.projectKey || "-")}</td>` +
        `<td>${fmtNumber(row.checks || 0)}</td>` +
        `<td>${fmtNumber(row.changes || 0)}</td>` +
        `<td>${fmtNumber(row.trackedMaps || 0)}</td>`;
      body.appendChild(tr);
    });
  }

  function renderLineChart(svgId, points, keys, labels) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const width = 680;
    const height = 210;
    const padding = { left: 26, right: 8, top: 10, bottom: 22 };

    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxY = Math.max(
      1,
      ...points.flatMap((point) => keys.map((key) => Number(point[key] || 0)))
    );

    if (!points.length) {
      svg.innerHTML =
        `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis-line"></line>` +
        `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">No data in selected range.</text>`;
      return;
    }

    function xAt(index) {
      if (points.length <= 1) return padding.left;
      return padding.left + (innerWidth * index) / (points.length - 1);
    }

    function yAt(value) {
      const ratio = Number(value || 0) / maxY;
      return padding.top + innerHeight - ratio * innerHeight;
    }

    function pathFor(key) {
      return points
        .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xAt(idx).toFixed(2)} ${yAt(point[key]).toFixed(2)}`)
        .join(" ");
    }

    const gridLines = [0.25, 0.5, 0.75].map((ratio) => {
      const y = padding.top + innerHeight - innerHeight * ratio;
      return `<line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}" class="chart-grid-line"></line>`;
    });

    const legendY = height - 5;
    const legend = labels
      .map((label, idx) => {
        const color = idx === 0 ? "var(--coral)" : "#79e6a0";
        const x = padding.left + idx * 130;
        return (
          `<circle cx="${x}" cy="${legendY - 3}" r="3" fill="${color}"></circle>` +
          `<text x="${x + 8}" y="${legendY}" fill="var(--ink-dim)" font-size="11">${escapeHtml(label)}</text>`
        );
      })
      .join("");

    const primaryPath = pathFor(keys[0]);
    const secondaryPath = keys[1] ? pathFor(keys[1]) : "";

    svg.innerHTML =
      gridLines.join("") +
      `<line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis-line"></line>` +
      `<path d="${primaryPath}" class="chart-line-primary"></path>` +
      (secondaryPath ? `<path d="${secondaryPath}" class="chart-line-secondary"></path>` : "") +
      legend;
  }

  function applyMetricsOverview(overviewPayload) {
    const metrics = overviewPayload?.metrics || {};
    const freshness = metrics.freshness || {};
    const throughput24h = metrics.throughput24h || {};
    const rates = metrics.rates || {};
    const runHealth = metrics.runHealth || {};
    const instanceHealth = metrics.instanceHealth || {};
    const nameHealth = metrics.nameHealth || {};
    const totalAccounts = Math.max(0, Number(metrics.accounts || 0));
    const matchedDisplayNames = Math.max(0, Number(metrics.displayNames || 0));
    const missingDisplayNames = Math.max(
      0,
      Number(nameHealth.missingDisplayNames ?? totalAccounts - matchedDisplayNames)
    );
    const computedCoveragePct =
      totalAccounts > 0 ? (matchedDisplayNames / totalAccounts) * 100 : 0;
    const coveragePct = Number(
      Number.isFinite(nameHealth.coveragePct) ? nameHealth.coveragePct : computedCoveragePct
    );
    const clampedCoveragePct = Math.max(0, Math.min(100, Number.isFinite(coveragePct) ? coveragePct : 0));

    setText("metricOnlineInstances", fmtNumber(metrics.onlineInstances || 0));
    setText("metricOfflineInstances", fmtNumber(instanceHealth.staleOrOfflineInstances || 0));
    setText("metricIngestRuns", fmtNumber(metrics.ingestRuns || 0));
    setText("metricChangedEvents", fmtNumber(metrics.eventsChanged || 0));
    setText("metricChecks24h", fmtNumber(throughput24h.checks || 0));
    setText("metricChanges24h", fmtNumber(throughput24h.changes || 0));
    setText("metricChangeRate24h", fmtPercent(rates.changeRate24hPct || 0, 2));
    setText("metricMapsChecked24h", fmtNumber(throughput24h.mapsChecked || 0));
    setText("metricTrackedMaps", fmtNumber(freshness.trackedMaps || 0));
    setText("metricStaleMaps24h", fmtNumber(freshness.stale24h || 0));
    setText("metricAvgRunDuration24h", fmtDurationSeconds(runHealth.avgRunDurationSeconds24h || 0));
    setText("metricNameCoverage", fmtPercent(clampedCoveragePct, 2));
    setText("metricNameUpdates24h", fmtNumber(nameHealth.observed24h || 0));
    setText("metricStaleNames20d", fmtNumber(nameHealth.stale20d || 0));
    setText("metricDbSize", fmtBytes(metrics?.storage?.dbBytes || 0));
    setText("metricDisplayNamesMatched", fmtNumber(matchedDisplayNames));
    setText("metricDisplayNamesTotal", fmtNumber(totalAccounts));
    setText("metricDisplayNamesMissing", fmtNumber(missingDisplayNames));
    setText("metricDisplayNamesCoverage", fmtPercent(clampedCoveragePct, 2));

    const coverageBarEl = document.getElementById("metricDisplayNamesCoverageBar");
    if (coverageBarEl) {
      coverageBarEl.style.width = `${clampedCoveragePct.toFixed(2)}%`;
      const progressEl = coverageBarEl.parentElement;
      if (progressEl) progressEl.setAttribute("aria-valuenow", clampedCoveragePct.toFixed(2));
    }
    const coverageStateEl = document.getElementById("metricNameCoverageState");
    if (coverageStateEl) {
      const isComplete = totalAccounts > 0 && missingDisplayNames === 0;
      coverageStateEl.textContent = totalAccounts === 0 ? "No Accounts" : isComplete ? "Complete" : "In Progress";
      coverageStateEl.classList.toggle("is-complete", isComplete);
    }
    renderMetricTopProjects(metrics.topProjects || []);
  }

  function applyLeaderboardCoverage(coveragePayload) {
    const coverage = coveragePayload?.coverage || {};
    const totalMaps = Math.max(0, Number(coverage.totalMaps || 0));
    const mapsWithKnownWr = Math.max(0, Number(coverage.mapsWithKnownWr || 0));
    const mapsWithLeaderboardRows = Math.max(0, Number(coverage.mapsWithLeaderboardRows || 0));
    const mapsWithExtendedLeaderboard = Math.max(0, Number(coverage.mapsWithExtendedLeaderboard || 0));
    const leaderboardRowsStored = Math.max(0, Number(coverage.leaderboardRowsStored || 0));
    const extendedCoveragePct = Math.max(
      0,
      Math.min(100, Number(coverage.extendedCoveragePct || 0))
    );

    setText("metricLeaderboardWrKnown", `${fmtNumber(mapsWithKnownWr)} / ${fmtNumber(totalMaps)}`);
    setText(
      "metricLeaderboardAnyRows",
      `${fmtNumber(mapsWithLeaderboardRows)} / ${fmtNumber(totalMaps)}`
    );
    setText(
      "metricLeaderboardExtended",
      `${fmtNumber(mapsWithExtendedLeaderboard)} / ${fmtNumber(totalMaps)}`
    );
    setText("metricLeaderboardRowsStored", fmtNumber(leaderboardRowsStored));

    const coverageBarEl = document.getElementById("metricLeaderboardCoverageBar");
    if (coverageBarEl) {
      coverageBarEl.style.width = `${extendedCoveragePct.toFixed(2)}%`;
      const progressEl = coverageBarEl.parentElement;
      if (progressEl) progressEl.setAttribute("aria-valuenow", extendedCoveragePct.toFixed(2));
    }

    const coverageStateEl = document.getElementById("metricLeaderboardCoverageState");
    if (coverageStateEl) {
      const isComplete = totalMaps > 0 && mapsWithExtendedLeaderboard >= totalMaps;
      coverageStateEl.textContent =
        totalMaps === 0 ? "No Maps" : isComplete ? "Complete" : fmtPercent(extendedCoveragePct, 1);
      coverageStateEl.classList.toggle("is-complete", isComplete);
    }

    const barsEl = document.getElementById("metricLeaderboardCoverageBars");
    if (barsEl) {
      const rows = [
        {
          label: "WR Known",
          value: mapsWithKnownWr,
          pct: Number(coverage.wrCoveragePct || 0),
          tone: "is-known",
        },
        {
          label: "Any Leaderboard Rows",
          value: mapsWithLeaderboardRows,
          pct: Number(coverage.leaderboardCoveragePct || 0),
          tone: "is-any",
        },
        {
          label: "Fuller Leaderboard",
          value: mapsWithExtendedLeaderboard,
          pct: Number(coverage.extendedCoveragePct || 0),
          tone: "is-fuller",
        },
      ];
      barsEl.innerHTML = rows
        .map((row) => {
          const pct = Math.max(0, Math.min(100, Number(row.pct || 0)));
          return `
            <div class="coverage-bar-row">
              <div class="coverage-bar-head">
                <span class="coverage-bar-label">${escapeHtml(row.label)}</span>
                <span class="coverage-bar-value">${escapeHtml(`${fmtNumber(row.value)} / ${fmtNumber(totalMaps)} (${fmtPercent(pct, 1)})`)}</span>
              </div>
              <div class="coverage-bar-track">
                <span class="coverage-bar-fill ${row.tone}" style="width:${pct.toFixed(2)}%"></span>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  function applyMetricsTimeline(timelinePayload) {
    const series = timelinePayload?.series || {};
    renderLineChart("eventsChart", series.events || [], ["checks", "changes"], ["Checks", "Changes"]);
    renderLineChart(
      "runsChart",
      series.runs || [],
      ["mapsChecked", "avgDurationSeconds"],
      ["Maps Checked", "Avg Run Seconds"]
    );
    renderLineChart("namesChart", series.names || [], ["updates"], ["Name Updates"]);
  }

  async function loadMetrics() {
    const overviewPayload = await fetchJson("/api/v1/metrics/overview");
    applyMetricsOverview(overviewPayload);
    const leaderboardCoveragePayload = await fetchJson("/api/v1/metrics/leaderboards/coverage");
    applyLeaderboardCoverage(leaderboardCoveragePayload);
    await waitForNextPaint();
    const timelinePayload = await fetchJson(
      `/api/v1/metrics/timeseries?bucket=${encodeURIComponent(state.metrics.bucket)}&window_hours=${encodeURIComponent(state.metrics.windowHours)}`
    );
    applyMetricsTimeline(timelinePayload);
  }

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

  async function refreshMeta({ silent = false } = {}) {
    if (!silent) setStatus("Loading summary...");
    await loadMeta();
  }

  async function refreshEventsPanel({ silent = false, refreshProjects = false, refreshFacets = false } = {}) {
    if (refreshProjects || !state.projects.length) {
      if (!silent) setStatus("Loading projects...");
      await loadProjects();
      await waitForNextPaint();
    }
    if (refreshFacets || (!state.eventFacets.sources.length && !state.eventFacets.eventTypes.length)) {
      if (!silent) setStatus("Loading event facets...");
      try {
        await loadEventFacets();
      } catch (error) {
        console.warn("Event facets unavailable:", error);
      }
      await waitForNextPaint();
    }
    if (!silent) setStatus("Loading events...");
    await loadEvents();
  }

  async function refreshProjectsPanel({ silent = false, refreshProjects = false } = {}) {
    if (refreshProjects || !state.projects.length) {
      if (!silent) setStatus("Loading projects...");
      await loadProjects();
      await waitForNextPaint();
    }
    if (!silent) setStatus("Loading project view...");
    await loadProjectData();
  }

  async function refreshNamesPanel({ silent = false } = {}) {
    if (!silent) setStatus("Loading names...");
    await loadNames();
  }

  async function refreshDatabasePanel({ silent = false } = {}) {
    if (!silent) setStatus("Loading database tables...");
    await loadDbTables();
    await waitForNextPaint();
    if (!silent) setStatus("Loading database schema...");
    await loadDbSchema();
    await waitForNextPaint();
    if (!silent) setStatus("Loading database rows...");
    await loadDbRows();
  }

  async function refreshMetricsPanel({ silent = false } = {}) {
    if (!silent) setStatus("Loading metrics...");
    await loadMetrics();
  }

  async function refreshActiveTab({ silent = false, fromPoll = false } = {}) {
    if (state.activeTab === "projects") {
      await refreshProjectsPanel({ silent });
      return;
    }
    if (state.activeTab === "names") {
      await refreshNamesPanel({ silent });
      return;
    }
    if (state.activeTab === "clubs") {
      return;
    }
    if (state.activeTab === "database") {
      if (fromPoll) return;
      await refreshDatabasePanel({ silent });
      return;
    }
    if (state.activeTab === "metrics") {
      await refreshMetricsPanel({ silent });
      return;
    }
    await refreshEventsPanel({ silent });
  }

  let refreshBusy = false;

  async function refreshAll() {
    if (refreshBusy) return;
    refreshBusy = true;
    const issues = [];
    const runStep = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        issues.push(`${label}: ${error?.message || error}`);
      }
    };

    try {
      await runStep("meta", () => refreshMeta({ silent: false }));
      await waitForNextPaint();
      await runStep(state.activeTab, () => refreshActiveTab({ silent: false, fromPoll: false }));

      const updatedAt = new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
      });
      if (!issues.length) {
        stampStatus("Updated");
      } else {
        const first = issues[0];
        const rest = issues.length - 1;
        setStatus(
          `Partial update ${updatedAt}: ${first}${rest > 0 ? ` (+${rest} more)` : ""}`
        );
      }
    } catch (error) {
      setStatus(`Error: ${error?.message || error}`);
    } finally {
      refreshBusy = false;
    }
  }
  function wireEvents() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        if (tabId === state.activeTab) return;
        switchTab(tabId);
        refreshAll().catch((err) => setStatus(`Refresh failed: ${err?.message || err}`));
      });
    });
    document.getElementById("eventsFirst").addEventListener("click", () => {
      loadEvents({ page: 1 }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsPrev").addEventListener("click", () => {
      if (state.eventsMeta.page > 1) {
        loadEvents({ page: state.eventsMeta.page - 1 }).catch((err) =>
          setStatus(`Events load failed: ${err?.message || err}`)
        );
      }
    });
    document.getElementById("eventsNext").addEventListener("click", () => {
      if (state.eventsMeta.page < state.eventsMeta.totalPages) {
        loadEvents({ page: state.eventsMeta.page + 1 }).catch((err) =>
          setStatus(`Events load failed: ${err?.message || err}`)
        );
      }
    });
    document.getElementById("eventsLast").addEventListener("click", () => {
      loadEvents({ page: state.eventsMeta.totalPages || 1 }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsPageGo").addEventListener("click", () => {
      const jumpValue = Number(document.getElementById("eventsPageJump").value || 1);
      const page = Math.max(1, Math.min(jumpValue || 1, state.eventsMeta.totalPages || 1));
      loadEvents({ page }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsPageJump").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("eventsPageGo").click();
      }
    });

    document.getElementById("eventsRangeFilter").addEventListener("change", () => {
      setEventRangeInputsEnabled();
    });
    document.getElementById("eventsPageSize").addEventListener("change", () => {
      loadEvents({ page: 1 }).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsApply").addEventListener("click", () => {
      state.eventFilters = readEventFiltersFromUI();
      Promise.all([loadEventFacets(), loadEvents({ page: 1 })]).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsReset").addEventListener("click", () => {
      state.eventFilters = {
        projectKey: "",
        source: "",
        eventType: "",
        range: "24h",
        fromIso: "",
        toIso: "",
        q: "",
        changedOnly: false,
        includeSystem: false,
      };
      syncEventFilterControlsFromState();
      Promise.all([loadEventFacets(), loadEvents({ page: 1 })]).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsRefresh").addEventListener("click", () => {
      state.eventFilters = readEventFiltersFromUI();
      Promise.all([loadEventFacets(), loadEvents({ page: state.eventsMeta.page })]).catch((err) =>
        setStatus(`Events load failed: ${err?.message || err}`)
      );
    });
    document.getElementById("eventsQuery").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("eventsApply").click();
      }
    });
    document.getElementById("projectSelect").addEventListener("change", () => {
      state.projectKey = document.getElementById("projectSelect").value;
      loadProjectData().catch((err) => setStatus(`Project load failed: ${err?.message || err}`));
    });
    document.getElementById("changedOnly").addEventListener("change", () => {
      loadProjectData().catch((err) => setStatus(`Project load failed: ${err?.message || err}`));
    });
    document.getElementById("refreshProject").addEventListener("click", () => {
      Promise.all([loadProjectData(), loadEvents({ page: state.eventsMeta.page })]).catch((err) =>
        setStatus(`Project refresh failed: ${err?.message || err}`)
      );
    });
    document.getElementById("mapsPrev").addEventListener("click", () => {
      if (state.page.maps > 1) { state.page.maps--; renderMaps(); }
    });
    document.getElementById("mapsNext").addEventListener("click", () => {
      state.page.maps++;
      renderMaps();
    });
    document.getElementById("namesPrev").addEventListener("click", () => {
      if (state.page.names > 1) { state.page.names--; renderNames(); }
    });
    document.getElementById("namesNext").addEventListener("click", () => {
      state.page.names++;
      renderNames();
    });
    document.getElementById("loadClub").addEventListener("click", () => {
      loadClubSummary().catch((err) => setStatus(`Club load failed: ${err?.message || err}`));
    });
    document.getElementById("dbRefreshTables").addEventListener("click", () => {
      (async () => {
        await loadDbTables();
        await loadDbSchema();
        await loadDbRows();
      })().catch((err) => setStatus(`DB refresh failed: ${err?.message || err}`));
    });

    document.getElementById("dbTableSelect").addEventListener("change", () => {
      state.db.table = document.getElementById("dbTableSelect").value;
      state.db.offset = 0;
      (async () => {
        await loadDbSchema();
        await loadDbRows();
      })().catch((err) => setStatus(`DB table load failed: ${err?.message || err}`));
    });

    document.getElementById("dbSortBy").addEventListener("change", () => {
      state.db.sortBy = document.getElementById("dbSortBy").value;
      state.db.offset = 0;
      loadDbRows().catch((err) => setStatus(`DB sort failed: ${err?.message || err}`));
    });

    document.getElementById("dbSortDir").addEventListener("change", () => {
      state.db.sortDir = document.getElementById("dbSortDir").value;
      state.db.offset = 0;
      loadDbRows().catch((err) => setStatus(`DB sort failed: ${err?.message || err}`));
    });

    document.getElementById("dbLimit").addEventListener("change", () => {
      state.db.limit = Number(document.getElementById("dbLimit").value || 50);
      state.db.offset = 0;
      loadDbRows().catch((err) => setStatus(`DB pagination failed: ${err?.message || err}`));
    });

    document.getElementById("dbPrev").addEventListener("click", () => {
      state.db.offset = Math.max(0, state.db.offset - state.db.limit);
      loadDbRows().catch((err) => setStatus(`DB page change failed: ${err?.message || err}`));
    });

    document.getElementById("dbNext").addEventListener("click", () => {
      state.db.offset += state.db.limit;
      loadDbRows().catch((err) => setStatus(`DB page change failed: ${err?.message || err}`));
    });

    document.getElementById("dbReloadRows").addEventListener("click", () => {
      loadDbRows().catch((err) => setStatus(`DB reload failed: ${err?.message || err}`));
    });
    document.getElementById("metricBucket").addEventListener("change", () => {
      state.metrics.bucket = document.getElementById("metricBucket").value;
      loadMetrics().catch((err) => setStatus(`Metrics load failed: ${err?.message || err}`));
    });

    document.getElementById("metricWindowHours").addEventListener("change", () => {
      state.metrics.windowHours = Number(document.getElementById("metricWindowHours").value || 168);
      loadMetrics().catch((err) => setStatus(`Metrics load failed: ${err?.message || err}`));
    });

    document.getElementById("metricRefresh").addEventListener("click", () => {
      loadMetrics().catch((err) => setStatus(`Metrics refresh failed: ${err?.message || err}`));
    });
  }
  const hash = window.location.hash.slice(1);
  if (hash && document.querySelector(`.tab-btn[data-tab="${hash}"]`)) {
    switchTab(hash);
  }

  configureLocalLinks();
  wireEvents();
  refreshAll();
  setInterval(() => {
    if (refreshBusy) return;
    if (state.activeTab === "clubs" || state.activeTab === "database") {
      loadMeta()
        .then(() => stampStatus("Updated"))
        .catch((err) => setStatus(`Error: ${err?.message || err}`));
      return;
    }
    refreshAll().catch((err) => setStatus(`Error: ${err?.message || err}`));
  }, POLL_REFRESH_MS);
})();

