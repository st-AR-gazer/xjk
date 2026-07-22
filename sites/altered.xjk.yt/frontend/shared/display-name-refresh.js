const DEFAULT_DISPLAY_NAME_REFRESH_DELAYS_MS = [4000, 8000, 12000, 20000, 30000, 45000];

function normalizePendingAccountIds(accountIds) {
  return [
    ...new Set(
      (Array.isArray(accountIds) ? accountIds : [])
        .map((accountId) =>
          String(accountId || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
}

function clearDisplayNameRefreshState(state, { reset = true, clearTimer = globalThis.clearTimeout } = {}) {
  if (state.timer) {
    clearTimer(state.timer);
    state.timer = null;
  }
  if (reset) {
    state.attempts = 0;
    state.key = "";
  }
}

function scheduleDisplayNameRefresh({
  state,
  accountIds,
  onRefresh,
  onAccountIdsChanged,
  delaysMs = DEFAULT_DISPLAY_NAME_REFRESH_DELAYS_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  const pendingAccountIds = normalizePendingAccountIds(accountIds);
  if (!pendingAccountIds.length) {
    clearDisplayNameRefreshState(state, { reset: true, clearTimer });
    return false;
  }

  const refreshKey = pendingAccountIds.join(",");
  if (state.key !== refreshKey) {
    clearDisplayNameRefreshState(state, { reset: false, clearTimer });
    state.key = refreshKey;
    state.attempts = 0;
    onAccountIdsChanged?.(pendingAccountIds);
  }
  if (state.timer || state.attempts >= delaysMs.length) return false;

  const delayMs = delaysMs[Math.min(state.attempts, delaysMs.length - 1)];
  state.attempts += 1;
  state.timer = setTimer(() => {
    state.timer = null;
    onRefresh(pendingAccountIds);
  }, delayMs);
  return true;
}

function createDisplayNameRefreshController({
  onRefresh,
  onAccountIdsChanged,
  delaysMs = DEFAULT_DISPLAY_NAME_REFRESH_DELAYS_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (typeof onRefresh !== "function") {
    throw new TypeError("Display-name refresh requires an onRefresh callback.");
  }

  const state = { timer: null, attempts: 0, key: "" };
  return Object.freeze({
    clear({ reset = true } = {}) {
      clearDisplayNameRefreshState(state, { reset, clearTimer });
    },
    schedule(accountIds = []) {
      return scheduleDisplayNameRefresh({
        state,
        accountIds,
        onRefresh,
        onAccountIdsChanged,
        delaysMs,
        setTimer,
        clearTimer,
      });
    },
  });
}

function collectPendingDisplayNameAccountIds(rows, { accountKeys, displayKeys, pendingKey = "displayNamePending" }) {
  const pendingAccountIds = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const accountId =
      accountKeys
        .map((key) =>
          String(row?.[key] || "")
            .trim()
            .toLowerCase()
        )
        .find((value) => looksLikeAccountId(value)) || "";
    const unresolvedDisplayName = displayKeys
      .map((key) => String(row?.[key] || "").trim())
      .some((value) => looksLikeAccountId(value));
    if ((!row?.[pendingKey] && !(accountId && unresolvedDisplayName)) || !accountId || seen.has(accountId)) {
      continue;
    }
    seen.add(accountId);
    pendingAccountIds.push(accountId);
  }
  return pendingAccountIds;
}

function looksLikeAccountId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

export {
  clearDisplayNameRefreshState,
  collectPendingDisplayNameAccountIds,
  createDisplayNameRefreshController,
  DEFAULT_DISPLAY_NAME_REFRESH_DELAYS_MS,
  normalizePendingAccountIds,
  scheduleDisplayNameRefresh,
};
