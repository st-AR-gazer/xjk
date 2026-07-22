import { ROUTE_SUB_TABS, buildQuery, state } from "./state.js?v=2";
import { fetchDashJson } from "./api-client.js?v=2";
import {
  appendRouteKey,
  appendTableMessage,
  appendTextCell,
  clearElement,
  createSvgElement,
  setStatus,
  setText,
  stampStatus,
  waitForNextPaint,
} from "./dom.js?v=2";
import {
  fmtBytes,
  fmtDateTime,
  fmtMaybeBytes,
  fmtMs,
  fmtNumber,
  fmtOneReqEverySeconds,
  fmtPercent,
  fmtRate,
  fmtSeconds,
} from "./formatters.js?v=2";

let errorRefreshBusy = false;
let nadeoGuardrailRequestId = 0;

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

export function routeErrorPercent(item = {}) {
  const provided = Number(item.errorRatePct);
  if (Number.isFinite(provided)) return Math.max(0, Math.min(100, provided));

  const requests = Number(item.requests || 0);
  const errors = Number(item.errorRequests || 0);
  if (!Number.isFinite(requests) || requests <= 0 || !Number.isFinite(errors) || errors <= 0) return 0;
  return Math.max(0, Math.min(100, (errors / requests) * 100));
}

export function routeErrorHeat(errorRatePct) {
  const rate = Math.max(0, Math.min(100, Number(errorRatePct || 0)));
  const ratio = rate / 100;
  const severity = rate >= 75 ? "critical" : rate >= 35 ? "high" : rate >= 10 ? "medium" : rate > 0 ? "low" : "none";

  if (severity === "none") {
    return { severity, style: "" };
  }

  const alpha = Math.min(0.58, 0.05 + ratio * 0.53);
  const tailAlpha = Math.max(0.015, alpha * 0.18);
  const hoverAlpha = Math.min(0.68, alpha + 0.08);
  const borderAlpha = Math.min(0.95, 0.22 + ratio * 0.73);

  return {
    severity,
    style:
      `--route-error-alpha:${alpha.toFixed(3)};` +
      `--route-error-tail-alpha:${tailAlpha.toFixed(3)};` +
      `--route-error-hover-alpha:${hoverAlpha.toFixed(3)};` +
      `--route-error-border-alpha:${borderAlpha.toFixed(3)};`,
  };
}

function renderTopTable(bodyId, rows = [], cacheKey = null, emptyMessage = "No traffic samples in this range.") {
  if (cacheKey) state.cached[cacheKey] = rows;

  const body = document.getElementById(bodyId);
  if (!body) return;
  setTopTableLoading(bodyId, false);
  clearElement(body);
  if (!rows.length) {
    appendTableMessage(body, emptyMessage, 7);
    return;
  }
  rows.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const errorRatePct = routeErrorPercent(item);
    const heat = routeErrorHeat(errorRatePct);
    tr.className = `clickable-row route-error-row route-error-${heat.severity}`;
    if (heat.style) tr.setAttribute("style", heat.style);
    tr.dataset.detailType = String(cacheKey || "");
    tr.dataset.detailIdx = String(idx);
    const keyCell = appendTextCell(tr, "", { className: "cell-key", title: item.key || "-" });
    appendRouteKey(keyCell, item.key);
    appendTextCell(tr, fmtNumber(item.requests || 0));
    appendTextCell(tr, fmtNumber(item.errorRequests || 0));
    appendTextCell(tr, fmtPercent(errorRatePct), {
      className: `route-error-rate route-error-rate-${heat.severity}`,
    });
    appendTextCell(tr, fmtMs(item.avgDurationMs || 0));
    appendTextCell(tr, fmtBytes(item.bytesIn || 0));
    appendTextCell(tr, fmtBytes(item.bytesOut || 0));
    body.appendChild(tr);
  });
}

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

  clearElement(body);
  if (!rows.length) {
    appendTableMessage(body, "No errors found for the current filter.", 9);
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
        item.direction === "incoming" ? "-" : item.target || `${item.targetHost || "-"}${item.targetPath || ""}`;
      appendTextCell(tr, fmtDateTime(item.occurredAt));
      appendTextCell(tr, item.direction || "-");
      appendTextCell(tr, item.service || "-");
      const requestCell = appendTextCell(tr, "", { className: "cell-key", title: requestText });
      appendRouteKey(requestCell, route, { prefix: method });
      const targetCell = appendTextCell(tr, "", { className: "cell-key", title: targetText });
      appendRouteKey(targetCell, targetText);
      appendTextCell(tr, item.statusCode || "-");
      appendTextCell(tr, fmtMs(item.durationMs || 0));
      appendTextCell(tr, item.projectKey || "-");
      appendTextCell(tr, item.sourceLabel || "-");
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

export function setNadeoQueueOpen(isOpen) {
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
  clearElement(body);
  if (!rows.length) {
    appendTableMessage(body, "Queue is empty.", 7);
    return;
  }

  rows
    .slice()
    .sort((a, b) => Date.parse(String(a.enqueuedAt || "")) - Date.parse(String(b.enqueuedAt || "")))
    .forEach((item) => {
      const statusText = String(item.status || "-");
      const waitMs =
        Number(item.appliedWaitMs || 0) > 0 ? Number(item.appliedWaitMs || 0) : Number(item.requestedWaitMs || 0);
      const tr = document.createElement("tr");
      appendTextCell(tr, statusText);
      appendTextCell(tr, item.label || "-");
      appendTextCell(tr, item.pid || "-");
      appendTextCell(tr, fmtMs(waitMs));
      appendTextCell(tr, fmtDateTime(item.enqueuedAt));
      appendTextCell(tr, fmtDateTime(item.grantedAt));
      appendTextCell(tr, fmtDateTime(item.completedAt));
      body.appendChild(tr);
    });
}

export async function refreshNadeoQueue({ silent = false } = {}) {
  try {
    const payload = await fetchDashJson("/nadeo/queue?limit=120");
    renderNadeoQueue(payload || {});
    if (!silent) stampStatus("Updated");
  } catch (error) {
    const metaEl = document.getElementById("nadeoQueueMeta");
    if (metaEl) metaEl.textContent = `Queue unavailable: ${error?.message || error}`;
    const body = document.getElementById("nadeoQueueBody");
    if (body) appendTableMessage(body, "Failed to load queue.", 7);
    if (!silent) setStatus(`Error: ${error?.message || error}`);
  }
}

function renderTrafficChart(points = []) {
  const svg = document.getElementById("trafficChart");
  if (!svg) return;
  const width = 900;
  const height = 260;
  const padding = { left: 28, right: 10, top: 12, bottom: 26 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  clearElement(svg);

  if (!points.length) {
    svg.append(
      createSvgElement("line", {
        x1: padding.left,
        y1: height - padding.bottom,
        x2: width - padding.right,
        y2: height - padding.bottom,
        stroke: "rgba(255,255,255,0.2)",
      }),
      createSvgElement(
        "text",
        {
          x: width / 2,
          y: height / 2,
          "text-anchor": "middle",
          fill: "rgba(255,255,255,0.45)",
          "font-size": 13,
        },
        "No traffic in selected range."
      )
    );
    return;
  }

  const hasValue = (selector) => points.some((point) => Number(point?.[selector] || 0) > 0);
  const series = [
    { selector: "requests", label: "All", color: "#e5e7eb", width: 2.8 },
    { selector: "incomingRequests", label: "Incoming", color: "#60a5fa", width: 2 },
    { selector: "outgoingRequests", label: "Outgoing", color: "#f97316", width: 2, dash: "5 4" },
    hasValue("nadeoOutgoingRequests")
      ? { selector: "nadeoOutgoingRequests", label: "Nadeo", color: "#a855f7", width: 2.2 }
      : null,
    hasValue("internalOutgoingRequests")
      ? { selector: "internalOutgoingRequests", label: "Internal", color: "#38bdf8", width: 1.8, dash: "3 5" }
      : null,
    hasValue("errorRequests")
      ? { selector: "errorRequests", label: "Errors", color: "#ff5f57", width: 1.8, dash: "2 4" }
      : null,
  ].filter(Boolean);

  const maxY = Math.max(
    1,
    ...points.map((point) => Math.max(...series.map((item) => Number(point[item.selector] || 0))))
  );

  const xAt = (idx) => (points.length <= 1 ? padding.left : padding.left + (idx / (points.length - 1)) * innerW);
  const yAt = (val) => padding.top + innerH - (Math.max(0, Number(val || 0)) / maxY) * innerH;

  const pathFor = (selector) =>
    points
      .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xAt(idx).toFixed(2)} ${yAt(point[selector]).toFixed(2)}`)
      .join(" ");

  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = padding.top + innerH - ratio * innerH;
    svg.appendChild(
      createSvgElement("line", {
        x1: padding.left,
        y1: y.toFixed(2),
        x2: width - padding.right,
        y2: y.toFixed(2),
        stroke: "rgba(255,255,255,0.08)",
      })
    );
  });

  const legendY = height - 7;
  svg.appendChild(
    createSvgElement("line", {
      x1: padding.left,
      y1: height - padding.bottom,
      x2: width - padding.right,
      y2: height - padding.bottom,
      stroke: "rgba(255,255,255,0.2)",
    })
  );
  series.forEach((item) => {
    svg.appendChild(
      createSvgElement("path", {
        d: pathFor(item.selector),
        fill: "none",
        stroke: item.color,
        "stroke-width": item.width,
        ...(item.dash ? { "stroke-dasharray": item.dash } : {}),
      })
    );
  });
  series.forEach((item, idx) => {
    const x = padding.left + 8 + idx * 116;
    svg.append(
      createSvgElement("circle", { cx: x, cy: legendY - 4, r: 3, fill: item.color }),
      createSvgElement("text", { x: x + 9, y: legendY, fill: "rgba(255,255,255,0.6)", "font-size": 11 }, item.label)
    );
  });
}

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

function updateNadeoGuardrail(payload = {}) {
  const guardrail = payload?.guardrail || payload || {};
  const effective = guardrail.effective || {};
  if (!effective.available) return;
  setText("mNadeoOut", fmtNumber(effective.requests || 0));
  setText("mNadeoRps", fmtRate(effective.requestsPerSecond || 0));
  setText("mNadeoPerSec", `1 req/${fmtOneReqEverySeconds(effective.requestsPerSecond || 0)}`);
  setText("mNadeoRpm", fmtNumber(effective.requestsPerMinute || 0));
  setText("mNadeoBytes", fmtMaybeBytes(effective.transferBytes));
}

async function refreshNadeoGuardrail({ query = buildQuery() } = {}) {
  const requestId = ++nadeoGuardrailRequestId;
  const payload = await fetchDashJson(`/nadeo/guardrail?${query}`).catch(() => null);
  if (!payload || requestId !== nadeoGuardrailRequestId) return;
  updateNadeoGuardrail(payload);
}

export function timelineBucketForWindow(windowHours) {
  const hours = Number(windowHours || 24);
  if (hours <= 6) return "minute";
  if (hours <= 48) return "quarter_hour";
  if (hours <= 24 * 21) return "hour";
  return "day";
}

export async function refreshOverviewPanel({ silent = false } = {}) {
  if (!silent) setStatus("Loading overview...");
  const query = buildQuery();
  const bucket = timelineBucketForWindow(state.filters.windowHours);

  const overviewPayload = await fetchDashJson(`/traffic/overview?${query}`);
  const overview = overviewPayload?.overview || {};
  updateOverview(overview);
  refreshNadeoGuardrail({ query }).catch(() => {});
  if (state.nadeoQueue.open) {
    refreshNadeoQueue({ silent: true }).catch(() => {});
  }
  await waitForNextPaint();
  if (!silent) setStatus("Loading timeline...");

  const seriesPayload = await fetchDashJson(`/traffic/timeseries?${query}&bucket=${bucket}`);
  const points = Array.isArray(seriesPayload?.series?.points) ? seriesPayload.series.points : [];
  renderTrafficChart(points);
}

export async function refreshErrorsOnly({ silent = false } = {}) {
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

export function routeSubtabRequest(subtab) {
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

export async function refreshRoutesPanel({ silent = false } = {}) {
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
