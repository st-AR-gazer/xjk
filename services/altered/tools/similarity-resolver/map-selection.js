import { normalizeMapUidList } from "./run-state.js";

const DEFAULT_MAP_LIMIT = 500000;

function selectionLimit(maxMaps) {
  const requested = Number(maxMaps || 0);
  return requested > 0 ? requested : DEFAULT_MAP_LIMIT;
}

function loadSelectedMapUids(repository, { mapUidsFromFile = null, maxMaps = 0 } = {}) {
  const limit = selectionLimit(maxMaps);
  if (mapUidsFromFile !== null) {
    return normalizeMapUidList(mapUidsFromFile).slice(0, limit);
  }

  const rows = repository.db
    .prepare(
      `
      SELECT map_uid AS mapUid
      FROM altered_maps
      ORDER BY map_uid ASC
      LIMIT ?
      `
    )
    .all(limit);
  return normalizeMapUidList(rows.map((row) => row.mapUid));
}

function remainingMapUids(selectedMapUids, startOffset) {
  return selectedMapUids.slice(Math.max(0, Number(startOffset) || 0));
}

export { loadSelectedMapUids, remainingMapUids, selectionLimit };
