import { endpoint } from "./support.js";

function createProjectSection({ publicBase, baseUrl }) {
  return {
    id: "projects",
    title: "Projects and Maps",
    description: "Shared project-level metadata, tracked maps, and instance state.",
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
  };
}

function createEventSection({ publicBase, baseUrl }) {
  return {
    id: "events",
    title: "Events and Metrics",
    description: "Recent events, facets, queues, and metrics for dashboards or automation.",
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
          {
            name: "tracked_only",
            type: "boolean",
            description: "Whether to scope to tracked maps only. Default true.",
          },
          {
            name: "timeout_ms",
            type: "number",
            description: "Request timeout for the upstream call. Default 15000.",
          },
        ],
        example: `curl "${baseUrl}/metrics/leaderboards/coverage?tracked_only=1"`,
      }),
    ],
  };
}

export { createEventSection, createProjectSection };
