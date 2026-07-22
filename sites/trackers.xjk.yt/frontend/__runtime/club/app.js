import {
  applySiteDataLinks,
  bindDockNavigation,
  formatClockTime,
  requestJson,
  startStatusPolling,
} from "/shared/xjk-core/tracker-runtime.js";

(function () {
  "use strict";
  const sampleSnapshot = {
    club: { id: 24231, name: "Altered Nadeo Club" },
    campaigns: [],
    uploads: [],
    members: [],
  };

  function setStatus(text) {
    document.getElementById("statusLine").textContent = text;
  }

  function updateStats(status) {
    const statEnabled = document.getElementById("stat-enabled");
    const statIngest = document.getElementById("stat-ingest");

    if (statEnabled) statEnabled.textContent = status.enabled ? "Yes" : "No";
    if (statIngest) {
      statIngest.textContent = formatClockTime(status.lastIngestAt);
    }
  }
  async function loadStatus() {
    const status = await requestJson("api/v1/status");
    updateStats(status);
    document.getElementById("statusJson").textContent = JSON.stringify(status, null, 2);
    setStatus("enabled=" + (status.enabled ? "yes" : "no") + " lastIngest=" + (status.lastIngestAt || "-"));
  }
  async function ingestSnapshot() {
    let body = {};
    try {
      body = JSON.parse(document.getElementById("snapshotJson").value || "{}");
    } catch (err) {
      throw new Error("Invalid JSON: " + (err?.message || err));
    }
    const result = await requestJson("api/v1/snapshot/ingest", {
      method: "POST",
      body,
    });
    setStatus(
      "Ingested club " +
        (result.clubId || "?") +
        ": campaigns=" +
        (result.campaignsSeen || 0) +
        ", members=" +
        (result.membersSeen || 0)
    );
    await loadStatus();
  }
  document.getElementById("snapshotJson").value = JSON.stringify(sampleSnapshot, null, 2);

  document.getElementById("ingestBtn").addEventListener("click", function () {
    ingestSnapshot().catch(function (err) {
      setStatus("Ingest failed: " + (err?.message || err));
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
