import { normalizePublicApiEndpoints } from "../../../shared/publicApiCatalog.js";
import { getDefaultExampleResponses } from "./examples/index.js";
import { toPrettyJson } from "./examples/response.js";

const DOCS_PATH = "/api/";

const GROUP_ORDER = [
  "Maps",
  "Alterations",
  "Leaderboards",
  "Clubs",
  "Hub",
  "Tracker",
  "Aggregator",
  "Webhooks",
  "Catalog",
];

const PUBLIC_API_ENDPOINTS = [
  // Catalog endpoints.
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

  // Map endpoints.
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

  // Alteration endpoints.
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

  // Leaderboard endpoints.
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
      {
        name: "overallLimit",
        type: "integer",
        required: false,
        default: 100,
        description: "Overall leaderboard size.",
      },
      {
        name: "overallOffset",
        type: "integer",
        required: false,
        default: 0,
        description: "Overall leaderboard offset.",
      },
      {
        name: "perBucketLimit",
        type: "integer",
        required: false,
        default: 10,
        description: "Per-bucket leaderboard size.",
      },
      { name: "includeMaps", type: "boolean", required: false, default: true, description: "Include map rows." },
      {
        name: "includeBuckets",
        type: "boolean",
        required: false,
        default: true,
        description: "Include bucketed leaderboards.",
      },
      {
        name: "includeMedals",
        type: "boolean",
        required: false,
        default: true,
        description: "Include medal aggregates.",
      },
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

  // Club endpoints.
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
    queryParams: [{ name: "limit", type: "integer", required: false, default: 30, description: "Maximum run count." }],
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

  // Hub endpoints.
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
      {
        name: "includeMapOptions",
        type: "boolean",
        required: false,
        default: true,
        description: "Include map selection options.",
      },
      {
        name: "includeTracker",
        type: "boolean",
        required: false,
        default: true,
        description: "Include tracker runtime data.",
      },
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
      {
        name: "includeRecent",
        type: "boolean",
        required: false,
        default: true,
        description: "Include the recent WR list.",
      },
      { name: "limit", type: "integer", required: false, default: 24, description: "Recent WR item count." },
      { name: "offset", type: "integer", required: false, default: 0, description: "Recent WR offset." },
    ],
    notes: [],
  },

  // Tracker endpoints.
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

  // Aggregator endpoints.
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
      {
        name: "projectKey",
        type: "string",
        required: true,
        example: "local-tracker-main",
        description: "Unique project key.",
      },
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
      {
        name: "projectKey",
        type: "string",
        required: true,
        example: "local-tracker-main",
        description: "Unique project key.",
      },
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
      {
        name: "accountIds",
        type: "string",
        required: true,
        default: "",
        description: "Comma-separated account IDs to look up.",
      },
    ],
    notes: ["Served by the aggregator service.", "Accepts up to 50 account IDs per request."],
  },

  // Webhook endpoints.
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

function buildPublicApiCatalog() {
  return {
    api: {
      name: "Altered Public API",
      version: "v1",
      docsPath: DOCS_PATH,
      totalEndpoints: PUBLIC_API_ENDPOINTS.length,
      groupOrder: GROUP_ORDER,
    },
    endpoints: normalizePublicApiEndpoints(PUBLIC_API_ENDPOINTS, {
      defaultHeaders: getDefaultHeaders,
      defaultRemarks: getDefaultRemarks,
      defaultRequestBodyExample: getDefaultRequestBodyExample,
      defaultExampleResponses: getDefaultExampleResponses,
    }),
  };
}

export { DOCS_PATH, GROUP_ORDER, PUBLIC_API_ENDPOINTS, buildPublicApiCatalog };
