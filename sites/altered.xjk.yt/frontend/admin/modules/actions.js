import { api, guarded, post } from "./api.js?v=2";
import { alteredUrl } from "./constants.js?v=2";
import { loadActivity, loadDashboard, loadJobs, loadMaps, loadSettings, logJobsConsole } from "./data-loaders.js?v=2";
import { stripFmt } from "./formatters.js?v=2";
import { normalizeLoginUrl } from "./request-client.js?v=2";
import { closeDrawer, openDrawer } from "./drawer-controller.js?v=2";
import { state } from "./state.js?v=2";
import { findClub, findRow, findSource, toast } from "./ui.js?v=2";
import { setHash } from "./workspaces.js?v=2";

export async function handleJobAction(action, jobKey) {
  const routes = {
    "run-full-sync": { url: "/api/v1/admin/hook/altered/live/monitor/run", body: {}, msg: "Full sync triggered." },
    "run-discovery-sync": {
      url: "/api/v1/admin/hook/altered/live/monitor/run-discovery",
      body: {},
      msg: "Discovery triggered.",
    },
    "run-map-local-copy-backfill": {
      url: "/api/v1/admin/maps/local-store/backfill",
      body: {},
      msg: "Local map-copy backfill triggered.",
    },
    "retry-map-local-copy-errors": {
      url: "/api/v1/admin/maps/local-store/retry-errors",
      body: {},
      msg: "Local map-copy retry triggered.",
    },
    "run-tracker-now": { url: "/api/v1/admin/tracker/run-now", body: {}, msg: "Tracker run triggered." },
    "run-displayname-cached": {
      url: "/api/v1/admin/hook/altered/live/mapper-sync/run",
      body: {},
      msg: "DN sync triggered.",
    },
    "run-displayname-force": {
      url: "/api/v1/admin/hook/altered/live/mapper-sync/run",
      body: { force: true },
      msg: "Force DN sync triggered.",
    },
    "run-displayname-priority": {
      url: "/api/v1/admin/hook/altered/live/mapper-sync/run",
      body: { priority: true },
      msg: "Priority DN sync triggered.",
    },
    "run-ops-scheduler": { url: "/api/v1/admin/ops/scheduler/run-now", body: {}, msg: "Ops scheduler triggered." },
  };

  if (action === "view-history") {
    await openJobHistory(jobKey);
    return;
  }
  if (action === "run-displayname-targeted") {
    openDrawer({
      type: "targeted-displayname",
      kicker: "Display Name",
      title: "Sync Specific IDs",
      subtitle: "Target known Ubisoft account IDs.",
      payload: {},
    });
    return;
  }
  const cfg = routes[action];
  if (!cfg) return;
  logJobsConsole("job action requested", {
    action,
    jobKey: String(jobKey || "").trim() || null,
    url: cfg.url,
    body: cfg.body || {},
  });
  await guarded(`${action}:${jobKey}`, async () => {
    try {
      const response = await post(cfg.url, cfg.body);
      logJobsConsole("job action response", {
        action,
        jobKey: String(jobKey || "").trim() || null,
        response,
      });
      await Promise.all([loadDashboard(), loadJobs({ source: `job-action:${action}`, forceConsole: true })]);
    } catch (error) {
      logJobsConsole(
        "job action failed",
        {
          action,
          jobKey: String(jobKey || "").trim() || null,
          message: error?.message || String(error || "Unknown error."),
        },
        "error"
      );
      throw error;
    }
    toast(cfg.msg, "ok");
  });
}

export async function handleMapCmd(cmd, uid) {
  const row = findRow(uid);
  if (!row) return;
  if (cmd === "history") {
    state.activity.filters.mapUid = uid;
    state.activity.filters.kind = "all";
    state.activity.cursor = 0;
    setHash("activity", { mapUid: uid });
    await guarded(`map-hist-${uid}`, loadActivity);
    return;
  }
  if (cmd === "track" || cmd === "pause") {
    const body = cmd === "track" ? { tracked: true, status: "live" } : { tracked: false, status: "paused" };
    await guarded(`${cmd}-${uid}`, async () => {
      await post(`/api/v1/admin/maps/${encodeURIComponent(uid)}/tracking`, body);
      await Promise.all([loadMaps(true), loadDashboard()]);
      const upd = findRow(uid);
      if (upd && state.drawer.open && state.drawer.type === "map") {
        openDrawer({
          type: "map",
          kicker: "Map Detail",
          title: stripFmt(upd.mapName || upd.mapUid),
          subtitle: upd.mapUid,
          payload: upd,
        });
      }
      toast(`${cmd === "track" ? "Tracking enabled" : "Paused"} for ${uid}.`, "ok");
    });
    return;
  }
  if (cmd === "check-now") {
    const userId = row.detail?.opsMonitorUserId;
    if (!userId) {
      toast("No ops user attached.", "warn");
      return;
    }
    await guarded(`check-${uid}`, async () => {
      await post(`/api/v1/admin/ops/maps/${encodeURIComponent(uid)}/check-now`, { userId, reason: "admin-v2" });
      await Promise.all([loadActivity(), loadDashboard()]);
      toast(`Check triggered for ${uid}.`, "ok");
    });
  }
}

export async function handleClubAction(action, hookKey, clubId) {
  const club = findClub({ hookKey, clubId });
  if (!club) return;
  if (action === "manage") {
    openDrawer({
      type: "club-config",
      kicker: "Club",
      title: stripFmt(club.clubName || `Club ${club.clubId}`),
      subtitle: `${club.hookKey || "hook"} / ${club.clubId || "-"}`,
      payload: club,
    });
    return;
  }
  if (action === "sync") {
    await guarded(`club-sync:${club.hookKey}`, async () => {
      await post("/api/v1/admin/hook/altered/live/sync", {
        hookKey: club.hookKey,
        clubId: club.clubId,
        sourceLabel: club.sourceLabel,
        note: `admin-v2:${club.hookKey}`,
      });
      await Promise.all([loadJobs(), loadSettings(), loadDashboard()]);
      toast(`Sync triggered for ${stripFmt(club.clubName || club.clubId)}.`, "ok");
    });
    return;
  }
  if (action === "monitor") {
    await guarded(`club-mon:${club.clubId}`, async () => {
      await post("/api/v1/admin/hook/altered/live/monitor/config", { clubId: club.clubId });
      await Promise.all([loadSettings(), loadDashboard()]);
      toast(`${stripFmt(club.clubName || club.clubId)} is now the monitor club.`, "ok");
    });
  }
}

export async function handleSourceAction(action, sourceKey) {
  const source = findSource(sourceKey);
  if (!source) return;
  if (action === "sync") {
    await guarded(`source-sync:${source.sourceKey}`, async () => {
      await post(`/api/v1/admin/sources/${encodeURIComponent(String(source.sourceKey || ""))}/sync`, {});
      await Promise.all([loadJobs(), loadSettings(), loadDashboard(), loadMaps(true)]);
      toast(`Sync triggered for ${stripFmt(source.displayName || source.sourceKey)}.`, "ok");
    });
  }
}

export async function submitSettings(form) {
  const key = form.dataset.settingsForm;
  const fd = new FormData(form);
  const chk = (n) => fd.get(n) === "on";
  const num = (n) => {
    const r = String(fd.get(n) ?? "").trim();
    return r ? Number(r) : undefined;
  };
  const txt = (n) => String(fd.get(n) ?? "").trim();

  const cfgs = {
    hook: {
      url: "/api/v1/admin/hook/altered/config",
      body: {
        clubId: num("clubId"),
        clubName: txt("clubName"),
        sourceLabel: txt("sourceLabel"),
        enabled: chk("enabled"),
        autoTrackNewMaps: chk("autoTrackNewMaps"),
      },
      msg: "Hook config saved.",
    },
    monitor: {
      url: "/api/v1/admin/hook/altered/live/monitor/config",
      body: {
        enabled: chk("enabled"),
        discoveryEnabled: chk("discoveryEnabled"),
        scheduleMode: txt("scheduleMode"),
        intervalSeconds: num("intervalSeconds"),
        dailyHourUtc: num("dailyHourUtc"),
        dailyMinuteUtc: num("dailyMinuteUtc"),
        activityPageSize: num("activityPageSize"),
        trackerChunkSize: num("trackerChunkSize"),
        discoveryIntervalSeconds: num("discoveryIntervalSeconds"),
        discoveryCampaignLimit: num("discoveryCampaignLimit"),
        discoveryActivityPageSize: num("discoveryActivityPageSize"),
        activeOnly: chk("activeOnly"),
        fetchMapDetails: chk("fetchMapDetails"),
      },
      msg: "Monitor config saved.",
    },
    displayname: {
      url: "/api/v1/admin/hook/altered/live/mapper-sync/config",
      body: {
        enabled: chk("enabled"),
        bootstrapIntervalSeconds: num("bootstrapIntervalSeconds"),
        maintenanceIntervalSeconds: num("maintenanceIntervalSeconds"),
        priorityIntervalSeconds: num("priorityIntervalSeconds"),
        batchSize: num("batchSize"),
        priorityBatchSize: num("priorityBatchSize"),
        priorityTopLimit: num("priorityTopLimit"),
        priorityRefreshSeconds: num("priorityRefreshSeconds"),
        knownAccountsRefreshSeconds: num("knownAccountsRefreshSeconds"),
        cacheTtlSeconds: num("cacheTtlSeconds"),
        priorityCacheTtlSeconds: num("priorityCacheTtlSeconds"),
        minRequestGapMs: num("minRequestGapMs"),
      },
      msg: "Display name config saved.",
    },
    ops: {
      url: "/api/v1/admin/ops/scheduler/config",
      body: { enabled: chk("enabled"), tickSeconds: num("tickSeconds"), maxMapsPerRun: num("maxMapsPerRun") },
      msg: "Ops config saved.",
    },
    bot: {
      url: "/api/v1/admin/ops/bot/config",
      body: {
        enabled: chk("enabled"),
        announceWrChanges: chk("announceWrChanges"),
        botName: txt("botName"),
        guildId: txt("guildId"),
        channelId: txt("channelId"),
        webhookUrl: txt("webhookUrl"),
        mentionRoleId: txt("mentionRoleId"),
        footerText: txt("footerText"),
      },
      msg: "Bot config saved.",
    },
  };
  const cfg = cfgs[key];
  if (!cfg) return;
  await guarded(`settings-${key}`, async () => {
    await post(cfg.url, cfg.body);
    await Promise.all([loadSettings(), loadDashboard(), loadJobs()]);
    toast(cfg.msg, "ok");
  });
}

export async function doNameReview({ mapUid, reviewState, manualName = "" }) {
  await guarded(`review-${mapUid}`, async () => {
    await post(`/api/v1/admin/naming/candidates/${encodeURIComponent(mapUid)}/review`, {
      reviewState,
      manualName,
      reviewNote: `admin-v2: ${reviewState}`,
    });
    await Promise.all([loadMaps(true), loadDashboard()]);
    toast(`Review updated for ${mapUid}.`, "ok");
  });
}

async function openJobHistory(jobKey) {
  const p = await api(`/api/v1/admin/jobs/${encodeURIComponent(jobKey)}/history?limit=20&cursor=0`);
  openDrawer({
    type: "job-history",
    kicker: "Run History",
    title: p.label || "Job History",
    subtitle: jobKey,
    payload: { jobKey, items: p.items || [], total: p.total || 0, nextCursor: p.nextCursor, hasMore: p.hasMore },
  });
}

export async function loadMoreHistory(jobKey) {
  const cur = state.drawer.payload || {};
  if (!cur.hasMore) return;
  const p = await api(
    `/api/v1/admin/jobs/${encodeURIComponent(jobKey)}/history?limit=20&cursor=${Number(cur.nextCursor || 0)}`
  );
  openDrawer({
    type: "job-history",
    kicker: "Run History",
    title: state.drawer.title,
    subtitle: jobKey,
    payload: {
      jobKey,
      items: [...(cur.items || []), ...(p.items || [])],
      total: p.total || cur.total || 0,
      nextCursor: p.nextCursor,
      hasMore: p.hasMore,
    },
  });
}

export async function doLogout() {
  await guarded("logout", async () => {
    await fetch(alteredUrl("/api/v1/admin/auth/logout"), { method: "POST", credentials: "same-origin" });
    closeDrawer();
    state.auth = { authenticated: false, loginUrl: normalizeLoginUrl("/admin/login/") };
    location.replace(normalizeLoginUrl("/admin/login/"));
  });
}
