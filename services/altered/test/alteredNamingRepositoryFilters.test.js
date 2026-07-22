import assert from "node:assert/strict";
import test from "node:test";
import { buildMapSelectionFilter, buildNameCandidateFilter } from "../src/repositories/alteredNamingRepository.js";

test("buildMapSelectionFilter produces aligned SQL fragments and normalized parameters", () => {
  const filter = buildMapSelectionFilter({
    q: " Map ",
    mapUids: ["A", "a", "B"],
    clubId: "42",
    reviewState: " APPROVED ",
    campaignName: " Winter ",
    limit: 999999,
    defaultLimit: 250,
  });

  assert.equal(filter.query, "map");
  assert.equal(filter.pattern, "%map%");
  assert.deepEqual(filter.safeMapUids, ["A", "B"]);
  assert.equal(filter.safeClubId, 42);
  assert.equal(filter.campaignNamePattern, "%winter%");
  assert.match(filter.mapUidWhere, /\?, \?/);
  assert.equal(filter.reviewWhere, "AND nc.review_state = ?");
  assert.equal(filter.safeLimit, 120000);
});

test("buildNameCandidateFilter keeps list and count predicates identical", () => {
  assert.deepEqual(
    buildNameCandidateFilter({ q: " Name ", automationState: "MATCHED", reviewState: "pending", requiresRegex: false }),
    {
      where: [
        "1 = 1",
        "(LOWER(n.map_uid) LIKE ? OR LOWER(n.original_name) LIKE ? OR LOWER(COALESCE(n.proposed_name, '')) LIKE ? OR LOWER(COALESCE(n.manual_name, '')) LIKE ? OR LOWER(COALESCE(c.name, '')) LIKE ?)",
        "n.automation_state = ?",
        "n.review_state = ?",
        "n.requires_regex = ?",
      ],
      params: ["%name%", "%name%", "%name%", "%name%", "%name%", "matched", "pending", 0],
    }
  );
});
