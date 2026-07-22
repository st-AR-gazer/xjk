import { normalizeMapInput } from "./mapInput.js";

function commonMapValues(map) {
  return [
    map.mapId,
    map.mapName,
    map.author,
    map.submitter,
    map.authorTime,
    map.goldTime,
    map.silverTime,
    map.bronzeTime,
    map.laps,
    map.thumbnailUrl,
    map.downloadUrl,
  ];
}

function insertMap(statements, map) {
  statements.insertMap.run(
    map.mapUid,
    ...commonMapValues(map),
    map.now,
    map.now,
    map.tracked ? map.now : null,
    map.checkFrequency,
    map.lastCheckedAt,
    map.wrAccountId,
    map.wrHolder,
    map.wrTime,
    map.wrUpdatedAt,
    map.tracked ? 1 : 0,
    map.status
  );
}

function updateMap(statements, map) {
  statements.updateMap.run(
    ...commonMapValues(map),
    map.checkFrequency,
    map.lastCheckedAt,
    map.wrAccountId,
    map.wrHolder,
    map.wrTime,
    map.wrUpdatedAt,
    map.tracked ? 1 : 0,
    map.status,
    map.now,
    map.mapUid
  );
}

function persistMap(statements, item) {
  const mapUid = String(item?.uid || item?.mapUid || item?.map_uid || "").trim();
  if (!mapUid) return null;
  const existing = statements.selectMap.get(mapUid) || null;
  const map = normalizeMapInput(item, existing);
  if (!map) return null;
  if (existing) updateMap(statements, map);
  else insertMap(statements, map);
  return { mapUid: map.mapUid, action: existing ? "updated" : "inserted" };
}

export { persistMap };
