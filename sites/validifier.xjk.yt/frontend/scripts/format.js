export function formatTimestamp(value) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function textOrFallback(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function buildQueryString(values) {
  const params = new URLSearchParams();
  if (values.recordId) params.set("recordId", values.recordId);
  if (values.mapUid) params.set("mapUid", values.mapUid);

  const query = params.toString();
  return query ? `?${query}` : window.location.pathname;
}

export function updateLocation(values) {
  window.history.replaceState({}, "", buildQueryString(values));
}
