const EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL = `
  AND NOT (
    LOWER(COALESCE(json_extract(c.payload_json, '$.sourceKey'), json_extract(c.payload_json, '$.source_key'), '')) = 'weekly-shorts'
    AND COALESCE(
      json_extract(c.payload_json, '$.weeklyShorts.isCanonicalNadeoWeek'),
      json_extract(c.payload_json, '$.weekly_shorts.isCanonicalNadeoWeek'),
      0
    ) = 0
  )
`;

function mapStatusWhereClause(status) {
  if (status === "active") return "(m.tracked = 1 AND LOWER(COALESCE(m.status, 'live')) != 'paused')";
  if (status === "paused") return "(LOWER(COALESCE(m.status, '')) = 'paused')";
  if (status === "idle") return "(m.tracked = 0)";
  return "";
}

function mapWrStateWhereClause(state) {
  if (state === "with_wr") return "(COALESCE(m.wr_ms, 0) > 0)";
  if (state === "without_wr") return "(COALESCE(m.wr_ms, 0) <= 0)";
  return "";
}

export { EXCLUDE_NONCANONICAL_WEEKLY_SHORTS_SQL, mapStatusWhereClause, mapWrStateWhereClause };
