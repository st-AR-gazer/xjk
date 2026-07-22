function normalizeCredential(value) {
  return String(value || "").trim();
}

function assertMatchingCredentials(leftValue, rightValue, leftLabel, rightLabel) {
  if (leftValue && rightValue && leftValue !== rightValue) {
    throw new Error(`${leftLabel} and ${rightLabel} must contain the same shared credential.`);
  }
}

function resolveCredentialPair(environment, primaryKey, peerKey, fallbackEnvironment = {}) {
  const primaryValue = normalizeCredential(environment?.[primaryKey]);
  const peerValue = normalizeCredential(environment?.[peerKey]);
  const fallbackPrimaryValue = normalizeCredential(fallbackEnvironment?.[primaryKey]);
  const fallbackPeerValue = normalizeCredential(fallbackEnvironment?.[peerKey]);

  assertMatchingCredentials(primaryValue, peerValue, primaryKey, peerKey);
  assertMatchingCredentials(fallbackPrimaryValue, fallbackPeerValue, `fallback ${primaryKey}`, `fallback ${peerKey}`);
  assertMatchingCredentials(primaryValue, fallbackPeerValue, primaryKey, `fallback ${peerKey}`);
  assertMatchingCredentials(peerValue, fallbackPrimaryValue, peerKey, `fallback ${primaryKey}`);

  const value = primaryValue || peerValue || fallbackPrimaryValue || fallbackPeerValue;
  return { [primaryKey]: value, [peerKey]: value };
}

function resolveAlteredInternalCredentialEnvironment(environment = {}, fallbackEnvironment = {}) {
  return resolveCredentialPair(
    environment,
    "ALTERED_INTERNAL_TOKEN",
    "DASH_ALTERED_INTERNAL_TOKEN",
    fallbackEnvironment
  );
}

function resolveTrackerAdminCredentialEnvironment(environment = {}, fallbackEnvironment = {}) {
  return resolveCredentialPair(environment, "TRACKER_ADMIN_TOKEN", "DASH_TRACKER_ADMIN_TOKEN", fallbackEnvironment);
}

function resolveWrWebhookCredentialEnvironment(environment = {}, fallbackEnvironment = {}) {
  return resolveCredentialPair(
    environment,
    "ALTERED_WR_WEBHOOK_SECRET",
    "TRACKER_WR_WEBHOOK_SECRET",
    fallbackEnvironment
  );
}

function resolveAggregatorUpstreamCredentialEnvironment(environment = {}, fallbackEnvironment = {}) {
  return {
    ...resolveAlteredInternalCredentialEnvironment(environment, fallbackEnvironment),
    ...resolveTrackerAdminCredentialEnvironment(environment, fallbackEnvironment),
  };
}

module.exports = {
  resolveAggregatorUpstreamCredentialEnvironment,
  resolveAlteredInternalCredentialEnvironment,
  resolveTrackerAdminCredentialEnvironment,
  resolveWrWebhookCredentialEnvironment,
};
