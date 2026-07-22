import { createOkResponse } from "./response.js";

const catalogResponseFactories = {
  "public-api-catalog": () =>
    createOkResponse("Catalog", {
      generatedAt: "2026-03-14T18:00:00.000Z",
      api: { name: "Altered Public API", version: "v1", totalEndpoints: 28 },
      endpoints: ["..."],
    }),
};

export { catalogResponseFactories };
