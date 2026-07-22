import { firstMapValue } from "./formatters.js?v=2";

export function numberMapValue(map, keys = []) {
  return Number(firstMapValue(map, keys, 0) || 0);
}

export function getMapUidValue(map) {
  return String(firstMapValue(map, ["map_uid", "mapUid", "uid"], "") || "").trim();
}

export function getMapNumberLabel(map) {
  const direct = firstMapValue(map, ["map_number", "mapNumber"], "");
  if (direct) return direct;
  const mapnumber = firstMapValue(map, ["mapnumber"], []);
  if (Array.isArray(mapnumber) && mapnumber.length) return mapnumber.join(".");
  const slot = firstMapValue(map, ["slot"], "");
  if (slot) return slot;
  return "\u2014";
}

export function getChangeCountValue(map) {
  const direct = firstMapValue(map, ["change_count", "changeCount"], "");
  if (direct !== "") return direct;
  const wrHistory = firstMapValue(map, ["wrHistory"], []);
  return Array.isArray(wrHistory) ? wrHistory.length : 0;
}

export function trackingStatusClass(status) {
  const value = String(status || "idle");
  if (value === "active" || value === "live") return "active";
  if (value === "paused") return "paused";
  return "idle";
}
