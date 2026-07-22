import { createJsonResponse } from "./response.js";

const webhookResponseFactories = {
  "request-update": () => [
    createJsonResponse(200, "Queued", {
      ok: true,
      request: {
        requestId: 42,
        mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        mapName: "Fall 2024 - 08 Cleaned",
        status: "queued",
        createdAt: "2026-03-15T12:00:00.000Z",
      },
    }),
    createJsonResponse(400, "Invalid", { error: "mapUid is required." }),
  ],
  "wr-webhook": () => [
    createJsonResponse(200, "Accepted", {
      ok: true,
      event: {
        mapUid: "ixgRz0phSb2_luKbkuFu7PK0Iea",
        mapName: "Fall 2024 - 08 Cleaned",
        accountId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        holder: "Example Player",
        wrMs: 54321,
        recordedAt: "2026-03-10T18:30:00.000Z",
      },
    }),
    createJsonResponse(401, "Unauthorized", { error: "Unauthorized" }),
  ],
};

export { webhookResponseFactories };
