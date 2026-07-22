import "/shared/xjk-core/safe-html.js?v=2";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";

function createMonitoringState() {
  return {
    tab: "club",
    clubTab: "maps",
    formDirty: false,
    displayNameFormDirty: false,
    monitorStatus: null,
    club: {
      maps: [],
      campaigns: [],
      uploads: [],
      loadedAt: null,
    },
    leaderboards: null,
    leaderboardsLoadedAt: null,
    lbScheduler: {
      enabled: true,
      intervalSeconds: 15,
      feedLimit: 80,
    },
    lastLbRefreshAtMs: 0,
  };
}

function collectMonitoringElements(doc = document) {
  return {
    authState: doc.getElementById("authState"),
    refreshAllBtn: doc.getElementById("refreshAllBtn"),
    logoutBtn: doc.getElementById("logoutBtn"),
    statFullState: doc.getElementById("statFullState"),
    statDiscoveryState: doc.getElementById("statDiscoveryState"),
    statNextFull: doc.getElementById("statNextFull"),
    statNextDiscovery: doc.getElementById("statNextDiscovery"),
    tabs: Array.from(doc.querySelectorAll("[data-monitor-tab]")),
    panels: Array.from(doc.querySelectorAll("[data-monitor-panel]")),
    clubTabs: Array.from(doc.querySelectorAll("[data-club-tab]")),
    clubPanels: Array.from(doc.querySelectorAll("[data-club-panel]")),
    monitorConfigForm: doc.getElementById("monitorConfigForm"),
    clubIdInput: doc.getElementById("clubIdInput"),
    scheduleModeInput: doc.getElementById("scheduleModeInput"),
    intervalSecondsInput: doc.getElementById("intervalSecondsInput"),
    dailyHourInput: doc.getElementById("dailyHourInput"),
    dailyMinuteInput: doc.getElementById("dailyMinuteInput"),
    activityPageSizeInput: doc.getElementById("activityPageSizeInput"),
    trackerChunkSizeInput: doc.getElementById("trackerChunkSizeInput"),
    monitorEnabledInput: doc.getElementById("monitorEnabledInput"),
    activeOnlyInput: doc.getElementById("activeOnlyInput"),
    fetchMapDetailsInput: doc.getElementById("fetchMapDetailsInput"),
    discoveryIntervalInput: doc.getElementById("discoveryIntervalInput"),
    discoveryCampaignLimitInput: doc.getElementById("discoveryCampaignLimitInput"),
    discoveryActivityPageSizeInput: doc.getElementById("discoveryActivityPageSizeInput"),
    discoveryEnabledInput: doc.getElementById("discoveryEnabledInput"),
    refreshStatusBtn: doc.getElementById("refreshStatusBtn"),
    refreshClubDataBtn: doc.getElementById("refreshClubDataBtn"),
    configStatus: doc.getElementById("configStatus"),
    runFullBtn: doc.getElementById("runFullBtn"),
    runDiscoveryBtn: doc.getElementById("runDiscoveryBtn"),
    fetchSummaryBtn: doc.getElementById("fetchSummaryBtn"),
    actionStatus: doc.getElementById("actionStatus"),
    actionProgressBar: doc.getElementById("actionProgressBar"),
    liveStatusLine: doc.getElementById("liveStatusLine"),
    liveNextRunLine: doc.getElementById("liveNextRunLine"),
    liveSummaryLine: doc.getElementById("liveSummaryLine"),
    liveProgressBar: doc.getElementById("liveProgressBar"),
    liveProgressText: doc.getElementById("liveProgressText"),
    liveProgressMeta: doc.getElementById("liveProgressMeta"),
    liveCounterGrid: doc.getElementById("liveCounterGrid"),
    clubMapsSummary: doc.getElementById("clubMapsSummary"),
    clubMapsList: doc.getElementById("clubMapsList"),
    clubCampaignsSummary: doc.getElementById("clubCampaignsSummary"),
    clubCampaignsList: doc.getElementById("clubCampaignsList"),
    clubUploadsSummary: doc.getElementById("clubUploadsSummary"),
    clubUploadsList: doc.getElementById("clubUploadsList"),
    leaderboardSchedulerForm: doc.getElementById("leaderboardSchedulerForm"),
    leaderboardSchedulerEnabledInput: doc.getElementById("leaderboardSchedulerEnabledInput"),
    leaderboardSchedulerIntervalInput: doc.getElementById("leaderboardSchedulerIntervalInput"),
    leaderboardFeedLimitInput: doc.getElementById("leaderboardFeedLimitInput"),
    leaderboardSchedulerStatus: doc.getElementById("leaderboardSchedulerStatus"),
    leaderboardLastUpdatedLine: doc.getElementById("leaderboardLastUpdatedLine"),
    refreshLeaderboardBtn: doc.getElementById("refreshLeaderboardBtn"),
    leaderboardStatusLine: doc.getElementById("leaderboardStatusLine"),
    leaderboardSummaryGrid: doc.getElementById("leaderboardSummaryGrid"),
    leaderboardLiveFeedList: doc.getElementById("leaderboardLiveFeedList"),
    leaderboardWrList: doc.getElementById("leaderboardWrList"),
    leaderboardMostPlayedList: doc.getElementById("leaderboardMostPlayedList"),
    refreshDisplayNameBtn: doc.getElementById("refreshDisplayNameBtn"),
    displayNameStateLine: doc.getElementById("displayNameStateLine"),
    displayNameScheduleLine: doc.getElementById("displayNameScheduleLine"),
    displayNameLastLine: doc.getElementById("displayNameLastLine"),
    displayNameProgressBar: doc.getElementById("displayNameProgressBar"),
    displayNameProgressText: doc.getElementById("displayNameProgressText"),
    displayNameRunBtn: doc.getElementById("displayNameRunBtn"),
    displayNameRunForceBtn: doc.getElementById("displayNameRunForceBtn"),
    displayNameRunPriorityBtn: doc.getElementById("displayNameRunPriorityBtn"),
    displayNameActionStatus: doc.getElementById("displayNameActionStatus"),
    displayNameAccountIdsInput: doc.getElementById("displayNameAccountIdsInput"),
    displayNameSpecificForceInput: doc.getElementById("displayNameSpecificForceInput"),
    displayNameSyncAccountsBtn: doc.getElementById("displayNameSyncAccountsBtn"),
    displayNameConfigForm: doc.getElementById("displayNameConfigForm"),
    displayNameEnabledInput: doc.getElementById("displayNameEnabledInput"),
    displayNameBootstrapIntervalInput: doc.getElementById("displayNameBootstrapIntervalInput"),
    displayNameMaintenanceIntervalInput: doc.getElementById("displayNameMaintenanceIntervalInput"),
    displayNamePriorityIntervalInput: doc.getElementById("displayNamePriorityIntervalInput"),
    displayNameCacheTtlInput: doc.getElementById("displayNameCacheTtlInput"),
    displayNamePriorityCacheTtlInput: doc.getElementById("displayNamePriorityCacheTtlInput"),
    displayNameKnownAccountsRefreshInput: doc.getElementById("displayNameKnownAccountsRefreshInput"),
    displayNameBatchSizeInput: doc.getElementById("displayNameBatchSizeInput"),
    displayNamePriorityBatchSizeInput: doc.getElementById("displayNamePriorityBatchSizeInput"),
    displayNameRequestGapInput: doc.getElementById("displayNameRequestGapInput"),
    displayNamePriorityTopLimitInput: doc.getElementById("displayNamePriorityTopLimitInput"),
    displayNameSaveConfigBtn: doc.getElementById("displayNameSaveConfigBtn"),
    displayNameConfigStatus: doc.getElementById("displayNameConfigStatus"),
    displayNameStatsGrid: doc.getElementById("displayNameStatsGrid"),
  };
}

const esc = escapeHtml;

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function fmtCount(v) {
  return n(v).toLocaleString();
}
function fmtPct(v, digits = 1) {
  return `${n(v).toFixed(digits)}%`;
}
function fmtTs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t)
    ? new Date(t).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        hourCycle: "h23",
      })
    : "-";
}
function fmtAgo(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "-";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function setLine(node, msg, tone = "") {
  if (!node) return;
  node.classList.remove("good", "bad");
  if (tone === "good" || tone === "bad") node.classList.add(tone);
  node.textContent = msg;
}

function renderList(node, rows, fn, empty) {
  if (!node) return;
  node.replaceChildren();
  if (!rows.length) {
    globalThis.XjkSafeHtml.set(node, `<li><strong>${esc(empty)}</strong></li>`);
    return;
  }
  rows.forEach((row) => {
    const li = (node.ownerDocument || document).createElement("li");
    globalThis.XjkSafeHtml.set(li, fn(row));
    node.appendChild(li);
  });
}

export {
  collectMonitoringElements,
  createMonitoringState,
  esc,
  fmtAgo,
  fmtCount,
  fmtPct,
  fmtTs,
  n,
  renderList,
  setLine,
};
