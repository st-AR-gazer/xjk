import { runDisplayNamePersistenceOperation } from "./displayNamePersistenceError.js";

class DisplayNameCandidateEvidenceRepository {
  constructor(db) {
    this.db = db;
  }

  loadCandidateEvidence() {
    return runDisplayNamePersistenceOperation("load-display-name-candidate-evidence", () => ({
      accounts: this.db
        .prepare(
          `
          SELECT
            a.account_id AS accountId,
            a.last_seen_at AS accountLastSeenAt,
            c.display_name AS displayName,
            c.observed_at AS observedAt
          FROM accounts a
          LEFT JOIN account_display_name_current c ON c.account_id = a.account_id
          `
        )
        .all(),
      clubMembers: this.db
        .prepare(
          `
          SELECT account_id AS accountId, last_synced_at AS seenAt
          FROM club_members
          ORDER BY last_synced_at DESC
          LIMIT 8000
          `
        )
        .all(),
      clubCampaignAuthors: this.db
        .prepare(
          `
          SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
          FROM club_campaign_maps
          WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
          ORDER BY last_synced_at DESC
          LIMIT 12000
          `
        )
        .all(),
      clubUploadAuthors: this.db
        .prepare(
          `
          SELECT author_account_id AS accountId, players_total AS playersTotal, last_synced_at AS seenAt
          FROM club_upload_maps
          WHERE NULLIF(TRIM(COALESCE(author_account_id, '')), '') IS NOT NULL
          ORDER BY last_synced_at DESC
          LIMIT 12000
          `
        )
        .all(),
      projectWrHolders: this.db
        .prepare(
          `
          SELECT wr_holder AS accountId, latest_checked_at AS seenAt
          FROM project_maps
          WHERE NULLIF(TRIM(COALESCE(wr_holder, '')), '') IS NOT NULL
          ORDER BY latest_checked_at DESC
          LIMIT 12000
          `
        )
        .all(),
      oldMapEventHolders: this.db
        .prepare(
          `
          SELECT old_holder AS accountId, checked_at AS seenAt
          FROM map_events
          WHERE NULLIF(TRIM(COALESCE(old_holder, '')), '') IS NOT NULL
          ORDER BY checked_at DESC
          LIMIT 12000
          `
        )
        .all(),
      newMapEventHolders: this.db
        .prepare(
          `
          SELECT new_holder AS accountId, checked_at AS seenAt
          FROM map_events
          WHERE NULLIF(TRIM(COALESCE(new_holder, '')), '') IS NOT NULL
          ORDER BY checked_at DESC
          LIMIT 12000
          `
        )
        .all(),
    }));
  }
}

export { DisplayNameCandidateEvidenceRepository };
