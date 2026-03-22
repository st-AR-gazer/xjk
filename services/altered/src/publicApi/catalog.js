const DOCS_PATH = "/api/";

const GROUP_ORDER = ["Maps", "Alterations", "Leaderboards", "Clubs", "Hub", "Tracker", "Aggregator", "Webhooks", "Catalog"];

const PUBLIC_API_ENDPOINTS = [
  // ── Catalog ──────────────────────────────────────────────────────────
  {
    key: "public-api-catalog",
    method: "GET",
    path: "/api/v1/public/endpoints",
    group: "Catalog",
    access: "public",
    stability: "stable",
    title: "Endpoint Catalog",
    description: "Lists all documented API endpoints with integration guidance.",
    pathParams: [],
    queryParams: [],
    notes: ["Use this endpoint to discover the current public surface programmatically."],
  },

  // ── Maps ─────────────────────────────────────────────────────────────
  {
    key: "public-map-detail",
    method: "GET",
    path: "/api/v1/public/maps/:mapUid",
    group: "Maps",
    access: "public",
    stability: "stable",
    title: "Map Detail",
    description: "Canonical data for a single Altered-tracked map, including recent WR history.",
    pathParams: [
      {
        name: "mapUid",
        type: "string",
        required: true,
        example: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        description: "Trackmania map UID stored by the Altered service.",
      },
    ],
    queryParams: [
      {
        name: "wrHistoryLimit",
        type: "integer",
        required: false,
        default: 5,
        description: "Number of recent WR events to include (1\u201325).",
      },
    ],
    notes: ["Returns HTTP 404 when the requested map is not known by Altered."],
  },
  {
    key: "legacy-map-info",
    method: "GET",
    path: "/api/v1/maps/info/:mapUid",
    group: "Maps",
    access: "public",
    stability: "legacy",
    title: "Legacy Map Info",
    description: "Backward-compatible map lookup alias. Prefer /api/v1/public/maps/:mapUid for new integrations.",
    pathParams: [
      {
        name: "mapUid",
        type: "string",
        required: true,
        example: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        description: "Trackmania map UID.",
      },
    ],
    queryParams: [],
    notes: ["Prefer /api/v1/public/maps/:mapUid for new integrations."],
  },

  // ── Alterations ──────────────────────────────────────────────────────
  {
    key: "alterations-stats",
    method: "GET",
    path: "/api/v1/alterations/stats",
    group: "Alterations",
    access: "public",
    stability: "existing",
    title: "Stats",
    description: "Aggregate counters for maps, records, and tracking activity.",
    pathParams: [],
    queryParams: [],
    notes: [],
  },
  {
    key: "alterations-maps",
    method: "GET",
    path: "/api/v1/alterations/maps",
    group: "Alterations",
    access: "public",
    stability: "existing",
    title: "Maps Inventory",
    description: "Paginated inventory of all Altered-tracked maps.",
    pathParams: [],
    queryParams: [
      { name: "limit", type: "integer", required: false, default: 120, description: "Maximum rows returned." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: [],
  },
  {
    key: "alterations-campaigns",
    method: "GET",
    path: "/api/v1/alterations/campaigns",
    group: "Alterations",
    access: "public",
    stability: "existing",
    title: "Campaigns",
    description: "Campaign inventory tracked by Altered.",
    pathParams: [],
    queryParams: [
      { name: "limit", type: "integer", required: false, default: 120, description: "Maximum rows returned." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: [],
  },
  {
    key: "alterations-uploads",
    method: "GET",
    path: "/api/v1/alterations/uploads",
    group: "Alterations",
    access: "public",
    stability: "existing",
    title: "Upload Buckets",
    description: "Upload bucket data discovered from the tracked club.",
    pathParams: [],
    queryParams: [
      { name: "limit", type: "integer", required: false, default: 120, description: "Maximum rows returned." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: [],
  },

  // ── Leaderboards ─────────────────────────────────────────────────────
  {
    key: "alterations-leaderboards",
    method: "GET",
    path: "/api/v1/alterations/leaderboards",
    group: "Leaderboards",
    access: "public",
    stability: "existing",
    title: "WR Leaderboards",
    description: "Overall and bucketed WR leaderboards across all Altered maps.",
    pathParams: [],
    queryParams: [
      { name: "overallLimit", type: "integer", required: false, default: 100, description: "Overall leaderboard size." },
      { name: "overallOffset", type: "integer", required: false, default: 0, description: "Overall leaderboard offset." },
      { name: "perBucketLimit", type: "integer", required: false, default: 10, description: "Per-bucket leaderboard size." },
      { name: "includeMaps", type: "boolean", required: false, default: true, description: "Include map rows." },
      { name: "includeBuckets", type: "boolean", required: false, default: true, description: "Include bucketed leaderboards." },
      { name: "includeMedals", type: "boolean", required: false, default: true, description: "Include medal aggregates." },
    ],
    notes: [],
  },
  {
    key: "alterations-leaderboards-live",
    method: "GET",
    path: "/api/v1/alterations/leaderboards/live",
    group: "Leaderboards",
    access: "public",
    stability: "existing",
    title: "Live Leaderboards",
    description: "Live leaderboard data with recent WR feed.",
    pathParams: [],
    queryParams: [
      { name: "limit", type: "integer", required: false, default: 50, description: "Leaderboard row count." },
      { name: "feedLimit", type: "integer", required: false, default: 24, description: "Event feed size." },
    ],
    notes: [],
  },

  // ── Clubs ────────────────────────────────────────────────────────────
  {
    key: "hook-status",
    method: "GET",
    path: "/api/v1/hook/altered",
    group: "Clubs",
    access: "public",
    stability: "existing",
    title: "Hook Status",
    description: "Primary Altered club hook status and latest sync metadata.",
    pathParams: [],
    queryParams: [],
    notes: [],
  },
  {
    key: "hook-maps",
    method: "GET",
    path: "/api/v1/hook/altered/maps",
    group: "Clubs",
    access: "public",
    stability: "existing",
    title: "Hook Maps",
    description: "Maps currently linked to the primary Altered hook.",
    pathParams: [],
    queryParams: [
      { name: "q", type: "string", required: false, default: "", description: "Name or UID search filter." },
      { name: "limit", type: "integer", required: false, default: 1200, description: "Maximum map rows." },
    ],
    notes: [],
  },
  {
    key: "hook-runs",
    method: "GET",
    path: "/api/v1/hook/altered/runs",
    group: "Clubs",
    access: "public",
    stability: "existing",
    title: "Hook Sync Runs",
    description: "Recent sync runs for the primary Altered club hook.",
    pathParams: [],
    queryParams: [
      { name: "limit", type: "integer", required: false, default: 30, description: "Maximum run count." },
    ],
    notes: [],
  },
  {
    key: "aggregator-club-summary",
    method: "GET",
    path: "/api/v1/clubs/:clubId/summary",
    group: "Clubs",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Club Summary",
    description: "Overview summary for a tracked club.",
    pathParams: [
      { name: "clubId", type: "integer", required: true, example: "24231", description: "Trackmania club ID." },
    ],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-club-campaigns",
    method: "GET",
    path: "/api/v1/clubs/:clubId/campaigns",
    group: "Clubs",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Club Campaigns",
    description: "Campaigns belonging to a tracked club.",
    pathParams: [
      { name: "clubId", type: "integer", required: true, example: "24231", description: "Trackmania club ID." },
    ],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-club-maps",
    method: "GET",
    path: "/api/v1/clubs/:clubId/maps",
    group: "Clubs",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Club Maps",
    description: "Maps belonging to a tracked club, with search.",
    pathParams: [
      { name: "clubId", type: "integer", required: true, example: "24231", description: "Trackmania club ID." },
    ],
    queryParams: [
      { name: "q", type: "string", required: false, default: "", description: "Search filter." },
      { name: "limit", type: "integer", required: false, default: 100, description: "Maximum rows." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: ["Served by the aggregator service."],
  },

  // ── Hub ──────────────────────────────────────────────────────────────
  {
    key: "dashboard-summary",
    method: "GET",
    path: "/api/v1/dashboard",
    group: "Hub",
    access: "public",
    stability: "existing",
    title: "Dashboard Summary",
    description: "Public dashboard counters, tracked maps, and recent WR feed.",
    pathParams: [],
    queryParams: [
      { name: "mapsLimit", type: "integer", required: false, default: 24, description: "Maps to return." },
      { name: "mapsOffset", type: "integer", required: false, default: 0, description: "Map offset." },
      { name: "wrFeedLimit", type: "integer", required: false, default: 12, description: "WR feed item count." },
      { name: "includeMapOptions", type: "boolean", required: false, default: true, description: "Include map selection options." },
      { name: "includeTracker", type: "boolean", required: false, default: true, description: "Include tracker runtime data." },
    ],
    notes: [],
  },
  {
    key: "latest-wr",
    method: "GET",
    path: "/api/v1/latest-wr",
    group: "Hub",
    access: "public",
    stability: "existing",
    title: "Latest WR Feed",
    description: "Latest WR event and a recent history slice.",
    pathParams: [],
    queryParams: [
      { name: "includeRecent", type: "boolean", required: false, default: true, description: "Include the recent WR list." },
      { name: "limit", type: "integer", required: false, default: 24, description: "Recent WR item count." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Recent WR offset." },
    ],
    notes: [],
  },

  // ── Tracker ──────────────────────────────────────────────────────────
  {
    key: "tracker-status",
    method: "GET",
    path: "/api/v1/tracker/status",
    group: "Tracker",
    access: "public",
    stability: "existing",
    title: "Tracker Status",
    description: "Tracker runtime health and latest execution state.",
    pathParams: [],
    queryParams: [],
    notes: [],
  },

  // ── Aggregator ───────────────────────────────────────────────────────
  {
    key: "aggregator-meta",
    method: "GET",
    path: "/api/v1/meta",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Service Meta",
    description: "Aggregator service metadata and health summary.",
    pathParams: [],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-metrics-overview",
    method: "GET",
    path: "/api/v1/metrics/overview",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Metrics Overview",
    description: "High-level metrics across all aggregated tracking data.",
    pathParams: [],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-projects",
    method: "GET",
    path: "/api/v1/projects",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Projects",
    description: "Lists all tracking projects registered with the aggregator.",
    pathParams: [],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-project-detail",
    method: "GET",
    path: "/api/v1/projects/:projectKey",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Project Detail",
    description: "Detail for a single tracking project.",
    pathParams: [
      { name: "projectKey", type: "string", required: true, example: "local-tracker-main", description: "Unique project key." },
    ],
    queryParams: [],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-project-maps",
    method: "GET",
    path: "/api/v1/projects/:projectKey/maps",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Project Maps",
    description: "Maps tracked by a specific project, with search.",
    pathParams: [
      { name: "projectKey", type: "string", required: true, example: "local-tracker-main", description: "Unique project key." },
    ],
    queryParams: [
      { name: "q", type: "string", required: false, default: "", description: "Search filter." },
      { name: "limit", type: "integer", required: false, default: 100, description: "Maximum rows." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-events-recent",
    method: "GET",
    path: "/api/v1/events/recent",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Recent Events",
    description: "Recent tracking events across all projects, with filtering and search.",
    pathParams: [],
    queryParams: [
      { name: "project", type: "string", required: false, default: "", description: "Filter by project key." },
      { name: "q", type: "string", required: false, default: "", description: "Search filter." },
      { name: "limit", type: "integer", required: false, default: 50, description: "Maximum rows." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Pagination offset." },
    ],
    notes: ["Served by the aggregator service."],
  },
  {
    key: "aggregator-display-names",
    method: "GET",
    path: "/api/v1/display-names",
    group: "Aggregator",
    service: "aggregator",
    access: "public",
    stability: "existing",
    title: "Display Names",
    description: "Fetch player display names by account ID.",
    pathParams: [],
    queryParams: [
      { name: "accountIds", type: "string", required: true, default: "", description: "Comma-separated account IDs to look up." },
    ],
    notes: ["Served by the aggregator service.", "Accepts up to 50 account IDs per request."],
  },

  // ── Webhooks ─────────────────────────────────────────────────────────
  {
    key: "request-update",
    method: "POST",
    path: "/api/v1/request-update",
    group: "Webhooks",
    access: "public",
    stability: "existing",
    title: "Request Map Update",
    description: "Submit a public request for a manual map update.",
    pathParams: [],
    queryParams: [],
    notes: ["JSON body: { uid|mapUid, name|mapName, reason }"],
  },
  {
    key: "wr-webhook",
    method: "POST",
    path: "/api/v1/webhook/wr",
    group: "Webhooks",
    access: "protected",
    stability: "existing",
    title: "WR Webhook",
    description: "Receives shared-secret WR events from trusted services.",
    pathParams: [],
    queryParams: [],
    notes: ["Requires the x-webhook-secret header.", "Not intended for anonymous public clients."],
  },
];

function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function getDefaultHeaders(endpoint) {
  const headers = [
    {
      name: "Accept",
      value: "application/json",
      required: false,
      description: "Request a JSON response payload.",
    },
  ];

  if (String(endpoint?.method || "GET").toUpperCase() === "POST") {
    headers.push({
      name: "Content-Type",
      value: "application/json",
      required: true,
      description: "Send the request body as JSON.",
    });
  }

  if (endpoint?.key === "wr-webhook") {
    headers.push({
      name: "x-webhook-secret",
      value: "<shared-secret>",
      required: true,
      description: "Shared secret configured on the Altered service.",
    });
  }

  return headers;
}

function getDefaultRemarks(endpoint) {
  const remarks = [];

  if (endpoint?.access === "public") {
    remarks.push("No authentication is required for this endpoint.");
  }

  if (String(endpoint?.method || "GET").toUpperCase() === "GET") {
    remarks.push("Responses are returned as JSON.");
  }

  if (endpoint?.service === "aggregator") {
    remarks.push("This endpoint is served by the aggregator service (aggregator.xjk.yt).");
  }

  if (endpoint?.key === "public-map-detail") {
    remarks.push("Unknown map UIDs return HTTP 404.");
  }

  if (endpoint?.key === "legacy-map-info") {
    remarks.push("Prefer /api/v1/public/maps/:mapUid for new integrations.");
  }

  if (endpoint?.key === "request-update") {
    remarks.push("Invalid or incomplete submissions can return HTTP 400.");
  }

  if (endpoint?.key === "wr-webhook") {
    remarks.push("This endpoint is intended for trusted services only.");
  }

  return remarks;
}

function getDefaultRequestBodyExample(endpoint) {
  switch (endpoint?.key) {
    case "request-update":
      return toPrettyJson({
        mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        mapName: "Fall 2024 - 08 Cleaned",
        reason: "Please refresh this map after a recent record change.",
      });
    case "wr-webhook":
      return toPrettyJson({
        mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        mapName: "Fall 2024 - 08 Cleaned",
        accountId: "60a05b90-17d3-4d34-99d1-008874b82dd8",
        holder: "Example Player",
        wrMs: 54321,
        recordedAt: "2026-03-14T18:00:00.000Z",
      });
    default:
      return null;
  }
}

function getDefaultExampleResponses(endpoint) {
  switch (endpoint?.key) {
    case "public-api-catalog":
      return [{ status: 200, label: "Catalog", body: toPrettyJson({ generatedAt: "2026-03-14T18:00:00.000Z", api: { name: "Altered Public API", version: "v1", totalEndpoints: 28 }, endpoints: ["..."] }) }];
    case "public-map-detail":
      return [
        { status: 200, label: "Map detail", body: toPrettyJson({
          exists: true,
          generatedAt: "2026-03-15T12:00:00.000Z",
          api: { name: "Altered Public API", version: "v1", docsPath: "/api/" },
          map: {
            mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
            mapId: "84f939cb-d43e-47cf-b110-1b953ba3ba16",
            name: "Fall 2024 - 08 Cleaned",
            filename: "Fall 2024 - 08 Cleaned.Map.Gbx",
            fileUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/file",
            thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg",
            author: "60a05b90-17d3-4d34-99d1-008874b82dd8",
            submitter: "60a05b90-17d3-4d34-99d1-008874b82dd8",
            authorScore: 56093,
            goldScore: 60000,
            silverScore: 68000,
            bronzeScore: 85000,
            collectionName: "Stadium",
            mapStyle: "",
            mapType: "TrackMania\\TM_Race",
            isPlayable: true,
            createdWithGamepadEditor: false,
            createdWithSimpleEditor: false,
            timestamp: "2024-10-06T14:57:31+00:00",
            season: "Fall",
            year: 2024,
            mapnumber: [8],
            alteration: "Cleaned",
            type: null,
            wrMs: 54321,
            wrHolder: "Example Player",
            tracked: true,
            status: "active"
          },
          wrHistory: [
            { eventId: 101, mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z", receivedAt: "2026-03-10T18:30:05.000Z" }
          ],
          links: {
            self: "/api/v1/public/maps/ixgRz0phSb2_luKbkuFu7PK0Iea",
            legacy: "/api/v1/maps/info/ixgRz0phSb2_luKbkuFu7PK0Iea",
            docs: "/api/endpoints/public-map-detail"
          }
        }) },
        { status: 404, label: "Not found", body: toPrettyJson({ error: "Map not found.", mapUid: "unknown-map-uid" }) },
      ];
    case "legacy-map-info":
      return [
        { status: 200, label: "Map info", body: toPrettyJson({
          alteration: "Cleaned",
          author: "60a05b90-17d3-4d34-99d1-008874b82dd8",
          authorScore: 56093,
          bronzeScore: 85000,
          collectionName: "Stadium",
          createdWithGamepadEditor: false,
          createdWithSimpleEditor: false,
          fileUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/file",
          filename: "Fall 2024 - 08 Cleaned.Map.Gbx",
          goldScore: 60000,
          isPlayable: true,
          mapId: "84f939cb-d43e-47cf-b110-1b953ba3ba16",
          mapStyle: "",
          mapType: "TrackMania\\TM_Race",
          mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
          mapnumber: [8],
          name: "Fall 2024 - 08 Cleaned",
          season: "Fall",
          silverScore: 68000,
          submitter: "60a05b90-17d3-4d34-99d1-008874b82dd8",
          thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg",
          timestamp: "2024-10-06T14:57:31+00:00",
          type: null,
          year: 2024
        }) },
        { status: 404, label: "Not found", body: toPrettyJson({ error: "Map not found.", mapUid: "unknown-map-uid" }) },
      ];
    case "dashboard-summary":
      return [{ status: 200, label: "Dashboard", body: toPrettyJson({
        stats: { total_maps: 120, actively_tracked: 96, total_wr_changes: 340 },
        maps: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", name: "Fall 2024 - 08 Cleaned", season: "Fall", year: 2024, alteration: "Cleaned", wrMs: 54321, wrHolder: "Example Player" }],
        wrFeed: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" }],
        tracker: { enabled: true, lastRunAt: "2026-03-15T11:50:00.000Z" }
      }) }];
    case "latest-wr":
      return [{ status: 200, label: "Latest WR", body: toPrettyJson({
        latest: { mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" },
        recent: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" }]
      }) }];
    case "hook-status":
      return [{ status: 200, label: "Hook status", body: toPrettyJson({
        hook: { hookKey: "altered-club", clubId: 24231, clubName: "Altered Nadeo", enabled: true, lastSyncAt: "2026-03-15T11:45:00.000Z", mapCount: 120 }
      }) }];
    case "hook-maps":
      return [{ status: 200, label: "Hook maps", body: toPrettyJson({
        maps: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", name: "Fall 2024 - 08 Cleaned", author: "60a05b90-17d3-4d34-99d1-008874b82dd8", thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg" }],
        count: 120
      }) }];
    case "hook-runs":
      return [{ status: 200, label: "Sync runs", body: toPrettyJson({
        runs: [{ runId: 42, hookKey: "altered-club", status: "ok", mapsSeen: 120, mapsAdded: 0, mapsRemoved: 0, startedAt: "2026-03-15T11:45:00.000Z", finishedAt: "2026-03-15T11:45:12.000Z" }],
        count: 30
      }) }];
    case "tracker-status":
      return [{ status: 200, label: "Tracker status", body: toPrettyJson({
        runtime: { enabled: true, intervalSeconds: 300, trackedMaps: 96 },
        latestRun: { finishedAt: "2026-03-15T11:50:00.000Z", mapsChecked: 96, wrChanges: 3, duration: "12.4s" }
      }) }];
    case "alterations-stats":
      return [{ status: 200, label: "Stats", body: toPrettyJson({
        total_maps: 120, actively_tracked: 96, total_wr_changes: 340, total_campaigns: 15, total_players: 2840
      }) }];
    case "alterations-maps":
      return [{ status: 200, label: "Maps", body: toPrettyJson({
        maps: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", name: "Fall 2024 - 08 Cleaned", season: "Fall", year: 2024, alteration: "Cleaned", wrMs: 54321, wrHolder: "Example Player", tracked: true }],
        total: 120, limit: 120, offset: 0
      }) }];
    case "alterations-campaigns":
      return [{ status: 200, label: "Campaigns", body: toPrettyJson({
        campaigns: [{ campaignId: 1, name: "Fall 2024", mapCount: 25, externalId: 54321 }],
        total: 15, limit: 120, offset: 0
      }) }];
    case "alterations-uploads":
      return [{ status: 200, label: "Uploads", body: toPrettyJson({
        uploads: [{ bucketId: 12, name: "Fall 2024 Uploads", mapCount: 25, discoveredAt: "2024-10-01T00:00:00.000Z" }],
        total: 8, limit: 120, offset: 0
      }) }];
    case "alterations-leaderboards":
      return [{ status: 200, label: "Leaderboards", body: toPrettyJson({
        summary: { trackedMaps: 96, totalPlayers: 2840 },
        overall: [{ accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", totalWrs: 18, latestWrAt: "2026-03-10T18:30:00.000Z" }],
        buckets: [{ bucket: "Fall 2024", leaders: [{ holder: "Example Player", totalWrs: 5 }] }]
      }) }];
    case "alterations-leaderboards-live":
      return [{ status: 200, label: "Live", body: toPrettyJson({
        leaderboard: [{ accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", totalWrs: 18 }],
        feed: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" }]
      }) }];
    case "aggregator-meta":
      return [{ status: 200, label: "Meta", body: toPrettyJson({
        service: "tracker-aggregator",
        version: "1.0.0",
        uptime: "4d 12h 30m",
        summary: { projects: 2, totalMaps: 240, totalEvents: 1200 }
      }) }];
    case "aggregator-metrics-overview":
      return [{ status: 200, label: "Metrics", body: toPrettyJson({
        metrics: { totalEvents: 1200, totalMaps: 240, totalProjects: 2, totalClubs: 3, lastEventAt: "2026-03-15T11:30:00.000Z" }
      }) }];
    case "aggregator-projects":
      return [{ status: 200, label: "Projects", body: toPrettyJson({
        projects: [{ projectKey: "local-tracker-main", name: "Local Tracker Main", mapCount: 120, enabled: true, lastSyncAt: "2026-03-15T11:50:00.000Z" }]
      }) }];
    case "aggregator-project-detail":
      return [{ status: 200, label: "Project", body: toPrettyJson({
        project: { projectKey: "local-tracker-main", name: "Local Tracker Main", mapCount: 120, enabled: true, lastSyncAt: "2026-03-15T11:50:00.000Z", checkIntervalSeconds: 300 }
      }) }];
    case "aggregator-project-maps":
      return [{ status: 200, label: "Project maps", body: toPrettyJson({
        maps: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", name: "Fall 2024 - 08 Cleaned", wrMs: 54321, wrHolder: "Example Player", tracked: true }],
        total: 120, limit: 100, offset: 0
      }) }];
    case "aggregator-events-recent":
      return [{ status: 200, label: "Events", body: toPrettyJson({
        events: [{ eventId: 101, type: "wr_change", projectKey: "local-tracker-main", mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" }],
        total: 50, limit: 50, offset: 0
      }) }];
    case "aggregator-display-names":
      return [{ status: 200, label: "Names", body: toPrettyJson({
        names: { "60a05b90-17d3-4d34-99d1-008874b82dd8": "Example Player" },
        found: 1, requested: 1
      }) }];
    case "aggregator-club-summary":
      return [{ status: 200, label: "Summary", body: toPrettyJson({
        club: { clubId: 24231, name: "Altered Nadeo", campaignCount: 15, mapCount: 120, memberCount: 850, createdAt: "2023-01-15T00:00:00.000Z" }
      }) }];
    case "aggregator-club-campaigns":
      return [{ status: 200, label: "Campaigns", body: toPrettyJson({
        campaigns: [{ campaignId: 54321, name: "Fall 2024", mapCount: 25, createdAt: "2024-10-01T00:00:00.000Z" }]
      }) }];
    case "aggregator-club-maps":
      return [{ status: 200, label: "Maps", body: toPrettyJson({
        maps: [{ mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", name: "Fall 2024 - 08 Cleaned", author: "60a05b90-17d3-4d34-99d1-008874b82dd8", thumbnailUrl: "https://core.trackmania.nadeo.live/maps/84f939cb-d43e-47cf-b110-1b953ba3ba16/thumbnail.jpg" }],
        total: 120, limit: 100, offset: 0
      }) }];
    case "request-update":
      return [
        { status: 200, label: "Queued", body: toPrettyJson({ ok: true, request: { requestId: 42, mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", status: "queued", createdAt: "2026-03-15T12:00:00.000Z" } }) },
        { status: 400, label: "Invalid", body: toPrettyJson({ error: "mapUid is required." }) },
      ];
    case "wr-webhook":
      return [
        { status: 200, label: "Accepted", body: toPrettyJson({ ok: true, event: { mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea", mapName: "Fall 2024 - 08 Cleaned", accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", holder: "Example Player", wrMs: 54321, recordedAt: "2026-03-10T18:30:00.000Z" } }) },
        { status: 401, label: "Unauthorized", body: toPrettyJson({ error: "Unauthorized" }) },
      ];
    default:
      return [{ status: 200, label: "OK", body: toPrettyJson({ ok: true }) }];
  }
}

function buildPublicApiCatalog() {
  return {
    api: {
      name: "Altered Public API",
      version: "v1",
      docsPath: DOCS_PATH,
      totalEndpoints: PUBLIC_API_ENDPOINTS.length,
      groupOrder: GROUP_ORDER,
    },
    endpoints: PUBLIC_API_ENDPOINTS.map((endpoint) => ({
      ...endpoint,
      pathParams: Array.isArray(endpoint.pathParams) ? endpoint.pathParams : [],
      queryParams: Array.isArray(endpoint.queryParams) ? endpoint.queryParams : [],
      headers: Array.isArray(endpoint.headers) ? endpoint.headers : getDefaultHeaders(endpoint),
      remarks: Array.isArray(endpoint.remarks) ? endpoint.remarks : getDefaultRemarks(endpoint),
      requestBodyExample:
        typeof endpoint.requestBodyExample === "string"
          ? endpoint.requestBodyExample
          : getDefaultRequestBodyExample(endpoint),
      exampleResponses: Array.isArray(endpoint.exampleResponses)
        ? endpoint.exampleResponses
        : getDefaultExampleResponses(endpoint),
      notes: Array.isArray(endpoint.notes) ? endpoint.notes : [],
    })),
  };
}

export { DOCS_PATH, GROUP_ORDER, PUBLIC_API_ENDPOINTS, buildPublicApiCatalog };
