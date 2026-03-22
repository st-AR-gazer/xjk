import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

function readArg(name, fallback = "") {
  const key = `--${name}=`;
  const found = process.argv.find((arg) => String(arg).startsWith(key));
  if (!found) return fallback;
  return String(found).slice(key.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeAccountId(value) {
  const accountId = String(value || "").trim().toLowerCase();
  if (!accountId) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId)) {
    return accountId;
  }
  return "";
}

function toIso(value, fallbackIso) {
  const raw = String(value || "").trim();
  if (!raw) return fallbackIso;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return fallbackIso;
  return dt.toISOString();
}

function normalizeProjectKey(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function main() {
  const defaultRoot = "C:\\srv\\xjk\\sites\\altered.xjk.yt\\data";
  const alteredDbPath = readArg("altered-db", `${defaultRoot}\\altered-service.sqlite`);
  const aggregatorDbPath = readArg("aggregator-db", `${defaultRoot}\\tracker-aggregator.sqlite`);
  const projectKey = normalizeProjectKey(
    readArg("project-key", "altered-mapper-displayname"),
    "altered-mapper-displayname"
  );
  const projectName = String(
    readArg("project-name", "Altered Mapper Displayname")
  ).trim() || "Altered Mapper Displayname";
  const sourceLabel = String(readArg("source", "backfill-mapper-cache")).trim() || "backfill-mapper-cache";
  const dryRun = hasFlag("dry-run");

  if (!fs.existsSync(alteredDbPath)) {
    throw new Error(`Altered DB not found: ${alteredDbPath}`);
  }
  if (!fs.existsSync(aggregatorDbPath)) {
    throw new Error(`Aggregator DB not found: ${aggregatorDbPath}`);
  }

  const alteredDb = new DatabaseSync(alteredDbPath, { open: true, readOnly: true });
  const aggregatorDb = new DatabaseSync(aggregatorDbPath, { open: true });
  const nowIso = new Date().toISOString();

  const rows = alteredDb
    .prepare(
      `
      SELECT
        account_id AS accountId,
        latest_display_name AS displayName,
        COALESCE(last_resolved_at, updated_at, created_at) AS observedAt
      FROM altered_mapper_accounts
      WHERE account_id IS NOT NULL
        AND TRIM(account_id) <> ''
        AND latest_display_name IS NOT NULL
        AND TRIM(latest_display_name) <> ''
        AND LOWER(TRIM(latest_display_name)) <> LOWER(TRIM(account_id))
      ORDER BY COALESCE(last_resolved_at, updated_at, created_at, '') ASC
      `
    )
    .all();

  const candidates = rows
    .map((row) => {
      const accountId = normalizeAccountId(row?.accountId);
      const displayName = String(row?.displayName || "").trim();
      if (!accountId || !displayName) return null;
      if (normalizeAccountId(displayName) === accountId) return null;
      return {
        accountId,
        displayName,
        observedAt: toIso(row?.observedAt, nowIso),
      };
    })
    .filter(Boolean);

  const uniqueByAccount = new Map();
  for (const row of candidates) {
    uniqueByAccount.set(row.accountId, row);
  }
  const entries = [...uniqueByAccount.values()];

  const beforeAccounts = Number(
    aggregatorDb.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count || 0
  );
  const beforeCurrent = Number(
    aggregatorDb.prepare("SELECT COUNT(*) AS count FROM account_display_name_current").get()?.count || 0
  );
  const beforeHistory = Number(
    aggregatorDb.prepare("SELECT COUNT(*) AS count FROM account_display_name_history").get()?.count || 0
  );

  const upsertProject = aggregatorDb.prepare(
    `
    INSERT INTO projects (
      project_key, display_name, source_label, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_key) DO UPDATE SET
      display_name = excluded.display_name,
      source_label = COALESCE(excluded.source_label, projects.source_label),
      last_seen_at = excluded.last_seen_at
    `
  );

  const upsertAccount = aggregatorDb.prepare(
    `
    INSERT INTO accounts (
      account_id, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
    `
  );

  const getCurrent = aggregatorDb.prepare(
    `
    SELECT display_name AS displayName
    FROM account_display_name_current
    WHERE account_id = ?
    LIMIT 1
    `
  );

  const upsertCurrent = aggregatorDb.prepare(
    `
    INSERT INTO account_display_name_current (
      account_id, display_name, source, observed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      display_name = excluded.display_name,
      source = COALESCE(excluded.source, account_display_name_current.source),
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at
    `
  );

  const closeHistory = aggregatorDb.prepare(
    `
    UPDATE account_display_name_history
    SET valid_to = ?
    WHERE account_id = ? AND valid_to IS NULL
    `
  );

  const insertHistory = aggregatorDb.prepare(
    `
    INSERT OR IGNORE INTO account_display_name_history (
      account_id, display_name, source, valid_from, valid_to, observed_at
    ) VALUES (?, ?, ?, ?, NULL, ?)
    `
  );

  const insertEvent = aggregatorDb.prepare(
    `
    INSERT INTO aggregator_events (
      project_key, occurred_at, event_type, detail_1, detail_2, detail_3, source_label, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  let accepted = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  try {
    if (!dryRun) {
      aggregatorDb.exec("BEGIN");
      upsertProject.run(projectKey, projectName, sourceLabel, nowIso, nowIso);
    }

    for (const row of entries) {
      const accountId = row.accountId;
      const displayName = row.displayName;
      const observedAt = row.observedAt;

      if (!dryRun) {
        upsertAccount.run(accountId, observedAt, observedAt);
      }

      const current = getCurrent.get(accountId);
      if (!current) {
        if (!dryRun) {
          upsertCurrent.run(accountId, displayName, sourceLabel, observedAt, nowIso);
          insertHistory.run(accountId, displayName, sourceLabel, observedAt, observedAt);
        }
        accepted += 1;
        inserted += 1;
      } else if (String(current.displayName || "") !== displayName) {
        if (!dryRun) {
          closeHistory.run(observedAt, accountId);
          insertHistory.run(accountId, displayName, sourceLabel, observedAt, observedAt);
          upsertCurrent.run(accountId, displayName, sourceLabel, observedAt, nowIso);
        }
        accepted += 1;
        updated += 1;
      } else {
        if (!dryRun) {
          upsertCurrent.run(accountId, displayName, sourceLabel, observedAt, nowIso);
        }
        accepted += 1;
        unchanged += 1;
      }
    }

    if (!dryRun) {
      insertEvent.run(
        projectKey,
        nowIso,
        "displayname.sync",
        `accepted: ${accepted}`,
        `inserted: ${inserted}, updated: ${updated}`,
        `unchanged: ${unchanged}`,
        sourceLabel,
        JSON.stringify({
          accepted,
          inserted,
          updated,
          unchanged,
          mode: "backfill",
        })
      );
      aggregatorDb.exec("COMMIT");
    }
  } catch (error) {
    if (!dryRun) {
      try {
        aggregatorDb.exec("ROLLBACK");
      } catch {}
    }
    throw error;
  } finally {
    alteredDb.close();
    aggregatorDb.close();
  }

  const verifyDb = new DatabaseSync(aggregatorDbPath, { open: true, readOnly: true });
  const afterAccounts = Number(
    verifyDb.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count || 0
  );
  const afterCurrent = Number(
    verifyDb.prepare("SELECT COUNT(*) AS count FROM account_display_name_current").get()?.count || 0
  );
  const afterHistory = Number(
    verifyDb.prepare("SELECT COUNT(*) AS count FROM account_display_name_history").get()?.count || 0
  );
  verifyDb.close();

  console.log(
    JSON.stringify(
      {
        dryRun,
        alteredDbPath,
        aggregatorDbPath,
        projectKey,
        candidates: entries.length,
        accepted,
        inserted,
        updated,
        unchanged,
        before: {
          accounts: beforeAccounts,
          current: beforeCurrent,
          history: beforeHistory,
        },
        after: {
          accounts: afterAccounts,
          current: afterCurrent,
          history: afterHistory,
        },
        delta: {
          accounts: afterAccounts - beforeAccounts,
          current: afterCurrent - beforeCurrent,
          history: afterHistory - beforeHistory,
        },
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(String(error?.message || error || "Unknown backfill error"));
  process.exitCode = 1;
}
