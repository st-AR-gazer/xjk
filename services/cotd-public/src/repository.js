import { getFetchState, getStorageSummary, setFetchState } from "./repository/fetchStateRepository.js";
import { getMapFile, listMapFileDownloadCandidates, upsertMapFile } from "./repository/mapFileRepository.js";
import { createCotdDatabase } from "./repository/schema.js";
import {
  getLatest,
  getLatestStoredSnapshot,
  getSnapshotByDateAndUid,
  listHistory,
  rowToSnapshot,
  upsertSnapshot,
} from "./repository/snapshotRepository.js";
import { listMapInfosByUids, listTotdMaps, upsertMapInfos, upsertTotdDays } from "./repository/totdRepository.js";

class CotdRepository {
  constructor({ dbFile = ":memory:", historyLimit = 2500, maxOffset = 1_000_000 } = {}) {
    this.dbFile = dbFile;
    this.historyLimit = Math.max(1, Math.floor(Number(historyLimit) || 2500));
    const parsedMaxOffset = Number(maxOffset);
    this.maxOffset = Number.isFinite(parsedMaxOffset)
      ? Math.max(0, Math.min(1_000_000, Math.floor(parsedMaxOffset)))
      : 1_000_000;
    this.db = createCotdDatabase(this.dbFile);
  }

  rowToSnapshot(row) {
    return rowToSnapshot(row);
  }

  getLatest() {
    return getLatest(this);
  }

  getLatestStoredSnapshot() {
    return getLatestStoredSnapshot(this);
  }

  listTotdMaps(options) {
    return listTotdMaps(this, options);
  }

  listHistory(options) {
    return listHistory(this, options);
  }

  upsertSnapshot(snapshot) {
    return upsertSnapshot(this, snapshot);
  }

  getSnapshotByDateAndUid(cotdDate, mapUid) {
    return getSnapshotByDateAndUid(this, cotdDate, mapUid);
  }

  upsertTotdDays(days) {
    return upsertTotdDays(this, days);
  }

  upsertMapInfos(mapInfos) {
    return upsertMapInfos(this, mapInfos);
  }

  listMapInfosByUids(mapUids) {
    return listMapInfosByUids(this, mapUids);
  }

  listMapFileDownloadCandidates(options) {
    return listMapFileDownloadCandidates(this, options);
  }

  upsertMapFile(input) {
    return upsertMapFile(this, input);
  }

  getMapFile(mapUid) {
    return getMapFile(this, mapUid);
  }

  getFetchState() {
    return getFetchState(this);
  }

  setFetchState(fetchState) {
    return setFetchState(this, fetchState);
  }

  getStorageSummary() {
    return getStorageSummary(this);
  }

  close() {
    this.db.close();
  }
}

export { CotdRepository };
