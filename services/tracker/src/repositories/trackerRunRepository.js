class TrackerRunRepository {
  constructor(db) {
    this.db = db;
  }

  recordTrackerRun({
    startedAt,
    finishedAt,
    mapsConsidered = 0,
    mapsChecked = 0,
    wrChanges = 0,
    provider = "unknown",
    note = "",
    checks = [],
  }) {
    const txStarted = startedAt || new Date().toISOString();
    const txFinished = finishedAt || new Date().toISOString();
    let runId = 0;
    try {
      this.db.exec("BEGIN");
      const runResult = this.db
        .prepare(
          `
          INSERT INTO tracker_runs (
            started_at, finished_at, maps_considered, maps_checked, wr_changes, provider, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          txStarted,
          txFinished,
          Math.max(0, Number(mapsConsidered) || 0),
          Math.max(0, Number(mapsChecked) || 0),
          Math.max(0, Number(wrChanges) || 0),
          String(provider || "unknown"),
          String(note || "")
        );
      runId = Number(runResult.lastInsertRowid || 0);

      const insertCheck = this.db.prepare(
        `
        INSERT INTO tracker_map_checks (
          run_id, map_uid, checked_at, changed,
          old_wr_time, new_wr_time, old_holder, new_holder, source, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const item of checks) {
        insertCheck.run(
          runId || null,
          item.mapUid,
          item.checkedAt || txFinished,
          item.changed ? 1 : 0,
          Number(item.oldWrTime || 0),
          Number(item.newWrTime || 0),
          String(item.oldHolder || ""),
          String(item.newHolder || ""),
          String(item.source || ""),
          String(item.note || "")
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {}
      throw error;
    }

    return {
      runId,
      startedAt: txStarted,
      finishedAt: txFinished,
      mapsConsidered: Math.max(0, Number(mapsConsidered) || 0),
      mapsChecked: Math.max(0, Number(mapsChecked) || 0),
      wrChanges: Math.max(0, Number(wrChanges) || 0),
      provider: String(provider || "unknown"),
      note: String(note || ""),
    };
  }

  getLatestTrackerRun() {
    const row = this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          maps_considered AS mapsConsidered,
          maps_checked AS mapsChecked,
          wr_changes AS wrChanges,
          provider AS provider,
          note AS note
        FROM tracker_runs
        ORDER BY run_id DESC
        LIMIT 1
        `
      )
      .get();

    if (!row) return null;
    return {
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      mapsConsidered: Number(row.mapsConsidered || 0),
      mapsChecked: Number(row.mapsChecked || 0),
      wrChanges: Number(row.wrChanges || 0),
      provider: row.provider || "unknown",
      note: row.note || "",
    };
  }

  getTrackerRuns(limit = 30) {
    const rows = this.db
      .prepare(
        `
        SELECT
          run_id AS runId,
          started_at AS startedAt,
          finished_at AS finishedAt,
          maps_considered AS mapsConsidered,
          maps_checked AS mapsChecked,
          wr_changes AS wrChanges,
          provider AS provider,
          note AS note
        FROM tracker_runs
        ORDER BY run_id DESC
        LIMIT ?
        `
      )
      .all(Math.max(1, Math.min(Number(limit) || 30, 300)));

    return rows.map((row) => ({
      runId: Number(row.runId || 0),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      mapsConsidered: Number(row.mapsConsidered || 0),
      mapsChecked: Number(row.mapsChecked || 0),
      wrChanges: Number(row.wrChanges || 0),
      provider: row.provider || "unknown",
      note: row.note || "",
    }));
  }
}

export { TrackerRunRepository };
