import { createOkResponse } from "./response.js";

const clubResponseFactories = {
  "hook-status": () =>
    createOkResponse("Hook status", {
      hook: {
        hookKey: "altered-club",
        clubId: 24231,
        clubName: "Altered Nadeo",
        enabled: true,
        lastSyncAt: "2026-03-15T11:45:00.000Z",
        mapCount: 120,
      },
    }),
  "hook-maps": () =>
    createOkResponse("Hook maps", {
      maps: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          name: "Fall 2024 - 08 Cleaned",
          author: "60a05b90-17d3-4d34-99d1-008874b82dd8",
          thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg",
        },
      ],
      count: 120,
    }),
  "hook-runs": () =>
    createOkResponse("Sync runs", {
      runs: [
        {
          runId: 42,
          hookKey: "altered-club",
          status: "ok",
          mapsSeen: 120,
          mapsAdded: 0,
          mapsRemoved: 0,
          startedAt: "2026-03-15T11:45:00.000Z",
          finishedAt: "2026-03-15T11:45:12.000Z",
        },
      ],
      count: 30,
    }),
  "aggregator-club-summary": () =>
    createOkResponse("Summary", {
      club: {
        clubId: 24231,
        name: "Altered Nadeo",
        campaignCount: 15,
        mapCount: 120,
        memberCount: 850,
        createdAt: "2023-01-15T00:00:00.000Z",
      },
    }),
  "aggregator-club-campaigns": () =>
    createOkResponse("Campaigns", {
      campaigns: [{ campaignId: 54321, name: "Fall 2024", mapCount: 25, createdAt: "2024-10-01T00:00:00.000Z" }],
    }),
  "aggregator-club-maps": () =>
    createOkResponse("Maps", {
      maps: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          name: "Fall 2024 - 08 Cleaned",
          author: "60a05b90-17d3-4d34-99d1-008874b82dd8",
          thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg",
        },
      ],
      total: 120,
      limit: 100,
      offset: 0,
    }),
};

export { clubResponseFactories };
