import { AggregatorClient } from "../../shared/aggregatorClient.js";
import { DisplayNameDirectory } from "../../shared/displayNameDirectory.js";
import { TrackerDisplaynameClient } from "../../shared/trackerDisplaynameClient.js";

export function createDisplayNameService({ config, db, helpers } = {}) {
  const { normalizeBridgeAccountId, nowMs, sanitizeBridgeDisplayName } = helpers;

  function getLocalDisplayNames(accountIds = []) {
    const normalizedAccountIds = [
      ...new Set((Array.isArray(accountIds) ? accountIds : []).map(normalizeBridgeAccountId).filter(Boolean)),
    ];
    if (!normalizedAccountIds.length) return {};
    const placeholders = normalizedAccountIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT account_id, display_name
         FROM bingo_users
         WHERE account_id IN (${placeholders})`
      )
      .all(...normalizedAccountIds);
    const namesByAccountId = {};
    for (const row of rows) {
      const accountId = normalizeBridgeAccountId(row?.account_id);
      const displayName = sanitizeBridgeDisplayName(row?.display_name, { accountId });
      if (!accountId || !displayName) continue;
      namesByAccountId[accountId] = displayName;
    }
    return namesByAccountId;
  }

  function authoritativeSessionIdentity(sessionRow = null) {
    const accountId = normalizeBridgeAccountId(sessionRow?.account_id || sessionRow?.provider_account_id || "");
    const displayName =
      sanitizeBridgeDisplayName(
        sessionRow?.account_display_name ||
          sessionRow?.display_name ||
          sessionRow?.account_username ||
          sessionRow?.username ||
          "",
        { accountId }
      ) || String(sessionRow?.account_display_name || sessionRow?.display_name || accountId || "").trim();
    const subject =
      String(sessionRow?.provider_subject || sessionRow?.subject || sessionRow?.account_id || "").trim() || null;
    const username = String(sessionRow?.account_username || sessionRow?.username || displayName || "").trim() || null;
    return {
      accountId,
      displayName,
      subject,
      username,
      xjkAccountId: String(sessionRow?.xjk_account_id || "").trim() || null,
    };
  }

  function rememberObservedDisplayName({ accountId, displayName, subject = null, isOperator = null }) {
    const safeAccountId = normalizeBridgeAccountId(accountId);
    const safeDisplayName = sanitizeBridgeDisplayName(displayName, { accountId: safeAccountId });
    if (!safeAccountId || !safeDisplayName) return "";
    const now = nowMs();
    const existing = db.prepare("SELECT subject, is_operator FROM bingo_users WHERE account_id = ?").get(safeAccountId);
    const nextSubject = String(subject || existing?.subject || "").trim() || null;
    const nextOperator =
      isOperator === null || isOperator === undefined ? Number(existing?.is_operator || 0) > 0 : Boolean(isOperator);
    db.prepare(
      `
      INSERT INTO bingo_users (account_id, subject, display_name, is_operator, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        subject = COALESCE(excluded.subject, bingo_users.subject),
        display_name = excluded.display_name,
        is_operator = CASE
          WHEN excluded.is_operator > bingo_users.is_operator THEN excluded.is_operator
          ELSE bingo_users.is_operator
        END,
        updated_at = excluded.updated_at
    `
    ).run(safeAccountId, nextSubject, safeDisplayName, nextOperator ? 1 : 0, now, now);
    return safeDisplayName;
  }

  function rememberObservedDisplayNames(namesByAccountId = {}, { source = "bingo-console-bridge" } = {}) {
    const safeMap = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
    const remembered = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(safeMap)) {
      const displayName = rememberObservedDisplayName({
        accountId: rawAccountId,
        displayName: rawDisplayName,
      });
      if (!displayName) continue;
      remembered[normalizeBridgeAccountId(rawAccountId)] = displayName;
    }
    return {
      ok: true,
      source,
      count: Object.keys(remembered).length,
      namesByAccountId: remembered,
    };
  }

  const aggregatorClient = new AggregatorClient({
    baseUrl: config.aggregatorBaseUrl,
    token: config.aggregatorToken,
    timeoutMs: config.requestTimeoutMs,
    logger: console,
  });

  const trackerDisplaynameClient = new TrackerDisplaynameClient({
    baseUrl: config.trackerDisplaynameBaseUrl,
    timeoutMs: config.requestTimeoutMs,
    logger: console,
  });

  const displayNameDirectory = new DisplayNameDirectory({
    aggregatorClient,
    trackerDisplaynameClient,
    logger: console,
    cacheTtlMs: config.displayNameCacheTtlMs,
    projectKey: "bingo-console-bridge-displayname",
    projectName: "Bingo Console Bridge Displayname",
    sourceLabel: "bingo-console-bridge",
    getLocalNames: async (accountIds) => getLocalDisplayNames(accountIds),
    setLocalNames: async (namesByAccountId, { source = "bingo-console-bridge" } = {}) =>
      rememberObservedDisplayNames(namesByAccountId, { source }),
  });

  function getDisplayNameObservationDelta(namesByAccountId = {}) {
    const safeMap = namesByAccountId && typeof namesByAccountId === "object" ? namesByAccountId : {};
    const normalizedAccountIds = Object.keys(safeMap)
      .map((accountId) => normalizeBridgeAccountId(accountId))
      .filter(Boolean);
    const localNamesByAccountId = getLocalDisplayNames(normalizedAccountIds);
    const delta = {};
    for (const [rawAccountId, rawDisplayName] of Object.entries(safeMap)) {
      const accountId = normalizeBridgeAccountId(rawAccountId);
      const displayName = sanitizeBridgeDisplayName(rawDisplayName, { accountId });
      if (!accountId || !displayName) continue;
      const cached = displayNameDirectory.getCachedDisplayName(accountId);
      const local = sanitizeBridgeDisplayName(localNamesByAccountId[accountId], { accountId });
      if (cached === displayName && local === displayName) continue;
      delta[accountId] = displayName;
    }
    return delta;
  }

  async function observeDisplayNames(
    namesByAccountId = {},
    { source = "bingo-console-bridge", persistLocal = true } = {}
  ) {
    const delta = getDisplayNameObservationDelta(namesByAccountId);
    if (!Object.keys(delta).length) {
      return {
        ok: true,
        skipped: true,
        namesByAccountId: {},
      };
    }
    return displayNameDirectory.observeNames(delta, {
      source,
      persistLocal,
    });
  }

  async function observeDisplayName(
    accountId,
    displayName,
    { source = "bingo-console-bridge", subject = null, isOperator = null } = {}
  ) {
    const safeDisplayName = rememberObservedDisplayName({
      accountId,
      displayName,
      subject,
      isOperator,
    });
    if (!safeDisplayName) return "";
    await displayNameDirectory.observeNames(
      {
        [normalizeBridgeAccountId(accountId)]: safeDisplayName,
      },
      { source, persistLocal: false }
    );
    return safeDisplayName;
  }

  return {
    getLocalDisplayNames,
    authoritativeSessionIdentity,
    rememberObservedDisplayName,
    rememberObservedDisplayNames,
    aggregatorClient,
    trackerDisplaynameClient,
    displayNameDirectory,
    getDisplayNameObservationDelta,
    observeDisplayNames,
    observeDisplayName,
  };
}
