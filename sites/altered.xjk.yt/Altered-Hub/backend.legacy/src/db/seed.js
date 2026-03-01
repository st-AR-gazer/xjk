const CLUB_ID = 558282;

const CAMPAIGN_SEED = [
  {
    name: "Spring 2026",
    start: "2026-02-01T00:00:00Z",
    end: "2026-03-01T00:00:00Z",
    published: 1,
  },
  {
    name: "Winter 2026",
    start: "2026-01-01T00:00:00Z",
    end: "2026-02-01T00:00:00Z",
    published: 1,
  },
  {
    name: "Legacy Altered",
    start: "2025-09-01T00:00:00Z",
    end: "2025-12-01T00:00:00Z",
    published: 0,
  },
];

const MAP_SEED = [
  ["AN-S26-01-FLIPWAY", "Flipway Nexus", "Spring 2026", 1, 50510, 56000, 62000, 70000, 48743, "Xephi", "2026-02-22T19:46:00Z", 1, "live"],
  ["AN-S26-02-VOIDRUN", "Voidrun District", "Spring 2026", 2, 53420, 59000, 65000, 72000, 51166, "Nyota", "2026-02-22T19:20:00Z", 1, "live"],
  ["AN-S26-03-PRISM", "Prism Intake", "Spring 2026", 3, 56980, 62000, 68000, 75000, 54881, "Sphynx", "2026-02-22T18:34:00Z", 1, "live"],
  ["AN-S26-04-METRO", "Metro Fracture", "Spring 2026", 4, 60140, 65000, 71000, 78000, 58255, "Ari", "2026-02-22T17:58:00Z", 1, "live"],
  ["AN-S26-05-RIFT", "Rift Assembly", "Spring 2026", 5, 61820, 67000, 73000, 80000, 60071, "Kizaru", "2026-02-22T16:53:00Z", 1, "live"],
  ["AN-W26-01-RADIANT", "Radiant Dock", "Winter 2026", 1, 49630, 55000, 61000, 69000, 47934, "Lynx", "2026-02-21T20:42:00Z", 1, "live"],
  ["AN-W26-02-LOAM", "Loam Reactor", "Winter 2026", 2, 55370, 61000, 67000, 74000, 53580, "Toki", "2026-02-21T19:05:00Z", 1, "live"],
  ["AN-W26-03-SHARD", "Shard Harbor", "Winter 2026", 3, 58880, 64000, 70000, 77000, 57114, "Kov", "2026-02-21T18:17:00Z", 1, "live"],
  ["AN-W26-04-LOFT", "Loft Interchange", "Winter 2026", 4, 61220, 66500, 72500, 79000, 59306, "Mira", "2026-02-21T16:28:00Z", 0, "paused"],
  ["AN-LG-01-SPINE", "Spine Crossing", "Legacy Altered", 1, 54720, 60500, 66500, 73000, 52894, "Polaris", "2026-02-20T21:22:00Z", 1, "live"],
  ["AN-LG-02-QUARRY", "Quarry Lift", "Legacy Altered", 2, 58390, 64000, 70000, 76000, 56682, "Sora", "2026-02-20T19:11:00Z", 1, "live"],
  ["AN-LG-03-SILO", "Silo Lattice", "Legacy Altered", 3, 62500, 68000, 74000, 81000, 60831, "Nova", "2026-02-19T14:49:00Z", 0, "archived"],
  ["AN-LG-04-SPARK", "Spark Layer", "Legacy Altered", 4, 66740, 71500, 77500, 84000, 64895, "Haku", "2026-02-19T12:03:00Z", 0, "archived"],
  ["AN-LG-05-CASTLE", "Castle Relay", "Legacy Altered", 5, 69450, 74000, 80000, 87000, 67886, "Valk", "2026-02-18T22:11:00Z", 1, "live"],
];

function seedDatabase(db) {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM maps").get();
  if ((countRow?.count || 0) > 0) return false;

  try {
    db.exec("BEGIN");
    db.prepare(
      `
      INSERT OR REPLACE INTO clubs (
        club_id, name, description, author_account_id, icon_url, decal_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      CLUB_ID,
      "Altered Nadeo Club",
      "Main club used by altered tracking automation.",
      "u-ops-admin",
      "",
      "",
      "2025-12-01T00:00:00Z",
      new Date().toISOString()
    );

    const insertCampaign = db.prepare(
      `
      INSERT OR IGNORE INTO campaigns (
        name, start_timestamp, end_timestamp, club_id, leaderboard_group_uid, published, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    for (const campaign of CAMPAIGN_SEED) {
      insertCampaign.run(
        campaign.name,
        campaign.start,
        campaign.end,
        CLUB_ID,
        `grp-${campaign.name.replace(/\s+/g, "-").toLowerCase()}`,
        campaign.published,
        campaign.start,
        new Date().toISOString()
      );
    }

    const campaignRows = db
      .prepare("SELECT campaign_id, name FROM campaigns WHERE club_id = ?")
      .all(CLUB_ID);
    const campaignIdByName = new Map(campaignRows.map((row) => [row.name, row.campaign_id]));

    const insertMap = db.prepare(
      `
      INSERT INTO maps (
        map_uid, map_id, name, author, submitter,
        author_time, gold_time, silver_time, bronze_time, nb_laps,
        thumbnail_url, download_url, created_at, updated_at, added_to_bot_at,
        check_frequency, last_checked_at, wr_account_id, wr_display_name, wr_time, wr_updated_at,
        is_tracked, tracking_status
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
      `
    );

    const insertMapCampaign = db.prepare(
      `
      INSERT INTO map_campaigns (map_uid, campaign_id, slot, created_at)
      VALUES (?, ?, ?, ?)
      `
    );

    const insertWr = db.prepare(
      `
      INSERT INTO wr_history (
        map_uid, account_id, display_name, record_time, medal, replay_url, replay_local_path,
        timestamp, removed, zone_id, zone_name, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    const insertLb = db.prepare(
      `
      INSERT INTO leaderboards (
        map_uid, account_id, display_name, score, ranking, timestamp, zone_id, zone_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    for (const item of MAP_SEED) {
      const [
        uid,
        name,
        campaignName,
        slot,
        authorMs,
        goldMs,
        silverMs,
        bronzeMs,
        wrMs,
        holder,
        wrAt,
        tracked,
        status,
      ] = item;
      const campaignId = campaignIdByName.get(campaignName);
      const accountId = `acc-${holder.toLowerCase()}`;

      insertMap.run(
        uid,
        `map-${uid.toLowerCase()}`,
        name,
        "AlteredMapper",
        "AlteredOps",
        authorMs,
        goldMs,
        silverMs,
        bronzeMs,
        1,
        "",
        "",
        wrAt,
        wrAt,
        wrAt,
        21600,
        wrAt,
        accountId,
        holder,
        wrMs,
        wrAt,
        tracked,
        status
      );

      if (campaignId) {
        insertMapCampaign.run(uid, campaignId, slot, wrAt);
      }

      insertWr.run(
        uid,
        accountId,
        holder,
        wrMs,
        1,
        "",
        "",
        wrAt,
        0,
        "world",
        "World",
        1
      );
      insertLb.run(uid, accountId, holder, wrMs, 1, wrAt, "world", "World");
    }

    db.prepare(
      `
      INSERT OR IGNORE INTO guilds (guild_id, token, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      `
    ).run("local-dev-guild", "local-token", new Date().toISOString(), new Date().toISOString());

    db.prepare(
      `
      INSERT OR IGNORE INTO trackers (tracker_id, name, discord_channel, guild_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(1, "altered-main", "ops-tracker-feed", "local-dev-guild", new Date().toISOString(), new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
  return true;
}

export { seedDatabase };
