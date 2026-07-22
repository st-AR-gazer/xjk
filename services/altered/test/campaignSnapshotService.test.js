import assert from "node:assert/strict";
import test from "node:test";
import { buildPausedPlaylistMap } from "../src/services/altered/projectSource/campaignSnapshotService.js";

test("buildPausedPlaylistMap applies the shared catalog-map contract", () => {
  const map = buildPausedPlaylistMap({
    mapUid: " UID ",
    index: 0,
    slotValue: 4,
    mapDetailsByUid: new Map([
      ["uid", { name: "Name", fileUrl: "download", thumbnail_url: "thumbnail", author: "author" }],
    ]),
    sourceKey: "source",
    sourceLabel: "Source",
    buildSourceMetadata: ({ slot, mapUid }) => ({ fixture: { slot, mapUid } }),
  });

  assert.deepEqual(map, {
    name: "Name",
    fileUrl: "download",
    thumbnail_url: "thumbnail",
    author: "author",
    uid: "UID",
    mapUid: "UID",
    downloadUrl: "download",
    thumbnailUrl: "thumbnail",
    tracked: false,
    status: "paused",
    slot: 4,
    position: 4,
    raw: {
      name: "Name",
      fileUrl: "download",
      thumbnail_url: "thumbnail",
      author: "author",
      fixture: { slot: 4, mapUid: "UID" },
      sourceKey: "source",
      sourceLabel: "Source",
    },
  });
  assert.equal(
    buildPausedPlaylistMap({
      mapUid: "",
      index: 0,
      mapDetailsByUid: new Map(),
      buildSourceMetadata: () => ({}),
    }),
    null
  );
});
