import assert from "node:assert/strict";
import test from "node:test";
import { loadCampaignMapDetails } from "../src/services/altered/projectSource/curatedSourceSyncService.js";

test("loadCampaignMapDetails deduplicates campaign playlists and indexes returned details", async () => {
  const requests = [];
  const result = await loadCampaignMapDetails(
    [
      { campaign: { playlist: [{ mapUid: " A " }, { mapUid: "b" }] } },
      { campaign: { playlist: [{ mapUid: "a" }, { mapUid: "" }] } },
    ],
    {
      async getCoreMapsByUidList(mapUids) {
        requests.push(mapUids);
        return [{ mapUid: "A", name: "First" }, { uid: "B", name: "Second" }, { name: "missing uid" }];
      },
    }
  );

  assert.deepEqual(requests, [["A", "b"]]);
  assert.deepEqual(result.mapUids, ["A", "b"]);
  assert.equal(result.mapDetailsByUid.get("a").name, "First");
  assert.equal(result.mapDetailsByUid.get("b").name, "Second");
});
