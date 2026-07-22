import { fmtBytes, fmtDateTime, fmtMs, fmtNumber, fmtPercent } from "./formatters.js?v=2";
import { clearElement } from "./dom.js?v=2";

function openDrawer(title, entries) {
  const drawer = document.getElementById("detailDrawer");
  const titleEl = document.getElementById("drawerTitle");
  const contentEl = document.getElementById("drawerContent");
  if (!drawer || !titleEl || !contentEl) return;

  titleEl.textContent = title;

  const entryList = document.createElement("div");
  entryList.className = "drawer-entries";
  entries.forEach((entry) => {
    if (entry.separator) {
      const separator = document.createElement("div");
      separator.className = "drawer-separator";
      entryList.appendChild(separator);
      return;
    }

    const row = document.createElement("div");
    row.className = `drawer-entry${entry.full ? " full" : ""}`;

    const label = document.createElement("span");
    label.className = "drawer-entry-label";
    label.textContent = String(entry.label ?? "");

    const value = document.createElement("span");
    value.className = `drawer-entry-value${entry.mono ? " mono" : ""}`;
    value.textContent = String(entry.value ?? "");

    row.append(label, value);
    entryList.appendChild(row);
  });
  clearElement(contentEl);
  contentEl.appendChild(entryList);

  drawer.hidden = false;
}

export function closeDrawer() {
  const drawer = document.getElementById("detailDrawer");
  if (drawer) drawer.hidden = true;
}

export function openRouteDetail(item, subTabType) {
  const typeLabels = { incoming: "Incoming Route", outgoing: "Outgoing Target", nadeo: "Nadeo Route" };
  const title = typeLabels[subTabType] || "Route Detail";
  const keyLabel = subTabType === "outgoing" ? "Target" : "Route";

  openDrawer(title, [
    { label: keyLabel, value: item.key || "-", full: true, mono: true },
    { separator: true },
    { label: "Requests", value: fmtNumber(item.requests || 0) },
    { label: "Errors", value: fmtNumber(item.errorRequests || 0) },
    { label: "Error Rate", value: fmtPercent(item.errorRatePct || 0) },
    { label: "Avg Duration", value: fmtMs(item.avgDurationMs || 0) },
    { separator: true },
    { label: "Bytes In", value: fmtBytes(item.bytesIn || 0) },
    { label: "Bytes Out", value: fmtBytes(item.bytesOut || 0) },
  ]);
}

export function openErrorDetail(item) {
  const requestText = `${item.method || "-"} ${item.route || "-"}`;

  const entries = [
    { label: "Time", value: fmtDateTime(item.occurredAt), full: true },
    { separator: true },
    { label: "Direction", value: item.direction || "-" },
    { label: "Service", value: item.service || "-" },
    { label: "Method", value: item.method || "-" },
    { label: "Status", value: String(item.statusCode || "-") },
    { separator: true },
    { label: "Request", value: requestText, full: true, mono: true },
  ];

  if (item.direction !== "incoming") {
    entries.push({ label: "Target Host", value: item.targetHost || "-", full: true, mono: true });
    if (item.targetPath) {
      entries.push({ label: "Target Path", value: item.targetPath, full: true, mono: true });
    }
  }

  entries.push(
    { separator: true },
    { label: "Duration", value: fmtMs(item.durationMs || 0) },
    { label: "Bytes In", value: fmtBytes(item.bytesIn || 0) },
    { label: "Bytes Out", value: fmtBytes(item.bytesOut || 0) },
    { label: "Project", value: item.projectKey || "-" },
    { separator: true },
    { label: "Source", value: item.sourceLabel || "-" },
    { label: "Nadeo Target", value: item.isNadeoOutgoing ? "Yes" : "No" },
    { label: "Internal Target", value: item.isInternalOutgoing ? "Yes" : "No" }
  );

  openDrawer("Error Detail", entries);
}
