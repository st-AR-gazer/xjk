function withOrigin(origin, path) {
  const safePath = String(path || "").trim();
  const safeOrigin = String(origin || "").trim().replace(/\/+$/, "");
  if (!safeOrigin) return safePath;
  return `${safeOrigin}${safePath}`;
}

const FUZZY_SEARCH_REFERENCE_LIMIT = 5000;

function endpoint({
  method,
  path,
  summary,
  auth = "public",
  query = [],
  pathParams = [],
  notes = [],
  bodyExample = null,
  responseExample = null,
  example = "",
}) {
  return {
    method,
    path,
    summary,
    auth,
    query,
    pathParams,
    notes,
    bodyExample,
    responseExample,
    example,
  };
}

function createApiCatalog({
  origin = "",
  ingestTokenConfigured = false,
  arlAuthConfigured = false,
} = {}) {
  const docsBase = "/api/";
  const publicBase = "/api/v1";
  const ingestBase = "/api/v1/ingest";
  const baseUrl = withOrigin(origin, publicBase);
  const ingestUrl = withOrigin(origin, ingestBase);

  return {
    service: "tracker-aggregator",
    generatedAt: new Date().toISOString(),
    docsVersion: 1,
    baseUrls: {
      docs: withOrigin(origin, docsBase),
      public: baseUrl,
      ingest: ingestUrl,
    },
    summary:
      "Shared cache and query service for project metadata, events, display names, club snapshots, and tracker telemetry.",
    currentRole: [
      "Good fit: accountId/displayName lookups, project and map metadata, event streams, metrics, and club snapshots.",
      "Contribution model: projects POST normalized observations into ingest routes and then read back shared data through public routes.",
      "Not intended to be a replay, ghost, or arbitrary binary hosting backend.",
    ],
    auth: {
      publicRead: {
        required: false,
        description: "Public query routes are readable without a token.",
      },
      ingest: {
        required: true,
        enforcedOnThisServer: Boolean(ingestTokenConfigured),
        acceptedHeaders: [
          "x-ingest-token: <token>",
          "Authorization: Bearer <token>",
          "x-admin-token: <token>",
        ],
        description: ingestTokenConfigured
          ? "This server currently requires a token for standard ingest routes."
          : "Standard ingest routes are designed to be token-gated. This instance currently has no ingest token configured.",
      },
      arlPlugin: {
        route: `${ingestBase}/display-names/arl`,
        enforcedOnThisServer: Boolean(arlAuthConfigured),
        requirements: [
          "Openplanet auth token in request body as opToken",
          "Fixed project identity: arl-player-directory",
          "Server-side ARL_OPENPLANET_AUTH_SECRET configuration",
        ],
        description: arlAuthConfigured
          ? "ARL authenticated ingest is enabled."
          : "ARL authenticated ingest exists, but the Openplanet auth secret is not configured on this instance.",
      },
    },
    contributionGuidelines: [
      "Use a stable projectKey, projectName, and sourceLabel so your data stays attributable.",
      "Send ISO timestamps when you know them. The aggregator will fall back to server receive time when needed.",
      "Prefer batch-oriented ingest where possible, and keep payloads focused on normalized facts rather than raw dumps.",
      "Treat the aggregator as a shared cache/directory. Upload identities, events, tracker checks, club snapshots, and traffic telemetry - not replay binaries.",
    ],
    clientRecipes: [
      {
        title: "Resolve account IDs to names",
        description:
          "Best for plugins and services that already know account IDs and want current display names from the shared cache.",
        endpoint: `${publicBase}/display-names`,
        example: `curl "${baseUrl}/display-names?accountId[]=01234567-89ab-cdef-0123-456789abcdef&limit=1"`,
      },
      {
        title: "Batch validate duplicate-name groups",
        description:
          "Best for ARL-style cleanup jobs that collect many account IDs from suspicious duplicate display-name groups and want one shared-cache check before falling back to Nadeo.",
        endpoint: `${publicBase}/display-names/resolve`,
        example:
          `curl -X POST "${baseUrl}/display-names/resolve" -H "Content-Type: application/json" -d "{\\"accountIds\\":[\\"01234567-89ab-cdef-0123-456789abcdef\\"],\\"maxAgeSeconds\\":15552000,\\"limit\\":50}"`,
      },
      {
        title: "Exact name to candidate account IDs",
        description:
          "Best for exact display-name lookups where the caller already has a specific player name, including names with spaces.",
        endpoint: `${publicBase}/display-names/by-name`,
        example: `curl "${baseUrl}/display-names/by-name?displayName[]=Foo%20Bar"`,
      },
      {
        title: "Partial or prefix-style name search",
        description:
          "Friendly search endpoint for client UIs that want prefix, contains, or fuzzy matching.",
        endpoint: `${publicBase}/display-names/search`,
        example: `curl "${baseUrl}/display-names/search?q=ar&mode=prefix&limit=20"`,
      },
      {
        title: "ARL authenticated display-name contribution",
        description:
          "Openplanet-backed ingest path for ARL-style plugins that share observed accountId/displayName pairs.",
        endpoint: `${ingestBase}/display-names/arl`,
        example:
          `curl -X POST "${ingestUrl}/display-names/arl" -H "Content-Type: application/json" -d "{\\"opToken\\":\\"<openplanet-token>\\",\\"projectKey\\":\\"arl-player-directory\\",\\"projectName\\":\\"Arbitrary Record Loader Player Directory\\",\\"sourceLabel\\":\\"arl-player-directory\\",\\"names\\":[{\\"accountId\\":\\"01234567-89ab-cdef-0123-456789abcdef\\",\\"displayName\\":\\"ar\\",\\"observedAt\\":\\"2026-04-20T12:00:00Z\\"}]}"`,
      },
    ],
    sections: [
      {
        id: "meta",
        title: "Meta and Discovery",
        description:
          "Start here to discover service metadata and the machine-readable API catalog.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/catalog`,
            summary: "Return the machine-readable API catalog used by the /api docs page.",
            responseExample: {
              service: "tracker-aggregator",
              baseUrls: {
                docs: docsBase,
                public: publicBase,
                ingest: ingestBase,
              },
            },
            example: `curl "${baseUrl}/catalog"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/meta`,
            summary: "Return service metadata and top-level summary counts.",
            responseExample: {
              service: "tracker-aggregator",
              summary: {
                projects: 12,
                maps: 1200,
                events: 42000,
              },
            },
            example: `curl "${baseUrl}/meta"`,
          }),
        ],
      },
      {
        id: "identity",
        title: "Identity / Display Names",
        description:
          "Shared player identity cache for accountId/displayName observations.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names`,
            summary: "Bulk resolve account IDs, or run the legacy q-based loose search.",
            query: [
              { name: "accountId[]", type: "string[]", description: "One or more Trackmania account IDs." },
              { name: "q", type: "string", description: "Loose contains-style search over display names and account IDs." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
              { name: "max_age_seconds", type: "number", description: "Mark rows as stale after this age." },
            ],
            responseExample: {
              names: [
                {
                  accountId: "01234567-89ab-cdef-0123-456789abcdef",
                  displayName: "ar",
                  normalizedDisplayName: "ar",
                  source: "arl-player-directory",
                  stale: false,
                  missing: false,
                },
              ],
              count: 1,
            },
            notes: [
              "When accountId[] is provided, results come back in the same order as the requested IDs.",
              "This route already supports broad q searches, but /display-names/search is the clearer alias for new clients.",
            ],
            example: `curl "${baseUrl}/display-names?accountId[]=01234567-89ab-cdef-0123-456789abcdef&limit=1"`,
          }),
          endpoint({
            method: "POST",
            path: `${publicBase}/display-names/resolve`,
            summary: "Batch resolve account IDs from a JSON body.",
            bodyExample: {
              accountIds: [
                "01234567-89ab-cdef-0123-456789abcdef",
                "11111111-2222-3333-4444-555555555555",
              ],
              maxAgeSeconds: 15552000,
              limit: 50,
            },
            responseExample: {
              names: [
                {
                  accountId: "01234567-89ab-cdef-0123-456789abcdef",
                  displayName: "ar",
                  normalizedDisplayName: "ar",
                  source: "arl-player-directory",
                  stale: false,
                  missing: false,
                },
              ],
              missing: ["11111111-2222-3333-4444-555555555555"],
              count: 1,
              requestedCount: 2,
              missingCount: 1,
            },
            notes: [
              "Use this for ARL duplicate validation and other workflows that need many accountId -> displayName checks at once.",
              "The POST batch route accepts up to 500 account IDs per request.",
              "Rows marked stale are still returned in names; clients can decide whether to fall back to Nadeo.",
              "missing contains requested account IDs that are valid but not currently cached.",
            ],
            example:
              `curl -X POST "${baseUrl}/display-names/resolve" -H "Content-Type: application/json" -d "{\\"accountIds\\":[\\"01234567-89ab-cdef-0123-456789abcdef\\"],\\"maxAgeSeconds\\":15552000}"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names/resolve/:accountId`,
            summary: "Resolve a single account ID to the current cached display name.",
            pathParams: [
              { name: "accountId", type: "string", description: "Trackmania account ID." },
            ],
            query: [
              { name: "max_age_seconds", type: "number", description: "Mark the returned row as stale after this age." },
            ],
            responseExample: {
              name: {
                accountId: "01234567-89ab-cdef-0123-456789abcdef",
                displayName: "ar",
                normalizedDisplayName: "ar",
                stale: false,
                missing: false,
              },
            },
            example: `curl "${baseUrl}/display-names/resolve/01234567-89ab-cdef-0123-456789abcdef"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names/by-name`,
            summary: "Return exact normalized display-name matches grouped by requested query.",
            query: [
              { name: "displayName[]", type: "string[]", description: "One or more exact display names." },
              { name: "name[]", type: "string[]", description: "Alias for displayName[]." },
              { name: "max_age_seconds", type: "number", description: "Mark rows as stale after this age." },
            ],
            responseExample: {
              queries: [
                {
                  displayName: "ar",
                  normalizedDisplayName: "ar",
                  matches: [
                    {
                      accountId: "01234567-89ab-cdef-0123-456789abcdef",
                      displayName: "ar",
                      normalizedDisplayName: "ar",
                      source: "arl-player-directory",
                      stale: false,
                      missing: false,
                    },
                  ],
                },
              ],
            },
            notes: [
              "Display names are treated as exact values after normalization.",
              "Names with spaces should be sent as repeated displayName[] values, not split on whitespace.",
            ],
            example: `curl "${baseUrl}/display-names/by-name?displayName[]=Foo%20Bar"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names/search`,
            summary: "Search display names with prefix, contains, or fuzzy matching.",
            query: [
              { name: "q", type: "string", description: "Search text. Required." },
              { name: "mode", type: "string", description: "prefix, contains, or fuzzy. Default contains." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 20." },
              { name: "max_age_seconds", type: "number", description: "Mark rows as stale after this age." },
            ],
            responseExample: {
              query: "ar",
              mode: "prefix",
              matches: [
                {
                  accountId: "01234567-89ab-cdef-0123-456789abcdef",
                  displayName: "ar",
                  normalizedDisplayName: "ar",
                  source: "arl-player-directory",
                  stale: false,
                  missing: false,
                  score: 1,
                },
              ],
              count: 1,
            },
            notes: [
              "Use mode=prefix for fast player-picker style matching.",
              "Use mode=contains for loose substring search.",
              "Use mode=fuzzy for typo-tolerant matching with a simple score field.",
              `Fuzzy mode evaluates the freshest ${FUZZY_SEARCH_REFERENCE_LIMIT} cached names first, rather than scanning the entire history.`,
            ],
            example: `curl "${baseUrl}/display-names/search?q=ar&mode=prefix&limit=20"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names/candidates`,
            summary: "Return account IDs that are due for refresh or are missing recent names.",
            query: [
              { name: "stale_after_seconds", type: "number", description: "How old is considered stale. Default 86400." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
            ],
            example: `curl "${baseUrl}/display-names/candidates?stale_after_seconds=86400&limit=50"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/display-names/candidates/details`,
            summary: "Return richer candidate rows for refresh workflows.",
            query: [
              { name: "stale_after_seconds", type: "number", description: "How old is considered stale. Default 86400." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
              { name: "offset", type: "number", description: "Offset for pagination. Default 0." },
            ],
            example: `curl "${baseUrl}/display-names/candidates/details?limit=50&offset=0"`,
          }),
        ],
      },
      {
        id: "projects",
        title: "Projects and Maps",
        description:
          "Shared project-level metadata, tracked maps, and instance state.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/projects`,
            summary: "List known projects in the aggregator.",
            query: [{ name: "limit", type: "number", description: "Maximum rows to return. Default 120." }],
            example: `curl "${baseUrl}/projects?limit=50"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/projects/:projectKey`,
            summary: "Return one project summary by key.",
            pathParams: [{ name: "projectKey", type: "string", description: "Stable project key." }],
            example: `curl "${baseUrl}/projects/arl-player-directory"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/projects/:projectKey/maps`,
            summary: "List maps tracked by a project.",
            pathParams: [{ name: "projectKey", type: "string", description: "Stable project key." }],
            query: [
              { name: "q", type: "string", description: "Filter by map UID or map name." },
              { name: "changed_only", type: "boolean", description: "Only include changed maps." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 500." },
            ],
            example: `curl "${baseUrl}/projects/prod-tracker-main/maps?changed_only=1&limit=100"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/projects/:projectKey/instances`,
            summary: "List known instances for a project.",
            pathParams: [{ name: "projectKey", type: "string", description: "Stable project key." }],
            query: [{ name: "limit", type: "number", description: "Maximum rows to return. Default 120." }],
            example: `curl "${baseUrl}/projects/prod-tracker-main/instances"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/maps/:mapUid/projects`,
            summary: "Show which projects know about a specific map UID.",
            pathParams: [{ name: "mapUid", type: "string", description: "Trackmania map UID." }],
            query: [{ name: "limit", type: "number", description: "Maximum rows to return. Default 120." }],
            example: `curl "${baseUrl}/maps/abc123/projects"`,
          }),
        ],
      },
      {
        id: "events",
        title: "Events and Metrics",
        description:
          "Recent events, facets, queues, and metrics for dashboards or automation.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/events/recent`,
            summary: "List recent aggregator events with filtering and pagination.",
            query: [
              { name: "page", type: "number", description: "1-based page. Default 1." },
              { name: "limit", type: "number", description: "Page size. Default 80." },
              { name: "project_key", type: "string", description: "Filter by project." },
              { name: "source", type: "string", description: "Filter by source label." },
              { name: "event_type", type: "string", description: "Filter by event type." },
              { name: "changed_only", type: "boolean", description: "Only changed events." },
              { name: "include_system", type: "boolean", description: "Include system events." },
              { name: "from_iso", type: "string", description: "Inclusive ISO timestamp lower bound." },
              { name: "to_iso", type: "string", description: "Inclusive ISO timestamp upper bound." },
              { name: "q", type: "string", description: "Loose search text." },
            ],
            example: `curl "${baseUrl}/events/recent?project_key=prod-tracker-main&limit=25"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/events/facets`,
            summary: "Return source and event-type facet buckets for the current filter window.",
            query: [
              { name: "project_key", type: "string", description: "Filter by project." },
              { name: "include_system", type: "boolean", description: "Include system events." },
              { name: "from_iso", type: "string", description: "Inclusive ISO timestamp lower bound." },
              { name: "to_iso", type: "string", description: "Inclusive ISO timestamp upper bound." },
            ],
            example: `curl "${baseUrl}/events/facets?project_key=prod-tracker-main"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/queue/wr-baseline`,
            summary: "Inspect the WR baseline queue with paging and filters.",
            query: [
              { name: "page", type: "number", description: "1-based page. Default 1." },
              { name: "limit", type: "number", description: "Page size. Default 100." },
              { name: "status", type: "string", description: "Queue status filter. Default queued." },
              { name: "project_key", type: "string", description: "Filter by project." },
              { name: "q", type: "string", description: "Loose search text." },
            ],
            example: `curl "${baseUrl}/queue/wr-baseline?status=queued&limit=50"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/metrics/overview`,
            summary: "High-level metrics snapshot for dashboards or health checks.",
            example: `curl "${baseUrl}/metrics/overview"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/metrics/timeseries`,
            summary: "Return time-bucketed metrics series.",
            query: [
              { name: "bucket", type: "string", description: "hour or day. Default hour." },
              { name: "window_hours", type: "number", description: "Look-back window. Default 168." },
              { name: "project_key", type: "string", description: "Optional project filter." },
            ],
            example: `curl "${baseUrl}/metrics/timeseries?bucket=day&window_hours=720"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/metrics/leaderboards/coverage`,
            summary: "Return leaderboard coverage summary from the leaderboard tracker.",
            query: [
              { name: "tracked_only", type: "boolean", description: "Whether to scope to tracked maps only. Default true." },
              { name: "timeout_ms", type: "number", description: "Request timeout for the upstream call. Default 15000." },
            ],
            example: `curl "${baseUrl}/metrics/leaderboards/coverage?tracked_only=1"`,
          }),
        ],
      },
      {
        id: "clubs",
        title: "Club Snapshots",
        description:
          "Read club summaries, campaigns, maps, and members from shared club snapshots.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/clubs/:clubId/summary`,
            summary: "Return one club summary.",
            pathParams: [{ name: "clubId", type: "string", description: "Trackmania club ID." }],
            example: `curl "${baseUrl}/clubs/24231/summary"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/clubs/:clubId/campaigns`,
            summary: "List known campaigns for a club.",
            pathParams: [{ name: "clubId", type: "string", description: "Trackmania club ID." }],
            query: [{ name: "limit", type: "number", description: "Maximum rows to return. Default 200." }],
            example: `curl "${baseUrl}/clubs/24231/campaigns?limit=100"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/clubs/:clubId/maps`,
            summary: "List club maps with optional text filtering.",
            pathParams: [{ name: "clubId", type: "string", description: "Trackmania club ID." }],
            query: [
              { name: "q", type: "string", description: "Filter by map name or UID." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 500." },
            ],
            example: `curl "${baseUrl}/clubs/24231/maps?q=summer&limit=50"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/clubs/:clubId/members`,
            summary: "List club members with optional text filtering.",
            pathParams: [{ name: "clubId", type: "string", description: "Trackmania club ID." }],
            query: [
              { name: "q", type: "string", description: "Filter by display name or account ID." },
              { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
            ],
            example: `curl "${baseUrl}/clubs/24231/members?limit=25"`,
          }),
        ],
      },
      {
        id: "database",
        title: "Database Explorer",
        description:
          "Low-level table inspection for debugging and internal tooling.",
        endpoints: [
          endpoint({
            method: "GET",
            path: `${publicBase}/db/tables`,
            summary: "List queryable tables, optionally with row counts.",
            query: [{ name: "include_counts", type: "boolean", description: "Include table row counts. Default true." }],
            example: `curl "${baseUrl}/db/tables?include_counts=1"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/db/tables/:table/schema`,
            summary: "Return schema information for a table.",
            pathParams: [{ name: "table", type: "string", description: "Table name." }],
            example: `curl "${baseUrl}/db/tables/account_display_name_current/schema"`,
          }),
          endpoint({
            method: "GET",
            path: `${publicBase}/db/tables/:table/rows`,
            summary: "Return paged table rows with configurable sort.",
            pathParams: [{ name: "table", type: "string", description: "Table name." }],
            query: [
              { name: "limit", type: "number", description: "Maximum rows to return. Default 50." },
              { name: "offset", type: "number", description: "Row offset. Default 0." },
              { name: "sort_by", type: "string", description: "Sort column." },
              { name: "sort_dir", type: "string", description: "asc or desc. Default desc." },
            ],
            example: `curl "${baseUrl}/db/tables/account_display_name_current/rows?limit=25&sort_by=observed_at&sort_dir=desc"`,
          }),
        ],
      },
      {
        id: "ingest",
        title: "Contribution / Ingest",
        description:
          "Write endpoints for projects contributing shared data back into the aggregator.",
        endpoints: [
          endpoint({
            method: "POST",
            path: `${ingestBase}/tracker-run`,
            summary: "Ingest one tracker run payload with checks and WR deltas.",
            auth: "token",
            bodyExample: {
              projectKey: "prod-tracker-main",
              projectName: "Prod Tracker Main",
              sourceLabel: "prod",
              run: {
                provider: "nadeo-live",
                reason: "scheduled",
                startedAt: "2026-04-20T12:00:00.000Z",
                finishedAt: "2026-04-20T12:00:05.000Z",
                mapsConsidered: 25,
                mapsChecked: 25,
                wrChanges: 2,
              },
              checks: [
                {
                  mapUid: "abc123",
                  mapName: "My Map",
                  checkedAt: "2026-04-20T12:00:02.000Z",
                  changed: true,
                  oldWrTime: 65234,
                  newWrTime: 65180,
                },
              ],
            },
            example:
              `curl -X POST "${ingestUrl}/tracker-run" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/tracker-runs`,
            summary: "Alias for tracker-run.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/tracker-runs" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/instance/register`,
            summary: "Register a project instance with the aggregator.",
            auth: "token",
            bodyExample: {
              projectKey: "prod-tracker-main",
              projectName: "Prod Tracker Main",
              sourceLabel: "prod",
              instanceId: "prod-tracker-main",
              instanceName: "Prod Tracker Main",
            },
            example:
              `curl -X POST "${ingestUrl}/instance/register" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/instance/heartbeat`,
            summary: "Heartbeat an existing project instance.",
            auth: "token",
            bodyExample: {
              projectKey: "prod-tracker-main",
              instanceId: "prod-tracker-main",
            },
            example:
              `curl -X POST "${ingestUrl}/instance/heartbeat" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/display-names`,
            summary: "Ingest observed accountId/displayName pairs from any project.",
            auth: "token",
            bodyExample: {
              projectKey: "custom-player-cache",
              projectName: "Custom Player Cache",
              sourceLabel: "custom",
              observedAt: "2026-04-20T12:00:00Z",
              names: [
                {
                  accountId: "01234567-89ab-cdef-0123-456789abcdef",
                  displayName: "ar",
                  observedAt: "2026-04-20T12:00:00Z",
                },
              ],
            },
            example:
              `curl -X POST "${ingestUrl}/display-names" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
            notes: [
              "The aggregator rejects shared identity rows that normalize to source-artifact labels such as accountId, zoneId, groupUid, mapId, mapUid, seasonId, personal best labels, or known platform labels.",
              "Rejected rows are reported in the ingest response and are not written to the shared directory.",
            ],
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/display-names/arl`,
            summary: "Authenticated Openplanet ingest path for ARL-style display-name contributions.",
            auth: "arl",
            bodyExample: {
              opToken: "<openplanet-token>",
              projectKey: "arl-player-directory",
              projectName: "Arbitrary Record Loader Player Directory",
              sourceLabel: "arl-player-directory",
              observedAt: "2026-04-20T12:00:00Z",
              names: [
                {
                  accountId: "01234567-89ab-cdef-0123-456789abcdef",
                  displayName: "ar",
                  observedAt: "2026-04-20T12:00:00Z",
                },
              ],
            },
            example:
              `curl -X POST "${ingestUrl}/display-names/arl" -H "Content-Type: application/json" -d "{...}"`,
            notes: [
              "This endpoint does not use the standard ingest token middleware.",
              "It validates the provided Openplanet token against the server-side ARL auth secret.",
              "The same shared display-name hygiene checks are applied before rows are stored.",
            ],
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/club-snapshot`,
            summary: "Ingest a club/campaign/upload snapshot payload.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/club-snapshot" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/event`,
            summary: "Ingest a single custom event payload.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/event" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/events`,
            summary: "Ingest one or more custom event payloads.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/events" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/traffic`,
            summary: "Ingest a single HTTP traffic sample.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/traffic" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
          endpoint({
            method: "POST",
            path: `${ingestBase}/traffic/batch`,
            summary: "Ingest one or more HTTP traffic samples.",
            auth: "token",
            example:
              `curl -X POST "${ingestUrl}/traffic/batch" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
          }),
        ],
      },
    ],
  };
}

export { createApiCatalog };
