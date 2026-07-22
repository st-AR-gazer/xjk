import { endpoint } from "./support.js";

function createClubSection({ publicBase, baseUrl }) {
  return {
    id: "clubs",
    title: "Club Snapshots",
    description: "Read club summaries, campaigns, maps, and members from shared club snapshots.",
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
  };
}

function createDatabaseSection({ publicBase, baseUrl }) {
  return {
    id: "database",
    title: "Database Explorer",
    description: "Low-level table inspection for debugging and internal tooling.",
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
  };
}

export { createClubSection, createDatabaseSection };
