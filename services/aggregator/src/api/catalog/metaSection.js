import { endpoint } from "./support.js";

function createMetaSection({ docsBase, publicBase, ingestBase, baseUrl }) {
  return {
    id: "meta",
    title: "Meta and Discovery",
    description: "Start here to discover service metadata and the machine-readable API catalog.",
    endpoints: [
      endpoint({
        method: "GET",
        path: `${publicBase}/catalog`,
        summary: "Return the machine-readable API catalog used by the /api docs page.",
        responseExample: {
          service: "tracker-aggregator",
          baseUrls: { docs: docsBase, public: publicBase, ingest: ingestBase },
        },
        example: `curl "${baseUrl}/catalog"`,
      }),
      endpoint({
        method: "GET",
        path: `${publicBase}/meta`,
        summary: "Return service metadata and top-level summary counts.",
        responseExample: {
          service: "tracker-aggregator",
          summary: { projects: 12, maps: 1200, events: 42000 },
        },
        example: `curl "${baseUrl}/meta"`,
      }),
    ],
  };
}

export { createMetaSection };
