import "/shared/xjk-core/safe-html.js?v=2";
import { fetchJson } from "/shared/xjk-core/http.js";
import { createNameRow } from "../rendering.js";
import { fmtNumber, paginate, state, updatePaginationUI } from "./dashboardRuntime.js";

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
    fetchJson("/api/v1/events/recent?limit=10&event_type=club.snapshot&include_system=1").catch(() => ({
      events: [],
    })),
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

  document.getElementById("clubSummary").textContent = JSON.stringify(payload, null, 2);
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
  body.replaceChildren();

  if (!slice.length) {
    globalThis.XjkSafeHtml.set(
      body,
      '<tr><td colspan="3" class="muted">No display names or pending candidates yet.</td></tr>'
    );
  } else {
    slice.forEach((row) => {
      body.appendChild(createNameRow(document, row));
    });
  }

  updatePaginationUI("names", page, totalPages);
}

export { loadClubSummary, loadNames, renderNames };
