function renderAbuseRows(container, rows, { documentRef = document, emptyText = "No data" } = {}) {
  container.replaceChildren();
  if (!rows.length) {
    const row = documentRef.createElement("tr");
    const cell = documentRef.createElement("td");
    cell.colSpan = 2;
    cell.style.textAlign = "center";
    cell.textContent = emptyText;
    row.append(cell);
    container.append(row);
    return;
  }

  for (const { ip, count } of rows) {
    const row = documentRef.createElement("tr");
    const ipCell = documentRef.createElement("td");
    const countCell = documentRef.createElement("td");
    ipCell.textContent = String(ip ?? "");
    countCell.textContent = String(count ?? 0);
    row.append(ipCell, countCell);
    container.append(row);
  }
}

export { renderAbuseRows };
