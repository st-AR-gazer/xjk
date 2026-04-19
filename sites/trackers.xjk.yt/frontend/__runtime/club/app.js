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
  var sampleSnapshot = {
    club: { id: 24231, name: "Altered Nadeo Club" },
    campaigns: [],
    uploads: [],
    members: [],
  };

  function setStatus(text) {
    document.getElementById("statusLine").textContent = text;
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
    var statEnabled = document.getElementById("stat-enabled");
    var statIngest = document.getElementById("stat-ingest");

    if (statEnabled) statEnabled.textContent = status.enabled ? "Yes" : "No";
    if (statIngest) {
      var dt = status.lastIngestAt ? new Date(status.lastIngestAt) : null;
      statIngest.textContent = dt && !isNaN(dt.getTime())
        ? dt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            hourCycle: "h23",
          })
        : "-";
    }
  }
  async function loadStatus() {
    var status = await requestJson("api/v1/status");
    updateStats(status);
    document.getElementById("statusJson").textContent = JSON.stringify(status, null, 2);
    setStatus(
      "enabled=" + (status.enabled ? "yes" : "no") +
      " lastIngest=" + (status.lastIngestAt || "-")
    );
  }
  async function ingestSnapshot() {
    var body = {};
    try {
      body = JSON.parse(document.getElementById("snapshotJson").value || "{}");
    } catch (err) {
      throw new Error("Invalid JSON: " + (err?.message || err));
    }
    var result = await requestJson("api/v1/snapshot/ingest", {
      method: "POST",
      body: body,
    });
    setStatus(
      "Ingested club " + (result.clubId || "?") +
      ": campaigns=" + (result.campaignsSeen || 0) +
      ", members=" + (result.membersSeen || 0)
    );
    await loadStatus();
  }
  document.getElementById("snapshotJson").value = JSON.stringify(sampleSnapshot, null, 2);

  document.getElementById("ingestBtn").addEventListener("click", function () {
    ingestSnapshot().catch(function (err) {
      setStatus("Ingest failed: " + (err?.message || err));
    });
  });
  document.querySelectorAll(".dock-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var viewId = btn.getAttribute("data-view");
      document.querySelectorAll(".dock-btn").forEach(function (b) { b.classList.remove("is-active"); });
      document.querySelectorAll(".view-layer").forEach(function (p) { p.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var targetPanel = document.getElementById("view-" + viewId);
      if (targetPanel) targetPanel.classList.add("is-active");
    });
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

