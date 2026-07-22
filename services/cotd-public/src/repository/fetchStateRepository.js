import { parseJsonSafe } from "../../../shared/valueUtils.js";
import { utcNowIso } from "./mappers.js";

function getFetchState(repository) {
  const row = repository.db.prepare("SELECT value_json FROM service_state WHERE key = ? LIMIT 1").get("fetchState");
  return parseJsonSafe(row?.value_json, null);
}

function setFetchState(repository, fetchState) {
  repository.db
    .prepare(
      `INSERT INTO service_state (key, value_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .run("fetchState", JSON.stringify(fetchState || null), utcNowIso());
  return fetchState || null;
}

function getStorageSummary(repository) {
  const count = (sql) => Number(repository.db.prepare(sql).get()?.count || 0);
  return {
    status: "ok",
    dbFile: repository.dbFile,
    latestStored: Boolean(repository.getLatest()),
    historyCount: count("SELECT COUNT(*) AS count FROM style_snapshots"),
    totdCount: count("SELECT COUNT(*) AS count FROM cotd_days"),
    mapInfoCount: count("SELECT COUNT(*) AS count FROM map_infos"),
    mapFileCount: count("SELECT COUNT(*) AS count FROM map_files"),
    mapFileDownloadedCount: count("SELECT COUNT(*) AS count FROM map_files WHERE status = 'downloaded'"),
  };
}

export { getFetchState, getStorageSummary, setFetchState };
