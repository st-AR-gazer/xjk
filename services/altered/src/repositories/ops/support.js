import { parseJsonSafe, toIso, toNullableIso, toText } from "../../../../shared/valueUtils.js";

function addHours(isoString, hours) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(date.getUTCHours() + Math.max(1, Number(hours) || 1));
  return date.toISOString();
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function serializeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function normalizeCommandStatus(value, fallback = "queued") {
  const status = toText(value).toLowerCase();
  if (["queued", "sent", "failed", "cancelled"].includes(status)) return status;
  return fallback;
}

function rowToDiscordCommand(row) {
  return {
    commandId: Number(row.commandId || 0),
    status: normalizeCommandStatus(row.status),
    commandType: toText(row.commandType),
    payload: parseJsonSafe(row.payloadJson, {}),
    source: toText(row.source),
    createdAt: toIso(row.createdAt),
    processedAt: toNullableIso(row.processedAt),
    error: toText(row.error) || null,
  };
}

export { addHours, boolToInt, normalizeCommandStatus, rowToDiscordCommand, serializeJson };
