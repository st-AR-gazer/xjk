function resolveAggregatorAccessEnvironment(environment = {}) {
  return {
    AGGREGATOR_INGEST_TOKEN: String(environment.AGGREGATOR_INGEST_TOKEN || "").trim(),
    DASH_ADMIN_TOKEN: String(environment.DASH_ADMIN_TOKEN || "").trim(),
    AGGREGATOR_ALLOW_INSECURE_OPEN: String(environment.AGGREGATOR_ALLOW_INSECURE_OPEN || "").trim(),
  };
}

module.exports = { resolveAggregatorAccessEnvironment };
