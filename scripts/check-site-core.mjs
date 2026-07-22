import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REDESIGN_SCOPES,
  SHARED_ASSET_MODES,
  SITE_LINES,
  XjkSite,
  XJK_SITES,
  applySiteDataLinks,
  getMapSites,
  getNavigationSites,
  getSite,
  getSiteByHost,
  getSiteHostContext,
  resolveSiteHref,
  userHasAdminRole,
} from "../sites/shared/xjk-core/site-runtime.js";
import {
  accountMatchesXjkAdminIdentity,
  decorateAccountWithXjkRoles,
  publicSessionWithRolesFromRow,
} from "../services/shared/xjkAuth.js";

const ids = new Set();
const aliases = new Set();
const hosts = new Set();
const localSubdomains = new Set();
const hostAliases = new Set();
const localHosts = new Set();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caddyRoutes = fs.readFileSync(path.join(repoRoot, "deploy", "Caddyfile.routes"), "utf8");
const caddyfile = caddyRoutes.replaceAll("{args[0]}", "");
const caddyfileTunnel = caddyRoutes.replaceAll("{args[0]}", "http://");
const localGatewayPath = path.join(repoRoot, "deploy", "local", "local-gateway.js");
const hasLocalGateway = fs.existsSync(localGatewayPath);
const localGatewayModuleDirectory = path.join(repoRoot, "deploy", "local", "gateway");
const localGateway = hasLocalGateway
  ? [
      fs.readFileSync(localGatewayPath, "utf8"),
      ...fs
        .readdirSync(localGatewayModuleDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && path.extname(entry.name) === ".js")
        .map((entry) => fs.readFileSync(path.join(localGatewayModuleDirectory, entry.name), "utf8")),
    ].join("\n")
  : "";
const redesignScopes = new Set(Object.values(REDESIGN_SCOPES));

assert.equal(XjkSite.applySiteDataLinks, applySiteDataLinks, "XjkSite must expose the named runtime API");
assert.equal(globalThis.XjkSite, XjkSite, "module and classic-script consumers must share one runtime object");

assert.equal(userHasAdminRole({ admin: true }), true, "explicit admin flags should grant admin UI access");
assert.equal(userHasAdminRole({ roles: ["admin"] }), true, "admin roles should grant admin UI access");
assert.equal(userHasAdminRole({ roles: ["member"] }), false, "non-admin roles must not grant admin UI access");
assert.equal(userHasAdminRole(null), false, "missing users must not grant admin UI access");

function localAliasEntries(site) {
  return (site.localHostAliases || []).map((alias) =>
    typeof alias === "string"
      ? {
          host: alias,
          localPathPrefix: site.localPathPrefix,
        }
      : {
          host: alias.host,
          localPathPrefix: typeof alias.localPathPrefix === "string" ? alias.localPathPrefix : site.localPathPrefix,
        }
  );
}

function assertCaddyContains(host) {
  assert.ok(caddyfile.includes(host), `Caddyfile missing host: ${host}`);
  assert.ok(caddyfileTunnel.includes(host), `Caddyfile.tunnel missing host: ${host}`);
}

function assertLocalGatewayContains(host) {
  if (!hasLocalGateway) return;
  assert.ok(localGateway.includes(host), `local gateway missing host: ${host}`);
}

function extractBraceBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing configuration block: ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `missing opening brace: ${marker}`);

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }

  assert.fail(`missing closing brace: ${marker}`);
}

for (const site of XJK_SITES) {
  assert.match(site.id, /^[a-z][a-z0-9-]*$/);
  assert.ok(!ids.has(site.id), `duplicate site id: ${site.id}`);
  ids.add(site.id);
  assert.ok(site.label, `${site.id} missing label`);
  assert.ok(site.host, `${site.id} missing host`);
  assert.ok(site.localSubdomain, `${site.id} missing local subdomain`);
  assert.ok(typeof site.localPathPrefix === "string", `${site.id} missing local path prefix`);
  assert.equal(typeof site.public, "boolean", `${site.id} missing public flag`);
  assert.equal(typeof site.internal, "boolean", `${site.id} missing internal flag`);
  assert.equal(site.internal, site.status === "internal", `${site.id} internal flag/status mismatch`);
  assert.ok(site.sharedAssetMode, `${site.id} missing shared asset mode`);
  assert.ok(redesignScopes.has(site.redesign?.scope), `${site.id} missing valid redesign scope`);
  assert.equal(
    site.redesign.scope === REDESIGN_SCOPES.internal,
    site.internal,
    `${site.id} redesign internal scope/status mismatch`
  );
  assert.deepEqual(
    Object.keys(site.map || {}).sort(),
    ["line", "order"],
    `${site.id} map metadata must only describe its line and generated layout order`
  );
  assert.ok(site.map?.line, `${site.id} missing map line`);
  assert.ok(SITE_LINES[site.map.line], `${site.id} uses an unknown map line: ${site.map.line}`);
  assert.equal(site.map.line, site.line, `${site.id} site line/map line mismatch`);
  assert.equal(Number.isFinite(site.map?.order), true, `${site.id} missing finite map order`);
  assert.ok(site.accent, `${site.id} missing accent`);
  assert.ok(site.accentRgb, `${site.id} missing accent rgb`);
  assert.ok(site.summary, `${site.id} missing summary`);

  assert.ok(!hosts.has(site.host), `${site.id} duplicate host: ${site.host}`);
  hosts.add(site.host);
  assert.ok(!localSubdomains.has(site.localSubdomain), `${site.id} duplicate local subdomain: ${site.localSubdomain}`);
  localSubdomains.add(site.localSubdomain);
  assert.equal(getSiteByHost(site.host)?.id, site.id, `host ${site.host} does not resolve to ${site.id}`);
  assert.equal(
    getSiteByHost(`${site.localSubdomain}.localhost`)?.id,
    site.id,
    `local host ${site.localSubdomain}.localhost does not resolve to ${site.id}`
  );

  for (const alias of site.aliases || []) {
    assert.ok(!ids.has(alias), `${site.id} alias collides with id: ${alias}`);
    assert.ok(!aliases.has(alias), `${site.id} duplicate alias: ${alias}`);
    aliases.add(alias);
    assert.equal(getSite(alias)?.id, site.id, `alias ${alias} does not resolve to ${site.id}`);
  }

  for (const hostAlias of site.hostAliases || []) {
    assert.ok(!hosts.has(hostAlias), `${site.id} host alias collides with canonical host: ${hostAlias}`);
    assert.ok(!hostAliases.has(hostAlias), `${site.id} duplicate host alias: ${hostAlias}`);
    hostAliases.add(hostAlias);
    assert.equal(getSiteByHost(hostAlias)?.id, site.id, `host alias ${hostAlias} does not resolve to ${site.id}`);
  }

  for (const localAlias of localAliasEntries(site)) {
    assert.ok(localAlias.host, `${site.id} local host alias missing host`);
    assert.ok(!localHosts.has(localAlias.host), `${site.id} duplicate local host alias: ${localAlias.host}`);
    localHosts.add(localAlias.host);
    assert.equal(
      getSiteByHost(localAlias.host)?.id,
      site.id,
      `local host alias ${localAlias.host} does not resolve to ${site.id}`
    );
    assert.equal(
      getSiteHostContext(localAlias.host)?.localPathPrefix,
      localAlias.localPathPrefix,
      `local host alias ${localAlias.host} has wrong path prefix`
    );
  }
}

assert.ok(getNavigationSites().length >= 8, "hub navigation should expose the public site set");
assert.ok(getMapSites().length >= 8, "subway map should expose the public site set");
assert.equal(
  getMapSites().some((site) => site.id === "dash"),
  false,
  "dash should be hidden from public map sites"
);
assert.equal(
  getMapSites({ includeInternal: true }).some((site) => site.id === "dash"),
  true,
  "dash should be available to internal map callers"
);
assert.equal(
  getSite("altered").redesign.scope,
  REDESIGN_SCOPES.excluded,
  "Altered must stay out of the visual redesign scope"
);

const localSubdomainLocation = {
  protocol: "http:",
  hostname: "learn.localhost",
  port: "8080",
  origin: "http://learn.localhost:8080",
  pathname: "/",
};

const localPathLocation = {
  protocol: "http:",
  hostname: "localhost",
  port: "8080",
  origin: "http://localhost:8080",
  pathname: "/learn/",
};

const productionLocation = {
  protocol: "https:",
  hostname: "learn.xjk.yt",
  port: "",
  origin: "https://learn.xjk.yt",
  pathname: "/",
};

assert.equal(resolveSiteHref("xjk", { location: localSubdomainLocation }), "http://xjk.localhost:8080/");
assert.equal(resolveSiteHref("learn", { location: localPathLocation }), "http://localhost:8080/learn/");
assert.equal(
  resolveSiteHref("tracker", { route: "leaderboard", location: productionLocation }),
  "https://trackers.xjk.yt/leaderboard/"
);

for (const site of XJK_SITES) {
  assertCaddyContains(site.host);
  assertLocalGatewayContains(`${site.localSubdomain}.localhost`);

  for (const hostAlias of site.hostAliases || []) {
    assertCaddyContains(hostAlias);
  }

  for (const localAlias of localAliasEntries(site)) {
    assertLocalGatewayContains(localAlias.host);
  }

  if (site.public) {
    const productionHref = resolveSiteHref(site.id, { location: productionLocation });
    const localSubdomainHref = resolveSiteHref(site.id, { location: localSubdomainLocation });
    const localPathHref = resolveSiteHref(site.id, { location: localPathLocation });

    assert.ok(productionHref.startsWith(`https://${site.host}/`), `${site.id} production href is not canonical`);
    assert.ok(
      localSubdomainHref.startsWith(`http://${site.localSubdomain}.localhost:8080/`),
      `${site.id} local subdomain href is not canonical`
    );
    assert.ok(
      localPathHref.startsWith(`http://localhost:8080${site.localPathPrefix || "/"}`),
      `${site.id} local path href is not canonical`
    );

    if (hasLocalGateway && site.localPathPrefix) {
      assert.ok(
        localGateway.includes(site.localPathPrefix),
        `local gateway missing path prefix: ${site.localPathPrefix}`
      );
    }
  }

  if (site.sharedAssetMode === SHARED_ASSET_MODES.siteLocalWithPlatformCore) {
    assert.ok(caddyfile.includes(`${site.host} {`), `${site.id} missing Caddy block`);
    assert.ok(caddyfile.includes("import shared_core_static"), `${site.id} missing shared core Caddy import`);
  }
}

if (hasLocalGateway) {
  assert.match(localGateway, /host === "tools\.localhost"[\s\S]*SITE_ROOTS\.toolsShared/);
  assert.match(localGateway, /host === "trackers\.localhost"[\s\S]*SITE_ROOTS\.trackers/);

  const pluginsHostRouter = extractBraceBlock(localGateway, "function routePluginsHost(");
  assert.match(
    pluginsHostRouter,
    /if \(PLUGINS_HUB_PORT > 0\) return proxy\(req, res, PLUGINS_HUB_PORT\);[\s\S]*if \(REMOTE_SERVER_ENABLED\) return proxyRemoteServerHost/,
    "Plugins host routing must prefer the local hub before the remote full-server proxy"
  );
  const pluginsPathRouter = extractBraceBlock(localGateway, "function routePluginsPath(");
  assert.match(
    pluginsPathRouter,
    /if \(PLUGINS_HUB_PORT > 0\) proxy\(req, res, PLUGINS_HUB_PORT, "\/plugins"\);[\s\S]*else if \(REMOTE_SERVER_ENABLED\) \{[\s\S]*proxyRemoteServerHost/,
    "Plugins path-mode routing must prefer the local hub before the remote full-server proxy"
  );
  assert.match(
    localGateway,
    /pathname === "\/shared\/main\.css"[\s\S]*?serveStatic\(req, res, SITE_ROOTS\.trackers\)/,
    "Tracker runtime base styles must remain available in localhost path mode"
  );
}

const sharedWidgetAuthHosts = [
  ["archive.xjk.yt", "routeArchiveHost", "handle /auth/*"],
  ["validifier.xjk.yt", "routeValidifierHost", "handle /auth/*"],
  ["cotd.xjk.yt", "routeCotdHost", "handle /auth/*"],
  ["plugins.xjk.yt", "routePluginsHost", "handle /auth/*"],
  ["tools.xjk.yt", "routeToolsHost", "handle /auth/*"],
  ["altered.xjk.yt", "routeAlteredHost", "handle /auth/logout"],
  ["dash.xjk.yt", "routeDashHost", "handle /auth/*"],
];

for (const [host, localRouter, authRoute] of sharedWidgetAuthHosts) {
  const productionBlock = extractBraceBlock(caddyfile, `${host} {`);
  const tunnelBlock = extractBraceBlock(caddyfileTunnel, `http://${host} {`);

  for (const [label, block] of [
    ["Caddyfile", productionBlock],
    ["Caddyfile.tunnel", tunnelBlock],
  ]) {
    assert.ok(block.includes(authRoute), `${label} ${host} missing shared auth route`);
    assert.ok(block.includes("handle /api/v1/account/*"), `${label} ${host} missing shared account API route`);
    assert.ok(block.includes("reverse_proxy 127.0.0.1:3038"), `${label} ${host} missing xjk-auth proxy`);
  }

  if (hasLocalGateway) {
    const routerBlock = extractBraceBlock(localGateway, `function ${localRouter}(`);
    assert.ok(
      routerBlock.includes("maybeProxySharedAccountRequest(req, res)"),
      `local gateway ${localRouter} missing shared auth dispatch`
    );
  }
}

const adminIdentity = {
  xjkAccountIds: [],
  ubisoftAccountIds: ["immutable-admin-id"],
  ubisoftSubjects: [],
};
const inactiveAdmin = {
  isActive: false,
  ubisoftAccountId: "immutable-admin-id",
  roles: ["admin"],
};
const activeAdmin = {
  isActive: true,
  ubisoftAccountId: "immutable-admin-id",
};
const mutableNameOnlyAccount = {
  isActive: true,
  username: "mutable-admin-name",
  displayName: "Mutable Admin Name",
};
assert.equal(
  accountMatchesXjkAdminIdentity(activeAdmin, adminIdentity),
  true,
  "active accounts should match configured immutable admin identities"
);
assert.equal(
  accountMatchesXjkAdminIdentity(mutableNameOnlyAccount, {
    ...adminIdentity,
    usernames: ["mutable-admin-name"],
    displayNames: ["Mutable Admin Name"],
  }),
  false,
  "mutable usernames and display names must never grant admin access"
);
assert.equal(
  accountMatchesXjkAdminIdentity(inactiveAdmin, adminIdentity),
  false,
  "inactive accounts must never match an admin identity"
);
assert.equal(
  decorateAccountWithXjkRoles(inactiveAdmin, adminIdentity).admin,
  false,
  "inactive accounts must lose any derived admin role"
);

const protectedTestValues = Object.freeze({
  session: ["redaction", "session", "value"].join("-"),
  access: ["redaction", "access", "value"].join("-"),
  refresh: ["redaction", "refresh", "value"].join("-"),
  identity: ["redaction", "identity", "value"].join("-"),
});
const publicSession = publicSessionWithRolesFromRow(
  {
    session_token: protectedTestValues.session,
    oauth_access_token: protectedTestValues.access,
    oauth_refresh_token: protectedTestValues.refresh,
    oauth_id_token: protectedTestValues.identity,
    account_is_active: 1,
    provider_account_id: "immutable-admin-id",
    session_created_at: Date.now(),
    session_expires_at: Date.now() + 60_000,
  },
  adminIdentity
);
const serializedPublicSession = JSON.stringify(publicSession);
assert.equal(Object.hasOwn(publicSession, "token"), false, "public sessions must not expose the session bearer");
for (const protectedValue of Object.values(protectedTestValues)) {
  assert.equal(
    serializedPublicSession.includes(protectedValue),
    false,
    "public sessions must not expose protected values"
  );
}

const learnApp = fs.readFileSync(path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/app.js"), "utf8");
assert.doesNotMatch(learnApp, /\bloadAccountWidgetScript\b/, "Learn must not mount a second shared account widget");

const validifierPage = fs.readFileSync(path.join(repoRoot, "sites/validifier.xjk.yt/frontend/index.html"), "utf8");
const validifierRoutes = fs.readFileSync(
  path.join(repoRoot, "sites/validifier.xjk.yt/frontend/scripts/routes.js"),
  "utf8"
);
assert.match(validifierPage, /<base href="\/" data-xjk-site-base\s*\/>/, "Validifier needs a stable SPA base");
assert.match(
  validifierPage,
  /site-base\.js(?:\?v=[^"]+)?" data-xjk-site-path="\/validifier"/,
  "Validifier must configure localhost path mode before loading route-relative assets"
);
assert.match(validifierRoutes, /const XJK_SITE_BASE_URL = new URL\("\."/);
assert.match(
  validifierRoutes,
  /routePathname\(url\)/,
  "Validifier must strip its local path prefix while parsing routes"
);

const localGatewayStatus = hasLocalGateway ? "local gateway coverage ok" : "local gateway coverage skipped";
console.log(`xjk-core ok: ${XJK_SITES.length} sites, registry coverage ok, ${localGatewayStatus}`);
