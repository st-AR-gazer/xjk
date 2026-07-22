import { aggregatorResponseFactories } from "./aggregatorResponses.js";
import { alterationResponseFactories } from "./alterationResponses.js";
import { catalogResponseFactories } from "./catalogResponses.js";
import { clubResponseFactories } from "./clubResponses.js";
import { hubResponseFactories } from "./hubResponses.js";
import { mapResponseFactories } from "./mapResponses.js";
import { createOkResponse } from "./response.js";
import { webhookResponseFactories } from "./webhookResponses.js";

const responseFactories = new Map(
  Object.entries({
    ...catalogResponseFactories,
    ...mapResponseFactories,
    ...alterationResponseFactories,
    ...clubResponseFactories,
    ...hubResponseFactories,
    ...aggregatorResponseFactories,
    ...webhookResponseFactories,
  })
);

function getDefaultExampleResponses(endpoint) {
  const factory = responseFactories.get(endpoint?.key);
  return factory ? factory() : createOkResponse("OK", { ok: true });
}

export { getDefaultExampleResponses };
