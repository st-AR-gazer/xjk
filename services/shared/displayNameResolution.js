const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePossibleAccountId(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return ACCOUNT_ID_RE.test(text) ? text : "";
}

function sanitizeResolvedDisplayName(value, { accountId = "" } = {}) {
  const displayName = String(value || "").trim();
  if (!displayName) return "";
  if (normalizePossibleAccountId(displayName)) return "";
  const normalizedAccountId = normalizePossibleAccountId(accountId);
  if (normalizedAccountId && displayName.toLowerCase() === normalizedAccountId) return "";
  return displayName;
}

function hasResolvedDisplayName(value, { accountId = "" } = {}) {
  return Boolean(sanitizeResolvedDisplayName(value, { accountId }));
}

function normalizeDisplayNameQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export {
  hasResolvedDisplayName,
  normalizeDisplayNameQuery,
  normalizePossibleAccountId,
  sanitizeResolvedDisplayName,
};
