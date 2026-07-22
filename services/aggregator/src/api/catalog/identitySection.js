import { endpoint } from "./support.js";

const FUZZY_SEARCH_REFERENCE_LIMIT = 5000;

function createIdentitySection({ publicBase, baseUrl }) {
  return {
    id: "identity",
    title: "Identity / Display Names",
    description: "Shared player identity cache for accountId/displayName observations.",
    endpoints: [
      endpoint({
        method: "GET",
        path: `${publicBase}/display-names`,
        summary: "Bulk resolve account IDs, or run the legacy q-based loose search.",
        query: [
          { name: "accountId[]", type: "string[]", description: "One or more Trackmania account IDs." },
          {
            name: "q",
            type: "string",
            description: "Loose contains-style search over display names and account IDs.",
          },
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
          accountIds: ["01234567-89ab-cdef-0123-456789abcdef", "11111111-2222-3333-4444-555555555555"],
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
        example: `curl -X POST "${baseUrl}/display-names/resolve" -H "Content-Type: application/json" -d "{\\"accountIds\\":[\\"01234567-89ab-cdef-0123-456789abcdef\\"],\\"maxAgeSeconds\\":15552000}"`,
      }),
      endpoint({
        method: "GET",
        path: `${publicBase}/display-names/resolve/:accountId`,
        summary: "Resolve a single account ID to the current cached display name.",
        pathParams: [{ name: "accountId", type: "string", description: "Trackmania account ID." }],
        query: [
          {
            name: "max_age_seconds",
            type: "number",
            description: "Mark the returned row as stale after this age.",
          },
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
          {
            name: "stale_after_seconds",
            type: "number",
            description: "How old is considered stale. Default 86400.",
          },
          { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
        ],
        example: `curl "${baseUrl}/display-names/candidates?stale_after_seconds=86400&limit=50"`,
      }),
      endpoint({
        method: "GET",
        path: `${publicBase}/display-names/candidates/details`,
        summary: "Return richer candidate rows for refresh workflows.",
        query: [
          {
            name: "stale_after_seconds",
            type: "number",
            description: "How old is considered stale. Default 86400.",
          },
          { name: "limit", type: "number", description: "Maximum rows to return. Default 200." },
          { name: "offset", type: "number", description: "Offset for pagination. Default 0." },
        ],
        example: `curl "${baseUrl}/display-names/candidates/details?limit=50&offset=0"`,
      }),
    ],
  };
}

export { createIdentitySection };
