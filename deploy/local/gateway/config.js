import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIRECTORY, "..", "..", "..");
const PLATFORM_MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "config", "platform-manifest.json"), "utf8"));
const SERVICES_BY_ID = new Map(PLATFORM_MANIFEST.services.map((service) => [service.id, service]));

function localServicePort(serviceId, environmentVariable = "") {
  const service = SERVICES_BY_ID.get(serviceId);
  if (!service) throw new Error(`Unknown platform service: ${serviceId}`);
  const variableName = environmentVariable || service.ports.localEnvironmentVariable;
  return Number(process.env[variableName] || service.ports.local);
}

function productionServicePort(serviceId) {
  const service = SERVICES_BY_ID.get(serviceId);
  if (!service) throw new Error(`Unknown platform service: ${serviceId}`);
  return Number(service.ports.production);
}

function parseRemoteOrigin(rawOrigin) {
  if (!rawOrigin) return null;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

const PORT = Number(process.env.LOCAL_GATEWAY_PORT || PLATFORM_MANIFEST.infrastructure.localGateway.port);
const HUB_PORT = localServicePort("tools-hub");
const PLUGINS_HUB_PORT = localServicePort("plugins-hub");
const LEARN_PROFILE_PORT = localServicePort("learn-profile");
const CONSOLE_HUB_PORT = localServicePort("console-hub");
const XJK_AUTH_PORT = localServicePort("xjk-auth");
const XJK_AUTH_SESSION_COOKIE_NAME =
  String(process.env.XJK_AUTH_SESSION_COOKIE_NAME || "xjk_session").trim() || "xjk_session";
const ALTERED_HUB_PORT = localServicePort("altered-hub");
const ALTERED_BANNER_BUILDER_PORT = localServicePort("bannerbuilder");
const TRACKER_HUB_PORT = localServicePort("tracker-hub");
const AGGREGATOR_HUB_PORT = localServicePort("aggregator-hub");
const TRACKER_DISPLAYNAME_HUB_PORT = localServicePort("tracker-displayname-hub");
const TRACKER_CLUB_HUB_PORT = localServicePort("tracker-club-hub");
const TRACKER_LEADERBOARD_HUB_PORT = localServicePort("tracker-leaderboard-hub");
const VALIDIFIER_PUBLIC_PORT = localServicePort("validifier-public");
const VALIDIFIER_PUBLIC_FALLBACK_PORT = Number(
  process.env.VALIDIFIER_PUBLIC_FALLBACK_PORT || productionServicePort("validifier-public")
);
const COTD_PUBLIC_PORT = localServicePort("cotd-public");
const COTD_PUBLIC_FALLBACK_PORT = Number(process.env.COTD_PUBLIC_FALLBACK_PORT || productionServicePort("cotd-public"));

const REMOTE_SERVER_URL = parseRemoteOrigin(String(process.env.REMOTE_SERVER_ORIGIN || "").trim());
const REMOTE_SERVER_ENABLED = Boolean(REMOTE_SERVER_URL);
const REMOTE_ALTERED_URL = parseRemoteOrigin(String(process.env.REMOTE_ALTERED_ORIGIN || "").trim());
const REMOTE_ALTERED_ENABLED = Boolean(REMOTE_ALTERED_URL);
const REMOTE_ALTERED_HOST_HEADER = String(process.env.REMOTE_ALTERED_HOST_HEADER || "altered.xjk.yt").trim();
const REMOTE_TRACKER_URL = parseRemoteOrigin(String(process.env.REMOTE_TRACKER_ORIGIN || "").trim());
const REMOTE_TRACKER_ENABLED = Boolean(REMOTE_TRACKER_URL);
const REMOTE_TRACKER_HOST_HEADER = String(process.env.REMOTE_TRACKER_HOST_HEADER || "trackers.xjk.yt").trim();
const REMOTE_AGGREGATOR_URL = parseRemoteOrigin(String(process.env.REMOTE_AGGREGATOR_ORIGIN || "").trim());
const REMOTE_AGGREGATOR_ENABLED = Boolean(REMOTE_AGGREGATOR_URL);
const REMOTE_AGGREGATOR_HOST_HEADER = String(process.env.REMOTE_AGGREGATOR_HOST_HEADER || "aggregator.xjk.yt").trim();
const REMOTE_AGGREGATOR_TIMEOUT_MS = Math.max(100, Number(process.env.REMOTE_AGGREGATOR_TIMEOUT_MS || 650) || 650);
const REMOTE_AGGREGATOR_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.REMOTE_AGGREGATOR_COOLDOWN_MS || 30000) || 30000
);
const LOCAL_AGGREGATOR_DASH_FIRST = String(process.env.LOCAL_AGGREGATOR_DASH_FIRST || "1") !== "0";
const PREFER_LOCAL_SUBDOMAIN_REDIRECTS = String(process.env.PREFER_LOCAL_SUBDOMAIN_REDIRECTS || "1") !== "0";

const SITE_ROOTS = Object.freeze({
  shared: path.join(REPO_ROOT, "sites", "shared"),
  toolsShared: path.join(REPO_ROOT, "sites", "tools.xjk.yt", "shared"),
  xjk: path.join(REPO_ROOT, "sites", "xjk.yt", "frontend"),
  console: path.join(REPO_ROOT, "sites", "console.xjk.yt", "frontend"),
  learn: path.join(REPO_ROOT, "sites", "learn.xjk.yt", "frontend"),
  archive: path.join(REPO_ROOT, "sites", "archive.xjk.yt", "frontend"),
  validifier: path.join(REPO_ROOT, "sites", "validifier.xjk.yt", "frontend"),
  cotd: path.join(REPO_ROOT, "sites", "cotd.xjk.yt", "frontend"),
  altered: path.join(REPO_ROOT, "sites", "altered.xjk.yt", "frontend"),
  trackers: path.join(REPO_ROOT, "sites", "trackers.xjk.yt", "frontend"),
  aggregator: path.join(REPO_ROOT, "sites", "aggregator.xjk.yt", "frontend"),
  dash: path.join(REPO_ROOT, "sites", "dash.xjk.yt", "frontend"),
  admin: path.join(REPO_ROOT, "sites", "admin.xjk.yt", "frontend"),
});

const TOOL_ROUTES = PLATFORM_MANIFEST.tools
  .filter((tool) => tool.serviceId)
  .map((tool) => ({ id: tool.id, path: tool.path, port: localServicePort(tool.serviceId) }));

export {
  AGGREGATOR_HUB_PORT,
  ALTERED_BANNER_BUILDER_PORT,
  ALTERED_HUB_PORT,
  CONSOLE_HUB_PORT,
  COTD_PUBLIC_FALLBACK_PORT,
  COTD_PUBLIC_PORT,
  HUB_PORT,
  LEARN_PROFILE_PORT,
  LOCAL_AGGREGATOR_DASH_FIRST,
  PLATFORM_MANIFEST,
  PLUGINS_HUB_PORT,
  PORT,
  PREFER_LOCAL_SUBDOMAIN_REDIRECTS,
  REMOTE_AGGREGATOR_COOLDOWN_MS,
  REMOTE_AGGREGATOR_ENABLED,
  REMOTE_AGGREGATOR_HOST_HEADER,
  REMOTE_AGGREGATOR_TIMEOUT_MS,
  REMOTE_AGGREGATOR_URL,
  REMOTE_ALTERED_ENABLED,
  REMOTE_ALTERED_HOST_HEADER,
  REMOTE_ALTERED_URL,
  REMOTE_SERVER_ENABLED,
  REMOTE_SERVER_URL,
  REMOTE_TRACKER_ENABLED,
  REMOTE_TRACKER_HOST_HEADER,
  REMOTE_TRACKER_URL,
  SITE_ROOTS,
  TOOL_ROUTES,
  TRACKER_CLUB_HUB_PORT,
  TRACKER_DISPLAYNAME_HUB_PORT,
  TRACKER_HUB_PORT,
  TRACKER_LEADERBOARD_HUB_PORT,
  VALIDIFIER_PUBLIC_FALLBACK_PORT,
  VALIDIFIER_PUBLIC_PORT,
  XJK_AUTH_PORT,
  XJK_AUTH_SESSION_COOKIE_NAME,
  localServicePort,
};
