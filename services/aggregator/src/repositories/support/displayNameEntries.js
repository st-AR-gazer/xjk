import { validateSharedDisplayName } from "../../../../shared/displayNameResolution.js";
import { normalizeAccountId } from "../../../../shared/valueUtils.js";
import { normalizeArray } from "./repositoryValues.js";

function normalizeDisplayNameEntries(payload = {}) {
  const out = [];
  const rejected = [];

  const rejectEntry = ({ accountId = "", displayName = "", reason = "invalid_display_name" } = {}) => {
    rejected.push({
      accountId: accountId || null,
      displayName: displayName || null,
      reason,
    });
  };

  const maybeArray = normalizeArray(payload.names);
  for (const row of maybeArray) {
    const accountId = normalizeAccountId(row?.accountId || row?.account_id || row?.id);
    const rawDisplayName = row?.displayName ?? row?.display_name ?? row?.name ?? "";
    const validation = validateSharedDisplayName(rawDisplayName, { accountId });
    if (!accountId) {
      rejectEntry({ accountId, displayName: String(rawDisplayName || "").trim(), reason: "invalid_account_id" });
      continue;
    }
    if (!validation.ok) {
      rejectEntry({
        accountId,
        displayName: validation.displayName || String(rawDisplayName || "").trim(),
        reason: validation.reason,
      });
      continue;
    }
    out.push({
      accountId,
      displayName: validation.displayName,
      observedAt: row?.observedAt || row?.observed_at || payload.observedAt || payload.observed_at,
      source: row?.source || payload.sourceLabel || payload.source,
    });
  }

  const mapping = payload.namesByAccountId || payload.displayNames || payload.names_map;
  if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
    for (const [rawAccountId, rawName] of Object.entries(mapping)) {
      const accountId = normalizeAccountId(rawAccountId);
      const validation = validateSharedDisplayName(rawName, { accountId });
      if (!accountId) {
        rejectEntry({ accountId, displayName: String(rawName || "").trim(), reason: "invalid_account_id" });
        continue;
      }
      if (!validation.ok) {
        rejectEntry({
          accountId,
          displayName: validation.displayName || String(rawName || "").trim(),
          reason: validation.reason,
        });
        continue;
      }
      out.push({
        accountId,
        displayName: validation.displayName,
        observedAt: payload.observedAt || payload.observed_at,
        source: payload.sourceLabel || payload.source,
      });
    }
  }

  const dedup = new Map();
  for (const entry of out) {
    const key = `${entry.accountId}|${entry.displayName}`;
    if (!dedup.has(key)) dedup.set(key, entry);
  }
  return {
    entries: [...dedup.values()],
    rejected,
  };
}

export { normalizeDisplayNameEntries };
