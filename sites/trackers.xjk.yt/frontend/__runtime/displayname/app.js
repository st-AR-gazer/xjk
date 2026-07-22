import {
  applySiteDataLinks,
  bindDockNavigation,
  formatClockTime,
  requestJson,
  startStatusPolling,
} from "/shared/xjk-core/tracker-runtime.js";

(function () {
  "use strict";
  function setStatus(text) {
    document.getElementById("statusLine").textContent = text;
  }

  function parseAccountIds(input) {
    return String(input || "")
      .split(/[\s,;]+/)
      .map(function (v) {
        return v.trim();
      })
      .filter(Boolean);
  }

  function updateStats(status) {
    const statQueue = document.getElementById("stat-queue");
    const statRunning = document.getElementById("stat-running");
    const statFinished = document.getElementById("stat-finished");
    const statScheduler = document.getElementById("stat-scheduler");

    if (statQueue) statQueue.textContent = status.queueSize ?? "-";
    if (statRunning) statRunning.textContent = status.running ? "Yes" : "No";
    if (statFinished) {
      statFinished.textContent = formatClockTime(status.lastFinishedAt);
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
    const status = await requestJson("api/v1/status");
    applyStatusToForm(status);
    updateStats(status);
    document.getElementById("statusJson").textContent = JSON.stringify(status, null, 2);
    setStatus(
      "queue=" +
        (status.queueSize || 0) +
        " running=" +
        (status.running ? "yes" : "no") +
        " last=" +
        (status.lastFinishedAt || "-")
    );
    return status;
  }
  async function saveConfig() {
    const payload = {
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
    const accountIds = parseAccountIds(document.getElementById("accountIds").value);
    const payload = await requestJson("api/v1/accounts/enqueue", {
      method: "POST",
      body: { accountIds },
    });
    setStatus("Queued " + (payload.queued || 0) + "; queue now " + (payload.queueSize || 0));
    await loadStatus();
  }

  async function runSyncNow() {
    const accountIds = parseAccountIds(document.getElementById("accountIds").value);
    const forceCandidates = document.getElementById("forceCandidates").checked;
    const result = await requestJson("api/v1/sync/run-now", {
      method: "POST",
      body: { accountIds, forceCandidates },
    });
    setStatus("Manual sync done: requested=" + (result.requested || 0) + ", resolved=" + (result.resolved || 0));
    await loadStatus();
  }
  document.getElementById("saveConfig").addEventListener("click", function () {
    saveConfig().catch(function (err) {
      setStatus("Save failed: " + (err?.message || err));
    });
  });

  document.getElementById("enqueueBtn").addEventListener("click", function () {
    enqueueIds().catch(function (err) {
      setStatus("Enqueue failed: " + (err?.message || err));
    });
  });

  document.getElementById("runNowBtn").addEventListener("click", function () {
    runSyncNow().catch(function (err) {
      setStatus("Sync failed: " + (err?.message || err));
    });
  });
  bindDockNavigation();
  applySiteDataLinks().catch(() => {});
  startStatusPolling(loadStatus, {
    onError(error) {
      setStatus(`Status load failed: ${error?.message || error}`);
    },
  });
})();
