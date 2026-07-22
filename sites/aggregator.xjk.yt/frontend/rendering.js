import { createTextElement } from "../../shared/xjk-core/dom-utils.js";

const DATE_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, DATE_OPTIONS);
}

function createChangeBadge(doc, value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "*" || raw === "new") {
    return createTextElement(doc, "span", { className: "change-flag is-new", text: "*" });
  }
  if (raw === "yes" || raw === "changed" || raw === "1" || raw === "true") {
    return createTextElement(doc, "span", { className: "change-flag is-yes", text: "yes" });
  }
  if (raw === "no" || raw === "0" || raw === "false") {
    return createTextElement(doc, "span", { className: "change-flag is-no", text: "no" });
  }
  return createTextElement(doc, "span", { className: "change-flag is-none", text: "-" });
}

function createEventRow(doc, row = {}) {
  const eventDetail = [row.eventType || row.event || "-", row.eventDetail || row.detail2 || null]
    .filter(Boolean)
    .join(" | ");
  const changedLabel = row.changedLabel !== undefined ? row.changedLabel : row.changed ? "yes" : "no";
  const tableRow = doc.createElement("tr");
  tableRow.append(
    createTextElement(doc, "td", { text: formatDate(row.occurredAt || row.checkedAt) }),
    createTextElement(doc, "td", { text: row.projectName || row.projectKey }),
    createTextElement(doc, "td", { text: row.item || row.detail1 || row.mapName || row.mapUid || "-" }),
    createTextElement(doc, "td", { text: eventDetail })
  );
  const changedCell = doc.createElement("td");
  changedCell.appendChild(createChangeBadge(doc, changedLabel));
  tableRow.appendChild(changedCell);
  return tableRow;
}

function createProjectMapRow(doc, row = {}, { displaynameMode = false, formatNumber = String } = {}) {
  const tableRow = doc.createElement("tr");
  if (displaynameMode) {
    tableRow.append(
      createTextElement(doc, "td", { text: row.accountId || "-" }),
      createTextElement(doc, "td", { text: row.displayName || "-" }),
      createTextElement(doc, "td", { text: row.source || "-" }),
      createTextElement(doc, "td", { text: formatDate(row.observedAt) })
    );
    return tableRow;
  }

  const mapCell = createTextElement(doc, "td", { text: row.mapName || row.mapUid });
  mapCell.appendChild(createTextElement(doc, "div", { className: "muted", text: row.mapUid }));
  tableRow.append(
    mapCell,
    createTextElement(doc, "td", { text: formatNumber(row.checkCount || 0) }),
    createTextElement(doc, "td", { text: formatNumber(row.changeCount || 0) }),
    createTextElement(doc, "td", { text: formatDate(row.latestCheckedAt) })
  );
  return tableRow;
}

function createNameRow(doc, row = {}) {
  const tableRow = doc.createElement("tr");
  const nameCell = doc.createElement("td");
  if (row.pending) {
    nameCell.appendChild(
      createTextElement(doc, "span", {
        className: "muted",
        text: `pending lookup${row.stale ? " (stale)" : ""}`,
      })
    );
  } else {
    nameCell.textContent = String(row.displayName || "-");
  }
  const observedAt = row.pending ? row.lastSeenAt || row.observedAt : row.observedAt;
  tableRow.append(
    createTextElement(doc, "td", { text: row.accountId }),
    nameCell,
    createTextElement(doc, "td", { text: formatDate(observedAt) })
  );
  return tableRow;
}

export { createEventRow, createNameRow, createProjectMapRow, formatDate };
