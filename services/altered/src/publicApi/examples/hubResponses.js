import { createOkResponse } from "./response.js";

const hubResponseFactories = {
  "dashboard-summary": () =>
    createOkResponse("Dashboard", {
      stats: { total_maps: 120, actively_tracked: 96, total_wr_changes: 340 },
      maps: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          name: "Fall 2024 - 08 Cleaned",
          season: "Fall",
          year: 2024,
          alteration: "Cleaned",
          wrMs: 54321,
          wrHolder: "Example Player",
        },
      ],
      wrFeed: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          mapName: "Fall 2024 - 08 Cleaned",
          holder: "Example Player",
          wrMs: 54321,
          recordedAt: "2026-03-10T18:30:00.000Z",
        },
      ],
      tracker: { enabled: true, lastRunAt: "2026-03-15T11:50:00.000Z" },
    }),
  "latest-wr": () =>
    createOkResponse("Latest WR", {
      latest: {
        mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        mapName: "Fall 2024 - 08 Cleaned",
        accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        holder: "Example Player",
        wrMs: 54321,
        recordedAt: "2026-03-10T18:30:00.000Z",
      },
      recent: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          mapName: "Fall 2024 - 08 Cleaned",
          holder: "Example Player",
          wrMs: 54321,
          recordedAt: "2026-03-10T18:30:00.000Z",
        },
      ],
    }),
  "tracker-status": () =>
    createOkResponse("Tracker status", {
      runtime: { enabled: true, intervalSeconds: 300, trackedMaps: 96 },
      latestRun: { finishedAt: "2026-03-15T11:50:00.000Z", mapsChecked: 96, wrChanges: 3, duration: "12.4s" },
    }),
};

export { hubResponseFactories };
