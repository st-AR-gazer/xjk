(function () {
  "use strict";
  function configureLocalLinks() {
    var host = window.location.hostname.toLowerCase();
    var port = window.location.port || "80";
    var isLocal = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1";
    if (!isLocal) return;

    var map = {
      main: "http://xjk.localhost:" + port + "/",
      altered: "http://altered.localhost:" + port + "/",
      tools: "http://tools.localhost:" + port + "/",
      plugins: "http://plugins.localhost:" + port + "/",
      trackers: "http://trackers.localhost:" + port + "/",
      aggregator: "http://aggregator.localhost:" + port + "/",
    };

    document.querySelectorAll("[data-link]").forEach(function (el) {
      var key = el.getAttribute("data-link");
      if (map[key]) el.setAttribute("href", map[key]);
    });
  }
  function setStatus(text) {
    document.getElementById("statusLine").textContent = text;
  }

  function parseAccountIds(input) {
    return String(input || "")
      .split(/[\s,;]+/)
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  async function requestJson(url, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var body = opts.body;
    var response = await fetch(url, {
      method: method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload?.error || response.status + " " + response.statusText);
    }
    return payload;
  }
  function updateStats(status) {
    var statQueue = document.getElementById("stat-queue");
    var statRunning = document.getElementById("stat-running");
    var statFinished = document.getElementById("stat-finished");
    var statScheduler = document.getElementById("stat-scheduler");

    if (statQueue) statQueue.textContent = status.queueSize ?? "-";
    if (statRunning) statRunning.textContent = status.running ? "Yes" : "No";
    if (statFinished) {
      var dt = status.lastFinishedAt ? new Date(status.lastFinishedAt) : null;
      statFinished.textContent = dt && !isNaN(dt.getTime())
        ? dt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            hourCycle: "h23",
          })
        : "-";
    }
    if (statScheduler) statScheduler.textContent = status.schedulerEnabled ? "Active" : "Paused";
  }
  function applyStatusToForm(status) {
    document.getElementById("enabled").checked = Boolean(status.enabled);
    document.getElementById("schedulerEnabled").checked = Boolean(status.schedulerEnabled);
    document.getElementById("maintenanceIntervalSeconds").value = Number(status.maintenanceIntervalSeconds || 20);
    document.getElementById("staleAfterSeconds").value = Number(status.staleAfterSeconds || 0);
    document.getElementById("batchSize").value = Number(status.batchSize || 50);
    document.getElementById("maxAccountsPerCycle").value = Number(status.maxAccountsPerCycle || 200);
  }

  async function loadStatus() {
    var status = await requestJson("api/v1/status");
    applyStatusToForm(status);
    updateStats(status);
    document.getElementById("statusJson").textContent = JSON.stringify(status, null, 2);
    setStatus(
      "queue=" + (status.queueSize || 0) +
      " running=" + (status.running ? "yes" : "no") +
      " last=" + (status.lastFinishedAt || "-")
    );
    return status;
  }
  async function saveConfig() {
    var payload = {
      enabled: document.getElementById("enabled").checked,
      schedulerEnabled: document.getElementById("schedulerEnabled").checked,
      maintenanceIntervalSeconds: Number(document.getElementById("maintenanceIntervalSeconds").value || 20),
      staleAfterSeconds: Number(document.getElementById("staleAfterSeconds").value || 0),
      batchSize: Number(document.getElementById("batchSize").value || 50),
      maxAccountsPerCycle: Number(document.getElementById("maxAccountsPerCycle").value || 200),
    };
    await requestJson("api/v1/config", { method: "POST", body: payload });
    await loadStatus();
    setStatus("Config saved.");
  }

  async function enqueueIds() {
    var accountIds = parseAccountIds(document.getElementById("accountIds").value);
    var payload = await requestJson("api/v1/accounts/enqueue", {
      method: "POST",
      body: { accountIds: accountIds },
    });
    setStatus("Queued " + (payload.queued || 0) + "; queue now " + (payload.queueSize || 0));
    await loadStatus();
  }

  async function runSyncNow() {
    var accountIds = parseAccountIds(document.getElementById("accountIds").value);
    var forceCandidates = document.getElementById("forceCandidates").checked;
    var result = await requestJson("api/v1/sync/run-now", {
      method: "POST",
      body: { accountIds: accountIds, forceCandidates: forceCandidates },
    });
    setStatus("Manual sync done: requested=" + (result.requested || 0) + ", resolved=" + (result.resolved || 0));
    await loadStatus();
  }
  document.getElementById("saveConfig").addEventListener("click", function () {
    saveConfig().catch(function (err) { setStatus("Save failed: " + (err?.message || err)); });
  });

  document.getElementById("enqueueBtn").addEventListener("click", function () {
    enqueueIds().catch(function (err) { setStatus("Enqueue failed: " + (err?.message || err)); });
  });

  document.getElementById("runNowBtn").addEventListener("click", function () {
    runSyncNow().catch(function (err) { setStatus("Sync failed: " + (err?.message || err)); });
  });
  configureLocalLinks();

  loadStatus().catch(function (err) {
    setStatus("Status load failed: " + (err?.message || err));
  });

  setInterval(function () {
    loadStatus().catch(function (err) {
      setStatus("Status load failed: " + (err?.message || err));
    });
  }, 5000);
})();

