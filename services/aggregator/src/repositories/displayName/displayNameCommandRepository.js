import { normalizeDisplayNameQuery } from "../../../../shared/displayNameResolution.js";
import { normalizeAccountId, toIso } from "../../../../shared/valueUtils.js";
import { normalizeDisplayNameEntries } from "../support/displayNameEntries.js";
import { normalizeMaybeString, normalizeProjectKey } from "../support/repositoryValues.js";
import { runDisplayNameTransaction } from "./displayNamePersistenceError.js";

function assertEventsRepository(eventsRepository) {
  if (
    typeof eventsRepository?.upsertProjectSeen !== "function" ||
    typeof eventsRepository?.appendAggregatorEvent !== "function"
  ) {
    throw new TypeError("DisplayNameCommandRepository requires an event repository.");
  }
}

class DisplayNameCommandRepository {
  constructor(db, { eventsRepository } = {}) {
    this.db = db;
    this.eventsRepository = eventsRepository;
  }

  backfillNormalizedDisplayNames() {
    return runDisplayNameTransaction(this.db, "backfill-normalized-display-names", () => {
      const unnormalizedCurrent = this.db
        .prepare(
          "SELECT account_id, display_name FROM account_display_name_current WHERE normalized_display_name IS NULL LIMIT 20000"
        )
        .all();
      const updateCurrent = this.db.prepare(
        "UPDATE account_display_name_current SET normalized_display_name = ? WHERE account_id = ?"
      );
      for (const row of unnormalizedCurrent) {
        updateCurrent.run(normalizeDisplayNameQuery(row.display_name), row.account_id);
      }

      const unnormalizedHistory = this.db
        .prepare(
          "SELECT id, display_name FROM account_display_name_history WHERE normalized_display_name IS NULL LIMIT 20000"
        )
        .all();
      const updateHistory = this.db.prepare(
        "UPDATE account_display_name_history SET normalized_display_name = ? WHERE id = ?"
      );
      for (const row of unnormalizedHistory) {
        updateHistory.run(normalizeDisplayNameQuery(row.display_name), row.id);
      }

      return unnormalizedCurrent.length > 0 || unnormalizedHistory.length > 0;
    });
  }

  ingestDisplayNames(payload = {}) {
    const receivedAt = new Date().toISOString();
    const projectKey = normalizeProjectKey(payload.projectKey || payload.project?.key);
    const projectName = String(
      payload.projectName || payload.project?.name || projectKey || "display-name-tracker"
    ).trim();
    const sourceLabel = normalizeMaybeString(payload.sourceLabel || payload.source || payload.project?.sourceLabel);
    const { entries, rejected } = normalizeDisplayNameEntries(payload);
    if (!entries.length) {
      return {
        error: "No valid display-name entries provided.",
        rejected,
        rejectedCount: rejected.length,
      };
    }

    assertEventsRepository(this.eventsRepository);
    const result = runDisplayNameTransaction(this.db, "ingest-display-names", () => {
      let accepted = 0;
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;

      if (projectKey) {
        this.eventsRepository.upsertProjectSeen(projectKey, projectName, sourceLabel, receivedAt);
      }

      const upsertAccount = this.db.prepare(
        `
        INSERT INTO accounts (
          account_id, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          last_seen_at = excluded.last_seen_at
        `
      );
      const getCurrent = this.db.prepare(
        `
        SELECT
          display_name AS displayName,
          observed_at AS observedAt
        FROM account_display_name_current
        WHERE account_id = ?
        LIMIT 1
        `
      );
      const upsertCurrent = this.db.prepare(
        `
        INSERT INTO account_display_name_current (
          account_id, display_name, normalized_display_name, source, observed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = excluded.display_name,
          normalized_display_name = excluded.normalized_display_name,
          source = COALESCE(excluded.source, account_display_name_current.source),
          observed_at = excluded.observed_at,
          updated_at = excluded.updated_at
        `
      );
      const closeHistory = this.db.prepare(
        `
        UPDATE account_display_name_history
        SET valid_to = ?
        WHERE account_id = ? AND valid_to IS NULL
        `
      );
      const insertHistory = this.db.prepare(
        `
        INSERT OR IGNORE INTO account_display_name_history (
          account_id, display_name, normalized_display_name, source, valid_from, valid_to, observed_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)
        `
      );
      const insertCheckedEvent = this.db.prepare(
        `
        INSERT INTO aggregator_events (
          project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const entry of entries) {
        const accountId = normalizeAccountId(entry.accountId);
        const displayName = String(entry.displayName || "").trim();
        if (!accountId || !displayName) continue;

        const observedAt = toIso(entry.observedAt, receivedAt);
        const source = normalizeMaybeString(entry.source || sourceLabel);
        upsertAccount.run(accountId, observedAt, observedAt);
        const current = getCurrent.get(accountId);
        const previousDisplayName = String(current?.displayName || "").trim() || null;
        let changeMarker = "no";
        let changeType = "none";

        if (!current) {
          upsertCurrent.run(
            accountId,
            displayName,
            normalizeDisplayNameQuery(displayName),
            source,
            observedAt,
            receivedAt
          );
          insertHistory.run(
            accountId,
            displayName,
            normalizeDisplayNameQuery(displayName),
            source,
            observedAt,
            observedAt
          );
          inserted += 1;
          changeMarker = "*";
          changeType = "new";
        } else if (String(current.displayName || "") !== displayName) {
          closeHistory.run(observedAt, accountId);
          insertHistory.run(
            accountId,
            displayName,
            normalizeDisplayNameQuery(displayName),
            source,
            observedAt,
            observedAt
          );
          upsertCurrent.run(
            accountId,
            displayName,
            normalizeDisplayNameQuery(displayName),
            source,
            observedAt,
            receivedAt
          );
          updated += 1;
          changeMarker = "yes";
          changeType = "changed";
        } else {
          upsertCurrent.run(
            accountId,
            displayName,
            normalizeDisplayNameQuery(displayName),
            source,
            observedAt,
            receivedAt
          );
          unchanged += 1;
        }
        accepted += 1;

        insertCheckedEvent.run(
          projectKey || null,
          observedAt,
          "displayname.checked",
          displayName,
          accountId,
          `change:${changeMarker}`,
          source,
          JSON.stringify({
            accountId,
            displayName,
            previousDisplayName,
            changed: changeMarker !== "no",
            change: changeType,
            observedAt,
          })
        );
      }

      this.eventsRepository.appendAggregatorEvent({
        projectKey,
        projectName,
        sourceLabel,
        occurredAt: receivedAt,
        eventType: "displayname.sync",
        detail1: `accepted: ${accepted}`,
        detail2: `inserted: ${inserted}, updated: ${updated}`,
        detail3: `unchanged: ${unchanged}`,
        payload: { accepted, inserted, updated, unchanged },
      });

      return { accepted, inserted, updated, unchanged };
    });

    return {
      projectKey: projectKey || null,
      sourceLabel,
      ...result,
      receivedAt,
      rejected,
      rejectedCount: rejected.length,
    };
  }
}

export { DisplayNameCommandRepository };
