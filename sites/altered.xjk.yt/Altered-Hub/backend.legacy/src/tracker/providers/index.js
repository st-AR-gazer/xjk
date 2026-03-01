import { NoopTrackerProvider } from "./noopProvider.js";
import { SimulatedTrackerProvider } from "./simulatedProvider.js";

function createTrackerProvider({ providerName, changeChance }) {
  const name = String(providerName || "simulated").trim().toLowerCase();
  if (name === "noop") {
    return new NoopTrackerProvider();
  }
  return new SimulatedTrackerProvider({ changeChance });
}

export { createTrackerProvider };
