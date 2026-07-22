const SENSITIVE_QUERY_KEY = /(?:token|secret|password|authorization|api[-_]?key)/i;

function resolveAggregatorAccessEnvironment(environment = {}) {
  return {
    ingestToken: String(environment.AGGREGATOR_INGEST_TOKEN || "").trim(),
    dashAdminToken: String(environment.DASH_ADMIN_TOKEN || "").trim(),
    allowInsecureOpen: String(environment.AGGREGATOR_ALLOW_INSECURE_OPEN || "").trim() === "1",
  };
}

function assertAggregatorAccessConfigured({ ingestToken, dashAdminToken, allowInsecureOpen = false } = {}) {
  if (allowInsecureOpen) return;

  const missing = [];
  if (!String(ingestToken || "").trim()) missing.push("AGGREGATOR_INGEST_TOKEN");
  if (!String(dashAdminToken || "").trim()) missing.push("DASH_ADMIN_TOKEN");
  if (!missing.length) return;

  throw new Error(
    `Aggregator authentication is incomplete: ${missing.join(", ")}. ` +
      "Configure both secrets or explicitly set AGGREGATOR_ALLOW_INSECURE_OPEN=1 for an isolated local environment."
  );
}

function redactSensitiveUrl(value) {
  const raw = String(value || "");
  const queryIndex = raw.indexOf("?");
  if (queryIndex < 0) return raw;

  const pathname = raw.slice(0, queryIndex);
  const params = new URLSearchParams(raw.slice(queryIndex + 1));
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) params.set(key, "[redacted]");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export { assertAggregatorAccessConfigured, redactSensitiveUrl, resolveAggregatorAccessEnvironment };
