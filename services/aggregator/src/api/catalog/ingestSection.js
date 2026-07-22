import { endpoint } from "./support.js";

function createIngestSection({ ingestBase, ingestUrl }) {
  return {
    id: "ingest",
    title: "Contribution / Ingest",
    description: "Write endpoints for projects contributing shared data back into the aggregator.",
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
        example: `curl -X POST "${ingestUrl}/tracker-run" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/tracker-runs`,
        summary: "Alias for tracker-run.",
        auth: "token",
        example: `curl -X POST "${ingestUrl}/tracker-runs" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
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
        example: `curl -X POST "${ingestUrl}/instance/register" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/instance/heartbeat`,
        summary: "Heartbeat an existing project instance.",
        auth: "token",
        bodyExample: { projectKey: "prod-tracker-main", instanceId: "prod-tracker-main" },
        example: `curl -X POST "${ingestUrl}/instance/heartbeat" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
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
        example: `curl -X POST "${ingestUrl}/display-names" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
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
        example: `curl -X POST "${ingestUrl}/display-names/arl" -H "Content-Type: application/json" -d "{...}"`,
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
        example: `curl -X POST "${ingestUrl}/club-snapshot" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/event`,
        summary: "Ingest a single custom event payload.",
        auth: "token",
        example: `curl -X POST "${ingestUrl}/event" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/events`,
        summary: "Ingest one or more custom event payloads.",
        auth: "token",
        example: `curl -X POST "${ingestUrl}/events" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/traffic`,
        summary: "Ingest a single HTTP traffic sample.",
        auth: "token",
        example: `curl -X POST "${ingestUrl}/traffic" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
      endpoint({
        method: "POST",
        path: `${ingestBase}/traffic/batch`,
        summary: "Ingest one or more HTTP traffic samples.",
        auth: "token",
        example: `curl -X POST "${ingestUrl}/traffic/batch" -H "Content-Type: application/json" -H "x-ingest-token: <token>" -d "{...}"`,
      }),
    ],
  };
}

export { createIngestSection };
