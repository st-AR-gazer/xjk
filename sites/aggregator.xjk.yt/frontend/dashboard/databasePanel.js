import "/shared/xjk-core/safe-html.js?v=2";
import { escapeHtml } from "/shared/xjk-core/dom-utils.js";
import { fetchJson } from "/shared/xjk-core/http.js";
import { fmtNumber, state } from "./dashboardRuntime.js";

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

  select.replaceChildren();
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
  root.replaceChildren();
  columns.forEach((column) => {
    const el = document.createElement("span");
    el.className = "pill";
    const typeText = String(column.type || "").trim() || "any";
    const pkText = column.primaryKey ? " pk" : "";
    globalThis.XjkSafeHtml.set(el, `<b>${escapeHtml(column.name)}</b> ${escapeHtml(typeText)}${pkText}`);
    root.appendChild(el);
  });
}

function renderDbSortColumns(columns = []) {
  const sortSelect = document.getElementById("dbSortBy");
  const previous = state.db.sortBy;
  sortSelect.replaceChildren();

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
    head.replaceChildren();
    globalThis.XjkSafeHtml.set(body, '<tr><td class="muted">No columns available.</td></tr>');
    return;
  }

  globalThis.XjkSafeHtml.set(head, `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`);
  body.replaceChildren();

  if (!rows.length) {
    globalThis.XjkSafeHtml.set(
      body,
      `<tr><td colspan="${columns.length}" class="muted">No rows in this range.</td></tr>`
    );
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    globalThis.XjkSafeHtml.set(
      tr,
      columns
        .map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return "<td class='muted'>null</td>";
          if (typeof value === "object") return `<td>${escapeHtml(JSON.stringify(value))}</td>`;
          return `<td>${escapeHtml(String(value))}</td>`;
        })
        .join("")
    );
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

  const data = await fetchJson(`/api/v1/db/tables/${encodeURIComponent(state.db.table)}/rows?${params.toString()}`);
  renderDbRows(data);

  const total = Number(data?.total || 0);
  const from = total ? state.db.offset + 1 : 0;
  const to = Math.min(total, state.db.offset + state.db.limit);
  setDbTableStats(`${state.db.table} | rows ${from}-${to} of ${fmtNumber(total)}`);
}

export { loadDbRows, loadDbSchema, loadDbTables };
