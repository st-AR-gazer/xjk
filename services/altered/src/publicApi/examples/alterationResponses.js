import { createOkResponse } from "./response.js";

const alterationResponseFactories = {
  "alterations-stats": () =>
    createOkResponse("Stats", {
      total_maps: 120,
      actively_tracked: 96,
      total_wr_changes: 340,
      total_campaigns: 15,
      total_players: 2840,
    }),
  "alterations-maps": () =>
    createOkResponse("Maps", {
      maps: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          name: "Fall 2024 - 08 Cleaned",
          season: "Fall",
          year: 2024,
          alteration: "Cleaned",
          wrMs: 54321,
          wrHolder: "Example Player",
          tracked: true,
        },
      ],
      total: 120,
      limit: 120,
      offset: 0,
    }),
  "alterations-campaigns": () =>
    createOkResponse("Campaigns", {
      campaigns: [{ campaignId: 1, name: "Fall 2024", mapCount: 25, externalId: 54321 }],
      total: 15,
      limit: 120,
      offset: 0,
    }),
  "alterations-uploads": () =>
    createOkResponse("Uploads", {
      uploads: [{ bucketId: 12, name: "Fall 2024 Uploads", mapCount: 25, discoveredAt: "2024-10-01T00:00:00.000Z" }],
      total: 8,
      limit: 120,
      offset: 0,
    }),
  "alterations-leaderboards": () =>
    createOkResponse("Leaderboards", {
      summary: { trackedMaps: 96, totalPlayers: 2840 },
      overall: [
        {
          accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          holder: "Example Player",
          totalWrs: 18,
          latestWrAt: "2026-03-10T18:30:00.000Z",
        },
      ],
      buckets: [{ bucket: "Fall 2024", leaders: [{ holder: "Example Player", totalWrs: 5 }] }],
    }),
  "alterations-leaderboards-live": () =>
    createOkResponse("Live", {
      leaderboard: [{ accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", totalWrs: 18 }],
      feed: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          mapName: "Fall 2024 - 08 Cleaned",
          holder: "Example Player",
          wrMs: 54321,
          recordedAt: "2026-03-10T18:30:00.000Z",
        },
      ],
    }),
};

export { alterationResponseFactories };
