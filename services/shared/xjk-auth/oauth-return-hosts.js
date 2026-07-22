import { XJK_SITES } from "../../../sites/shared/xjk-core/site-registry.js";

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host || host.includes("/") || host.includes("\\") || host.includes("@") || host.includes(":")) return "";
  return host;
}

function localAliasHost(alias) {
  return normalizeHost(typeof alias === "string" ? alias : alias?.host);
}

export function canonicalXjkOauthReturnHosts({ sites = XJK_SITES, includePrivate = true } = {}) {
  const hosts = new Set();
  for (const site of sites) {
    if (!includePrivate && !site.public) continue;
    const candidates = [
      site.host,
      ...(site.hostAliases || []),
      site.localSubdomain ? `${site.localSubdomain}.localhost` : "",
      ...(site.localHostAliases || []).map(localAliasHost),
    ];
    for (const candidate of candidates) {
      const host = normalizeHost(candidate);
      if (host) hosts.add(host);
    }
  }
  return [...hosts];
}

export function buildXjkOauthReturnHosts(additionalHosts = []) {
  const hosts = new Set(canonicalXjkOauthReturnHosts());
  for (const candidate of additionalHosts) {
    const host = normalizeHost(candidate);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export function localPathPrefixForXjkHost(hostname, { sites = XJK_SITES } = {}) {
  const host = normalizeHost(hostname);
  if (!host) return null;
  for (const site of sites) {
    const sitePrefix = String(site.localPathPrefix || "");
    if (host === normalizeHost(site.localSubdomain ? `${site.localSubdomain}.localhost` : "")) return sitePrefix;
    for (const alias of site.localHostAliases || []) {
      if (host !== localAliasHost(alias)) continue;
      return String(
        typeof alias === "object" && alias?.localPathPrefix !== undefined ? alias.localPathPrefix : sitePrefix
      );
    }
  }
  return null;
}

export const DEFAULT_XJK_AUTH_ALLOWED_RETURN_HOSTS = Object.freeze(canonicalXjkOauthReturnHosts());
