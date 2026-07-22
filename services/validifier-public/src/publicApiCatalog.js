import { normalizePublicApiEndpoints } from "../../shared/publicApiCatalog.js";

const DOCS_PATH = "/api/";

const GROUP_ORDER = ["Core", "Verification", "Submissions", "Catalog"];

const PUBLIC_API_ENDPOINTS = [
  {
    key: "endpoint-catalog",
    method: "GET",
    path: "/api/v1/endpoints",
    group: "Catalog",
    access: "public",
    stability: "stable",
    title: "Endpoint Catalog",
    description: "Lists all documented Validifier public endpoints with examples and integration guidance.",
    pathParams: [],
    queryParams: [],
    notes: ["Use this route to discover the current Validifier public surface programmatically."],
  },
  {
    key: "api-root",
    method: "GET",
    path: "/api/v1",
    group: "Core",
    access: "public",
    stability: "stable",
    title: "API Root",
    description: "Convenience metadata entrypoint for the current public API version.",
    pathParams: [],
    queryParams: [],
    notes: ["Useful for quick discovery, but clients should target documented endpoint routes directly."],
  },
  {
    key: "public-health",
    method: "GET",
    path: "/api/v1/health",
    group: "Core",
    access: "public",
    stability: "stable",
    title: "Public Health",
    description: "Returns public service health and supported track metadata.",
    pathParams: [],
    queryParams: [],
    notes: ["Reports only public-service state, not private backend internals."],
  },
  {
    key: "live-queue",
    method: "GET",
    path: "/api/v1/live",
    group: "Verification",
    access: "public",
    stability: "stable",
    title: "Live Queue",
    description: "Public watchboard feed for known records, recent checks, and grouped remaining map work.",
    pathParams: [],
    queryParams: [
      {
        name: "limit",
        type: "integer",
        required: false,
        default: 250,
        description: "Maximum record bundles returned in the watchlist.",
      },
      {
        name: "mapLimit",
        type: "integer",
        required: false,
        default: 18,
        description: "Maximum grouped maps returned in maps_remaining.",
      },
    ],
    notes: [
      "This is a public projection of known records and recent verification activity, not a direct private worker feed.",
    ],
  },
  {
    key: "record-detail",
    method: "GET",
    path: "/api/v1/records/:recordId",
    group: "Verification",
    access: "public",
    stability: "stable",
    title: "Record Detail",
    description: "Canonical verification bundle for a single record, including replay and deep summaries.",
    pathParams: [
      {
        name: "recordId",
        type: "string",
        required: true,
        example: "deploy-smoke-20260518-115805",
        description: "Trackmania record identifier.",
      },
    ],
    queryParams: [],
    notes: ["If a track has no known result yet, it is still included with status not_run."],
  },
  {
    key: "record-verdicts-compat",
    method: "GET",
    path: "/api/v1/records/:recordId/verdicts",
    group: "Verification",
    access: "public",
    stability: "stable",
    title: "Record Verdicts Compatibility",
    description: "Compatibility alias for the canonical record detail route.",
    pathParams: [
      {
        name: "recordId",
        type: "string",
        required: true,
        example: "deploy-smoke-20260518-115805",
        description: "Trackmania record identifier.",
      },
    ],
    queryParams: [],
    notes: ["New integrations should prefer GET /api/v1/records/:recordId."],
  },
  {
    key: "map-verdicts",
    method: "GET",
    path: "/api/v1/maps/:mapUid/verdicts",
    group: "Verification",
    access: "public",
    stability: "stable",
    title: "Map Verdicts",
    description: "Track-scoped list of known record bundles for a map, with paging, sorting, and status filtering.",
    pathParams: [
      {
        name: "mapUid",
        type: "string",
        required: true,
        example: "deploy.smoke.validifier.replay",
        description: "Trackmania map UID.",
      },
    ],
    queryParams: [
      {
        name: "track",
        type: "enum(replay|deep)",
        required: false,
        default: "replay",
        description: "Primary public verification track to return.",
      },
      { name: "limit", type: "integer", required: false, default: 100, description: "Maximum rows per page." },
      { name: "page", type: "integer", required: false, default: 1, description: "1-based page index." },
      {
        name: "sort",
        type: "enum(rank_asc|rank_desc|updated_desc|record_asc)",
        required: false,
        default: "rank_asc",
        description: "Map row ordering.",
      },
      {
        name: "status",
        type: "enum(all|pass|fail|pending|unavailable|not_run)",
        required: false,
        default: "all",
        description: "Primary-track status filter.",
      },
    ],
    notes: ["This route returns one public track in verifications for each listed bundle."],
  },
  {
    key: "batch-verdicts",
    method: "POST",
    path: "/api/v1/verdicts/batch",
    group: "Verification",
    access: "public",
    stability: "stable",
    title: "Batch Verdict Lookup",
    description: "Resolves many record IDs in one request and returns normalized public verification bundles.",
    pathParams: [],
    queryParams: [],
    notes: [
      "Use track=all to request both replay and deep summaries in one pass.",
      "Accepts up to 100 unique record IDs per request.",
    ],
  },
  {
    key: "upload-map",
    method: "POST",
    path: "/api/v1/uploads/map?filename=<urlencoded>",
    group: "Submissions",
    access: "public",
    stability: "stable",
    title: "Stage Map Upload",
    description: "Stages a map artifact for a later public replay submission.",
    pathParams: [],
    queryParams: [
      {
        name: "filename",
        type: "string",
        required: true,
        default: "",
        description: "Original upload filename used for staging metadata.",
      },
    ],
    notes: [
      "Send the binary request body as application/octet-stream.",
      "Returns an artifact ref for the submission flow.",
      "Per-client and service-wide daily byte and concurrent upload quotas apply.",
    ],
  },
  {
    key: "upload-replay",
    method: "POST",
    path: "/api/v1/uploads/replay?filename=<urlencoded>",
    group: "Submissions",
    access: "public",
    stability: "stable",
    title: "Stage Replay Upload",
    description: "Stages a replay artifact for a later public replay submission.",
    pathParams: [],
    queryParams: [
      {
        name: "filename",
        type: "string",
        required: true,
        default: "",
        description: "Original upload filename used for staging metadata.",
      },
    ],
    notes: [
      "Send the binary request body as application/octet-stream.",
      "Returns an artifact ref for the submission flow.",
      "Per-client and service-wide daily byte and concurrent upload quotas apply.",
    ],
  },
  {
    key: "submit-replay",
    method: "POST",
    path: "/api/v1/submissions/replay",
    group: "Submissions",
    access: "public",
    stability: "stable",
    title: "Submit Replay Verification",
    description: "Creates a public replay submission using previously staged map and replay artifacts.",
    pathParams: [],
    queryParams: [],
    notes: ["The response includes the created submission ID and the canonical record bundle projection."],
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
      value:
        endpoint?.key === "upload-map" || endpoint?.key === "upload-replay"
          ? "application/octet-stream"
          : "application/json",
      required: true,
      description:
        endpoint?.key === "upload-map" || endpoint?.key === "upload-replay"
          ? "Send the raw artifact bytes."
          : "Send the request body as JSON.",
    });
  }

  return headers;
}

function getDefaultRemarks(endpoint) {
  const remarks = [];

  if (endpoint?.access === "public") {
    remarks.push("No secret client token is required for this endpoint.");
  }

  remarks.push(
    "All responses use the public Validifier envelope: { ok, data } on success and { ok, error } on failure."
  );

  if (endpoint?.key === "map-verdicts") {
    remarks.push("Clients should pass the track query explicitly even though replay is the default.");
  }

  if (endpoint?.key === "record-verdicts-compat") {
    remarks.push(
      "This route is supported for compatibility, but GET /api/v1/records/:recordId is the preferred canonical record detail route."
    );
  }

  if (endpoint?.key === "upload-map" || endpoint?.key === "upload-replay") {
    remarks.push("Upload staging refs remain server-side artifacts for the later submission flow.");
  }

  if (endpoint?.key === "submit-replay") {
    remarks.push(
      "Users and clients should poll the canonical record route after submission rather than depending on private job semantics."
    );
  }

  return remarks;
}

function getDefaultRequestBodyExample(endpoint) {
  switch (endpoint?.key) {
    case "batch-verdicts":
      return toPrettyJson({
        record_ids: ["deploy-smoke-20260518-115805", "pagination-smoke-01"],
        track: "all",
      });
    case "submit-replay":
      return toPrettyJson({
        record_id: "deploy-smoke-20260518-115805",
        map_uid: "deploy.smoke.validifier.replay",
        rank: 1,
        map_ref: "vfart_map_example123",
        replay_ref: "vfart_replay_example456",
      });
    default:
      return null;
  }
}

function getDefaultExampleResponses(endpoint) {
  switch (endpoint?.key) {
    case "endpoint-catalog":
      return [
        {
          status: 200,
          label: "Catalog",
          body: toPrettyJson({
            ok: true,
            data: {
              api: { name: "Validifier Public API", version: "v1", docs_path: "/api/" },
              endpoints: ["..."],
            },
          }),
        },
        {
          status: 429,
          label: "Upload quota reached",
          body: toPrettyJson({
            ok: false,
            error: {
              code: "upload_quota_exceeded",
              message: "The daily upload byte allowance for this client has been reached.",
            },
          }),
        },
      ];
    case "api-root":
      return [
        {
          status: 200,
          label: "Metadata",
          body: toPrettyJson({
            ok: true,
            data: {
              api_version: "v1",
              endpoints: {
                health: "/api/v1/health",
                live: "/api/v1/live?limit=1..500&mapLimit=1..50",
                record: "/api/v1/records/:recordId",
              },
            },
          }),
        },
      ];
    case "public-health":
      return [
        {
          status: 200,
          label: "Health",
          body: toPrettyJson({
            ok: true,
            data: {
              status: "ok",
              api_version: "v1",
              supported_tracks: ["replay", "deep"],
              checked_at: "2026-05-30T14:00:00.000Z",
            },
          }),
        },
      ];
    case "live-queue":
      return [
        {
          status: 200,
          label: "Live queue",
          body: toPrettyJson({
            ok: true,
            data: {
              live_at: "2026-05-30T14:01:08.263Z",
              latest_activity: {
                record_id: "pagination-smoke-12",
                map_uid: "pagination.smoke.validifier.replay",
                rank: 12,
                track: "replay",
                status: "pending",
                reason_code: "awaiting_processing",
                checked_at: null,
                updated_at: "2026-05-30T12:12:00.000Z",
              },
              totals: {
                known_records: 14,
                known_maps: 2,
                replay_remaining: 14,
                deep_remaining: 14,
              },
              records: ["..."],
              maps_remaining: ["..."],
            },
          }),
        },
      ];
    case "record-detail":
    case "record-verdicts-compat":
      return [
        {
          status: 200,
          label: "Record bundle",
          body: toPrettyJson({
            ok: true,
            data: {
              record_id: "deploy-smoke-20260518-115805",
              map_uid: "deploy.smoke.validifier.replay",
              rank: 1,
              updated_at: "2026-05-18T11:58:05.459Z",
              verifications: [
                {
                  track: "replay",
                  status: "pending",
                  checked_at: null,
                  confidence: null,
                  reason_code: "awaiting_processing",
                  policy_version: null,
                  updated_at: "2026-05-18T11:58:05.459Z",
                },
                {
                  track: "deep",
                  status: "not_run",
                  checked_at: null,
                  confidence: null,
                  reason_code: "not_run",
                  policy_version: null,
                  updated_at: null,
                },
              ],
            },
          }),
        },
        {
          status: 404,
          label: "Unknown record",
          body: toPrettyJson({
            ok: false,
            error: {
              code: "not_found",
              message: "No public verification data was found for that record.",
            },
          }),
        },
      ];
    case "map-verdicts":
      return [
        {
          status: 200,
          label: "Map rows",
          body: toPrettyJson({
            ok: true,
            data: {
              map_uid: "deploy.smoke.validifier.replay",
              track: "replay",
              sort: "rank_asc",
              status: "all",
              page: 1,
              limit: 100,
              total_items: 2,
              filtered_items: 2,
              page_count: 1,
              latest_update: "2026-05-18T11:58:05.459Z",
              counts: {
                pass: 0,
                fail: 0,
                pending: 2,
                unavailable: 0,
                not_run: 0,
              },
              items: ["..."],
            },
          }),
        },
      ];
    case "batch-verdicts":
      return [
        {
          status: 200,
          label: "Batch",
          body: toPrettyJson({
            ok: true,
            data: {
              records: [
                {
                  record_id: "deploy-smoke-20260518-115805",
                  map_uid: "deploy.smoke.validifier.replay",
                  rank: 1,
                  updated_at: "2026-05-18T11:58:05.459Z",
                  verifications: ["..."],
                },
              ],
              missing_record_ids: ["missing-record-123"],
            },
          }),
        },
        {
          status: 400,
          label: "Invalid request",
          body: toPrettyJson({
            ok: false,
            error: {
              code: "invalid_request",
              message: "record_ids must contain at least one record ID.",
            },
          }),
        },
      ];
    case "upload-map":
    case "upload-replay":
      return [
        {
          status: 200,
          label: "Upload staged",
          body: toPrettyJson({
            ok: true,
            data: {
              artifact_ref: "vfart_example123",
              kind: endpoint.key === "upload-map" ? "map" : "replay",
              size_bytes: 123456,
              sha256: "abc123...",
              expires_at: "2026-05-30T15:00:00.000Z",
            },
          }),
        },
      ];
    case "submit-replay":
      return [
        {
          status: 200,
          label: "Submission created",
          body: toPrettyJson({
            ok: true,
            data: {
              submission_id: "vfsub_example789",
              record: {
                record_id: "deploy-smoke-20260518-115805",
                map_uid: "deploy.smoke.validifier.replay",
                rank: 1,
                updated_at: "2026-05-18T11:58:05.459Z",
                verifications: ["..."],
              },
            },
          }),
        },
      ];
    default:
      return [
        {
          status: 200,
          label: "OK",
          body: toPrettyJson({ ok: true, data: {} }),
        },
      ];
  }
}

function buildPublicApiCatalog() {
  return {
    api: {
      name: "Validifier Public API",
      version: "v1",
      docs_path: DOCS_PATH,
      total_endpoints: PUBLIC_API_ENDPOINTS.length,
      group_order: GROUP_ORDER,
      base_url: "https://validifier.xjk.yt/api/v1",
    },
    guide: {
      auth: "Public read endpoints do not require a secret client token.",
      response_envelope: {
        success: { ok: true, data: "..." },
        error: {
          ok: false,
          error: {
            code: "invalid_request|not_found|rate_limited|upload_quota_exceeded|upload_concurrency_limited|upstream_unavailable|internal_error",
            message: "human-readable message",
          },
        },
      },
      enums: {
        track: ["replay", "deep"],
        status: ["pass", "fail", "pending", "unavailable", "not_run"],
        confidence: ["high", "medium", "low", null],
        reason_code: [
          "verified",
          "failed_verification",
          "awaiting_processing",
          "manual_review",
          "artifacts_missing",
          "unsupported",
          "service_error",
          "not_run",
          "unknown",
        ],
      },
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
