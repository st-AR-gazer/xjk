import { createOkResponse } from "./response.js";

const aggregatorResponseFactories = {
  "aggregator-meta": () =>
    createOkResponse("Meta", {
      service: "tracker-aggregator",
      version: "1.0.0",
      uptime: "4d 12h 30m",
      summary: { projects: 2, totalMaps: 240, totalEvents: 1200 },
    }),
  "aggregator-metrics-overview": () =>
    createOkResponse("Metrics", {
      metrics: {
        totalEvents: 1200,
        totalMaps: 240,
        totalProjects: 2,
        totalClubs: 3,
        lastEventAt: "2026-03-15T11:30:00.000Z",
      },
    }),
  "aggregator-projects": () =>
    createOkResponse("Projects", {
      projects: [
        {
          projectKey: "local-tracker-main",
          name: "Local Tracker Main",
          mapCount: 120,
          enabled: true,
          lastSyncAt: "2026-03-15T11:50:00.000Z",
        },
      ],
    }),
  "aggregator-project-detail": () =>
    createOkResponse("Project", {
      project: {
        projectKey: "local-tracker-main",
        name: "Local Tracker Main",
        mapCount: 120,
        enabled: true,
        lastSyncAt: "2026-03-15T11:50:00.000Z",
        checkIntervalSeconds: 300,
      },
    }),
  "aggregator-project-maps": () =>
    createOkResponse("Project maps", {
      maps: [
        {
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          name: "Fall 2024 - 08 Cleaned",
          wrMs: 54321,
          wrHolder: "Example Player",
          tracked: true,
        },
      ],
      total: 120,
      limit: 100,
      offset: 0,
    }),
  "aggregator-events-recent": () =>
    createOkResponse("Events", {
      events: [
        {
          eventId: 101,
          type: "wr_change",
          projectKey: "local-tracker-main",
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          mapName: "Fall 2024 - 08 Cleaned",
          accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          holder: "Example Player",
          wrMs: 54321,
          recordedAt: "2026-03-10T18:30:00.000Z",
        },
      ],
      total: 50,
      limit: 50,
      offset: 0,
    }),
  "aggregator-display-names": () =>
    createOkResponse("Names", {
      names: { "60a05b90-17d3-4d34-99d1-008874b82dd8": "Example Player" },
      found: 1,
      requested: 1,
    }),
};

export { aggregatorResponseFactories };
