async function fetchPagedCollection(
  baseUrl,
  key,
  { fetchPage, resolveUrl = (value) => value, limit = 1000, maxPages = 400, params = {} } = {}
) {
  if (typeof fetchPage !== "function") {
    throw new TypeError("fetchPagedCollection requires a fetchPage function.");
  }

  const rows = [];
  let offset = 0;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 1000, 5000));
  const safeMaxPages = Math.max(1, Math.min(Number(maxPages) || 400, 2000));

  for (let page = 0; page < safeMaxPages; page += 1) {
    const query = new URLSearchParams({
      limit: String(safeLimit),
      offset: String(offset),
    });
    Object.entries(params || {}).forEach(([paramKey, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(paramKey, String(value));
    });

    const payload = await fetchPage(resolveUrl(`${baseUrl}?${query.toString()}`));
    const pageRows = Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload) ? payload : [];
    if (pageRows.length) rows.push(...pageRows);

    const hasMore = Boolean(payload?.paging?.has_more);
    const nextOffset = Number(payload?.paging?.next_offset);
    if (!hasMore || !Number.isFinite(nextOffset) || nextOffset <= offset || pageRows.length === 0) break;
    offset = nextOffset;
  }

  return rows;
}

export { fetchPagedCollection };
