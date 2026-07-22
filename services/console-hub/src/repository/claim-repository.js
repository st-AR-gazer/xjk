function createClaimRepository({ db, helpers }) {
  const { nowMs } = helpers;

  function insertClaimCheck({
    accountId,
    matchUid,
    cellId = null,
    mapUid = null,
    mapId = null,
    verifiedTime = null,
    verifiedMedal = null,
    recordId = null,
    status,
    detail = "",
  }) {
    db.prepare(
      `
      INSERT INTO bingo_claim_checks (
        account_id, match_uid, cell_id, map_uid, map_id, verified_time,
        verified_medal, record_id, status, detail, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      accountId,
      matchUid,
      cellId,
      mapUid,
      mapId,
      verifiedTime,
      verifiedMedal,
      recordId,
      status,
      detail || "",
      nowMs()
    );
  }

  return { insertClaimCheck };
}

export { createClaimRepository };
