import { createClubSection, createDatabaseSection } from "./catalog/clubDatabaseSections.js";
import { createIdentitySection } from "./catalog/identitySection.js";
import { createIngestSection } from "./catalog/ingestSection.js";
import { createMetaSection } from "./catalog/metaSection.js";
import { createEventSection, createProjectSection } from "./catalog/projectEventSections.js";
import { createClientRecipes } from "./catalog/recipes.js";
import { withOrigin } from "./catalog/support.js";

function createApiCatalog({ origin = "", ingestTokenConfigured = false, arlAuthConfigured = false } = {}) {
  const docsBase = "/api/";
  const publicBase = "/api/v1";
  const ingestBase = "/api/v1/ingest";
  const baseUrl = withOrigin(origin, publicBase);
  const ingestUrl = withOrigin(origin, ingestBase);
  const context = { docsBase, publicBase, ingestBase, baseUrl, ingestUrl };

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
        acceptedHeaders: ["x-ingest-token: <token>", "Authorization: Bearer <token>", "x-admin-token: <token>"],
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
    clientRecipes: createClientRecipes(context),
    sections: [
      createMetaSection(context),
      createIdentitySection(context),
      createProjectSection(context),
      createEventSection(context),
      createClubSection(context),
      createDatabaseSection(context),
      createIngestSection(context),
    ],
  };
}

export { createApiCatalog };
