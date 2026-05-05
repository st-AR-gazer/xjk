const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCKED_DISPLAY_NAME_EXACT = new Set([
  "accountid",
  "zoneid",
  "groupuid",
  "mapid",
  "mapuid",
  "seasonid",
]);
const BLOCKED_PLATFORM_LABELS = new Set([
  "playstation",
  "playstation4",
  "playstation5",
  "ps4",
  "ps5",
  "xbox",
  "xboxone",
  "xboxseries",
  "xboxseriesx",
  "xboxseriess",
  "nintendoswitch",
]);
const KNOWN_DISPLAY_NAMES_BY_ACCOUNT_ID = new Map([
  ["d2372a08-a8a1-46cb-97fb-23a161d85ad0", "Nadeo"],
]);

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

function resolveKnownDisplayName(accountId) {
  const normalizedAccountId = normalizePossibleAccountId(accountId);
  if (!normalizedAccountId) return "";
  return KNOWN_DISPLAY_NAMES_BY_ACCOUNT_ID.get(normalizedAccountId) || "";
}

function normalizeDisplayNameQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactDisplayName(value) {
  return normalizeDisplayNameQuery(value).replace(/[^a-z0-9]+/g, "");
}

function validateSharedDisplayName(value, { accountId = "" } = {}) {
  const displayName = sanitizeResolvedDisplayName(value, { accountId });
  if (!displayName) {
    return {
      ok: false,
      displayName: "",
      normalizedDisplayName: "",
      reason: "empty_or_account_id",
    };
  }

  const normalizedDisplayName = normalizeDisplayNameQuery(displayName);
  const compact = compactDisplayName(displayName);
  if (BLOCKED_DISPLAY_NAME_EXACT.has(compact)) {
    return {
      ok: false,
      displayName,
      normalizedDisplayName,
      reason: "reserved_field_name",
    };
  }
  if (normalizedDisplayName.includes("personal best") || compact.includes("personalbest")) {
    return {
      ok: false,
      displayName,
      normalizedDisplayName,
      reason: "personal_best_label",
    };
  }
  if (BLOCKED_PLATFORM_LABELS.has(compact)) {
    return {
      ok: false,
      displayName,
      normalizedDisplayName,
      reason: "platform_label",
    };
  }

  return {
    ok: true,
    displayName,
    normalizedDisplayName,
    reason: "",
  };
}

export {
  hasResolvedDisplayName,
  normalizeDisplayNameQuery,
  normalizePossibleAccountId,
  resolveKnownDisplayName,
  sanitizeResolvedDisplayName,
  validateSharedDisplayName,
};
