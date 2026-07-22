import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const deniedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  deniedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  deniedAddresses.addSubnet(network, prefix, "ipv6");
}

class HttpEgressPolicyError extends Error {
  constructor(message, code = "unsafe_egress_destination") {
    super(message);
    this.name = "HttpEgressPolicyError";
    this.code = code;
  }
}

function normalizedHostname(value) {
  return String(value || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function normalizedHostSet(values = []) {
  return new Set((Array.isArray(values) ? values : [values]).map(normalizedHostname).filter(Boolean));
}

function normalizedOriginSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => {
        try {
          return new URL(String(value || "")).origin.toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
}

function hostnameAllowed(hostname, { allowedHosts = [], allowedHostSuffixes = [] } = {}) {
  const normalized = normalizedHostname(hostname);
  const exactHosts = normalizedHostSet(allowedHosts);
  const suffixes = normalizedHostSet(allowedHostSuffixes);
  if (exactHosts.size === 0 && suffixes.size === 0) return true;
  if (exactHosts.has(normalized)) return true;
  return [...suffixes].some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

function parsePublicHttpUrl(value, options = {}) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(String(value || ""));
  } catch {
    throw new HttpEgressPolicyError("Egress URL is invalid.", "invalid_egress_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpEgressPolicyError(`Egress protocol is not allowed: ${url.protocol || "<missing>"}`);
  }
  if (url.username || url.password) {
    throw new HttpEgressPolicyError("Egress URLs must not contain credentials.");
  }
  const hostname = normalizedHostname(url.hostname);
  if (!hostname) throw new HttpEgressPolicyError("Egress URL is missing a hostname.");
  if (["localhost", "localhost.localdomain"].includes(hostname) || hostname.endsWith(".localhost")) {
    throw new HttpEgressPolicyError(`Egress hostname is local: ${hostname}`);
  }
  if (isIP(hostname) && !addressIsPublic(hostname)) {
    throw new HttpEgressPolicyError(`Egress hostname is a non-public address: ${hostname}`);
  }
  if (!hostnameAllowed(hostname, options)) {
    throw new HttpEgressPolicyError(`Egress hostname is not allowlisted: ${hostname}`);
  }
  const allowedOrigins = normalizedOriginSet(options.allowedOrigins);
  if (allowedOrigins.size > 0 && !allowedOrigins.has(url.origin.toLowerCase())) {
    throw new HttpEgressPolicyError(`Egress origin is not allowlisted: ${url.origin}`);
  }
  return url;
}

function addressIsPublic(value) {
  const address = normalizedHostname(value);
  const family = isIP(address);
  if (!family) return false;
  return !deniedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

async function resolveHostAddresses(hostname, lookup = dnsLookup) {
  const normalized = normalizedHostname(hostname);
  if (isIP(normalized)) return [normalized];

  const result = await lookup(normalized, { all: true, verbatim: true });
  const records = Array.isArray(result) ? result : [result];
  return [...new Set(records.map((record) => normalizedHostname(record?.address || record)).filter(Boolean))];
}

async function assertPublicHttpUrl(value, { lookup = dnsLookup, ...options } = {}) {
  const url = parsePublicHttpUrl(value, options);
  let addresses;
  try {
    addresses = await resolveHostAddresses(url.hostname, lookup);
  } catch (error) {
    throw new HttpEgressPolicyError(
      `Egress hostname could not be resolved: ${normalizedHostname(url.hostname)}`,
      error?.code || "egress_dns_failed"
    );
  }
  if (addresses.length === 0) {
    throw new HttpEgressPolicyError(`Egress hostname has no addresses: ${normalizedHostname(url.hostname)}`);
  }
  const blockedAddress = addresses.find((address) => !addressIsPublic(address));
  if (blockedAddress) {
    throw new HttpEgressPolicyError(`Egress hostname resolved to a non-public address: ${blockedAddress}`);
  }
  return url;
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {}
}

async function fetchPublicHttp(
  value,
  {
    fetchImpl = fetch,
    lookup = dnsLookup,
    allowedHosts = [],
    allowedHostSuffixes = [],
    allowedOrigins = [],
    maxRedirects = 5,
    ...options
  } = {}
) {
  const safeMaxRedirects = Math.max(0, Math.min(10, Math.floor(Number(maxRedirects) || 0)));
  let currentUrl = value;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const url = await assertPublicHttpUrl(currentUrl, {
      allowedHosts,
      allowedHostSuffixes,
      allowedOrigins,
      lookup,
    });
    const response = await fetchImpl(url.toString(), { ...options, redirect: "manual" });
    if (!redirectStatuses.has(Number(response?.status || 0))) return { response, url };

    const location = String(response.headers?.get?.("location") || "").trim();
    if (!location) return { response, url };
    if (redirectCount >= safeMaxRedirects) {
      await cancelResponseBody(response);
      throw new HttpEgressPolicyError("Egress request exceeded the redirect limit.", "egress_redirect_limit");
    }

    await cancelResponseBody(response);
    currentUrl = new URL(location, url);
  }
}

export {
  addressIsPublic,
  assertPublicHttpUrl,
  fetchPublicHttp,
  hostnameAllowed,
  HttpEgressPolicyError,
  parsePublicHttpUrl,
};
