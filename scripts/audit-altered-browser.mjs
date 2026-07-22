import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { XJK_SITES } from "../sites/shared/xjk-core/site-registry.js";
import { resolveSiteHref } from "../sites/shared/xjk-core/site-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const viewportArg = process.argv.find((arg) => arg.startsWith("--viewport="))?.split("=")[1] || "390x844";
const outputArg = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
const originArg = process.argv.find((arg) => arg.startsWith("--origin="))?.slice("--origin=".length);
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const skipArg = process.argv.find((arg) => arg.startsWith("--skip="))?.slice("--skip=".length);
const scrollYValue = process.argv.find((arg) => arg.startsWith("--scroll-y="))?.slice("--scroll-y=".length);
const scrollYArg = scrollYValue === undefined ? 0 : Number(scrollYValue);
const scrollFromYValue = process.argv
  .find((arg) => arg.startsWith("--scroll-from-y="))
  ?.slice("--scroll-from-y=".length);
const scrollFromYArg = scrollFromYValue === undefined ? 0 : Number(scrollFromYValue);
const scrollSettleMsValue = process.argv
  .find((arg) => arg.startsWith("--scroll-settle-ms="))
  ?.slice("--scroll-settle-ms=".length);
const scrollSettleMsArg = scrollSettleMsValue === undefined ? 500 : Number(scrollSettleMsValue);
const waitMsValue = process.argv.find((arg) => arg.startsWith("--wait-ms="))?.slice("--wait-ms=".length);
const waitMsArg = waitMsValue === undefined ? 4200 : Number(waitMsValue);
const useLocalSession = process.argv.includes("--use-local-session");
const strict = process.argv.includes("--strict");
const [width, height] = viewportArg.split("x").map(Number);

if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || height < 320) {
  throw new Error(`Invalid viewport: ${viewportArg}`);
}
if (!Number.isFinite(scrollYArg) || scrollYArg < 0) {
  throw new Error(`Invalid scroll offset: ${scrollYArg}`);
}
if (!Number.isFinite(scrollFromYArg) || scrollFromYArg < 0) {
  throw new Error(`Invalid initial scroll offset: ${scrollFromYArg}`);
}
if (!Number.isFinite(scrollSettleMsArg) || scrollSettleMsArg < 0 || scrollSettleMsArg > 30000) {
  throw new Error(`Invalid scroll settle time: ${scrollSettleMsArg}`);
}
if (!Number.isFinite(waitMsArg) || waitMsArg < 0 || waitMsArg > 30000) {
  throw new Error(`Invalid post-load wait: ${waitMsArg}`);
}
if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);

const auditLocation = new URL(originArg || "http://localhost:8080/");
if (!["http:", "https:"].includes(auditLocation.protocol)) {
  throw new Error(`Invalid browser-audit origin: ${auditLocation.href}`);
}
auditLocation.pathname = "/";
auditLocation.search = "";
auditLocation.hash = "";

function auditUrl(pathname, { hostname = auditLocation.hostname } = {}) {
  const url = new URL(pathname, auditLocation);
  url.hostname = hostname;
  return url.href;
}

const outputDir = path.resolve(
  repoRoot,
  outputArg || `artifacts/global-chrome-audit/${width <= 560 ? "mobile" : "desktop"}`
);
fs.mkdirSync(outputDir, { recursive: true });

let localSessionToken = "";
if (useLocalSession) {
  const { DatabaseSync } = await import("node:sqlite");
  const sessionDb = new DatabaseSync(path.join(repoRoot, "sites/xjk.yt/data/xjk-auth.sqlite"), { readOnly: true });
  const row = sessionDb
    .prepare("SELECT session_token FROM xjk_sessions WHERE expires_at > ? ORDER BY updated_at DESC LIMIT 1")
    .get(Date.now());
  sessionDb.close();
  localSessionToken = String(row?.session_token || "");
  if (!localSessionToken) throw new Error("No valid local xjk session is available for the protected-page audit");
}

const registryRoutes = XJK_SITES.flatMap((site) => {
  const rootName = site.id === "altered" ? "home" : `site-${site.id}`;
  const root = [[rootName, resolveSiteHref(site.id, { location: auditLocation })]];
  const namedRoutes = Object.entries(site.routes || {}).map(([routeName, routePath]) => [
    `site-${site.id}-${routeName}`,
    resolveSiteHref(site.id, { path: routePath, location: auditLocation }),
  ]);
  return [...root, ...namedRoutes];
});
const toolManifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "sites/tools.xjk.yt/Tools-Hub/data/tools.json"), "utf8")
);
const toolRoutes = toolManifest.map((tool) => [
  tool.id === "map-validation-checker" ? "site-tool-map-validation" : `site-tool-${tool.id}`,
  resolveSiteHref("tools", { path: `/${String(tool.link || "").replace(/^\/+/, "")}`, location: auditLocation }),
]);
const deepRoutes = [
  ["site-validifier-record-route", auditUrl("/validifier/records/browser-audit")],
  ["site-validifier-map-route", auditUrl("/validifier/maps/browser-audit")],
  ["site-validifier-api", auditUrl("/validifier/api/")],
  ["site-tool-colorizer-error", auditUrl("/tools/Colorizer/error.html")],
  ["site-trackers-wr-admin", auditUrl("/trackers/wr/admin")],
  ["site-trackers-wr-admin-login", auditUrl("/trackers/wr/admin/login")],
  ["site-trackers-leaderboard-admin", auditUrl("/trackers/leaderboard/admin")],
  ["site-trackers-leaderboard-admin-login", auditUrl("/trackers/leaderboard/admin/login")],
  ["site-aggregator-api", auditUrl("/aggregator/api-docs/")],
  ["maps", auditUrl("/altered/maps/")],
  ["rankings", auditUrl("/altered/rankings/")],
  ["alterations", auditUrl("/altered/alterations/")],
  ["season", auditUrl("/altered/season/?s=training")],
  ["tools", auditUrl("/altered/tools/")],
  ["api", auditUrl("/altered/api/")],
  ["api-endpoint", auditUrl("/altered/api/endpoints/public-api-catalog")],
  ["about", auditUrl("/altered/about/")],
  ["team", auditUrl("/altered/team/")],
  ["request-update", auditUrl("/altered/request-update/")],
  ["bannerbuilder", auditUrl("/altered/bannerbuilder/")],
  ["bannerbuilder-admin-login", auditUrl("/bannerbuilder/admin/login", { hostname: "altered.localhost" })],
  ["platonic-solids", auditUrl("/altered/platonic-solids/")],
  // Static entry points keep the admin shells addressable; protected shells
  // additionally require --use-local-session to remain on-page.
  ["admin", auditUrl("/altered/admin/index.html")],
  ["admin-login", auditUrl("/altered/admin/login/")],
  ["admin-monitoring", auditUrl("/altered/admin/monitoring/index.html")],
];
const allRoutes = [...registryRoutes, ...toolRoutes, ...deepRoutes];
const duplicateRouteNames = allRoutes.filter(
  ([name], index) => allRoutes.findIndex(([other]) => other === name) !== index
);
if (duplicateRouteNames.length) {
  throw new Error(`Duplicate browser-audit route names: ${duplicateRouteNames.map(([name]) => name).join(", ")}`);
}
const onlyNames = new Set(
  (onlyArg || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
);
const skipNames = new Set(
  (skipArg || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
);
const selectedRoutes = onlyNames.size ? allRoutes.filter(([name]) => onlyNames.has(name)) : allRoutes;
const routes = selectedRoutes.filter(([name]) => !skipNames.has(name));

if (!routes.length) {
  throw new Error(`No routes matched --only=${onlyArg}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appendControlViolations(violations, control, label, options = {}) {
  if (!control?.exists) {
    violations.push(`${label}: missing`);
    return;
  }
  if (control.disabled) violations.push(`${label}: disabled`);
  if (control.inert) violations.push(`${label}: inside inert content`);
  if (options.requireHref && !control.href) violations.push(`${label}: missing href`);
  if (options.allowedTags && !options.allowedTags.includes(control.tag)) {
    violations.push(`${label}: expected ${options.allowedTags.join("/")}, received ${control.tag}`);
  }
  if (options.requireVisible === false) return;
  if (control.hidden || control.display === "none" || control.visibility === "hidden" || control.opacity <= 0) {
    violations.push(`${label}: not visible`);
  }
  if (control.width < 1 || control.height < 1) violations.push(`${label}: empty hit area`);
  if (control.pointerEvents === "none") violations.push(`${label}: pointer events disabled`);
  if (!control.hitTarget) {
    const blocker = [control.hitTag, control.hitClass].filter(Boolean).join(".");
    violations.push(`${label}: center is not hit-testable${blocker ? ` (${blocker})` : ""}`);
  }
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          listeners.filter((item) => item !== listener)
        );
        resolve(params);
      };
      const timeout = setTimeout(() => {
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          listeners.filter((item) => item !== listener)
        );
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      this.on(method, listener);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const profileRoot = path.join(repoRoot, ".codex-tmp", "browser-audit-profiles");
fs.mkdirSync(profileRoot, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(profileRoot, "run-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true }
);

async function readDevToolsPort() {
  const portFile = path.join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
      if (port) return Number(port);
    }
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode})`);
    await delay(50);
  }
  throw new Error("Chrome did not expose a DevTools port");
}

const auditExpression = `(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom),
      width: Math.round(box.width), height: Math.round(box.height), display: style.display,
      position: style.position, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex,
    };
  };
  const controlForNode = (node) => {
    if (!node) return { exists: false };
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const centerX = Math.min(innerWidth - 1, Math.max(0, box.left + box.width / 2));
    const centerY = Math.min(innerHeight - 1, Math.max(0, box.top + box.height / 2));
    const hit = box.width > 0 && box.height > 0 ? document.elementFromPoint(centerX, centerY) : null;
    return {
      exists: true,
      tag: node.tagName.toLowerCase(),
      href: node instanceof HTMLAnchorElement ? node.href : '',
      label: node.getAttribute('aria-label') || node.title || node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
      disabled: node.matches(':disabled'),
      inert: Boolean(node.closest('[inert]')),
      hidden: Boolean(node.hidden || node.closest('[hidden]')),
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      width: Math.round(box.width),
      height: Math.round(box.height),
      hitTarget: Boolean(hit && (hit === node || node.contains(hit))),
      hitTag: hit?.tagName?.toLowerCase() || '',
      hitClass: typeof hit?.className === 'string' ? hit.className.slice(0, 100) : '',
    };
  };
  const control = (selector) => controlForNode(document.querySelector(selector));
  const viewportRight = document.documentElement.clientWidth;
  const overflow = [...document.body.querySelectorAll('*')]
    .map((node) => {
      const box = node.getBoundingClientRect();
      return { node, box, style: getComputedStyle(node) };
    })
    .filter(({ node, box, style }) => !node.closest('.xjk-sidenav') &&
      box.width > 1 && style.display !== 'none' && style.visibility !== 'hidden' &&
      (box.right > viewportRight + 2 || box.left < -2))
    .sort((a, b) => Math.max(b.box.right - viewportRight, -b.box.left) - Math.max(a.box.right - viewportRight, -a.box.left))
    .slice(0, 10)
    .map(({ node, box }) => ({
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      className: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
      left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width),
    }));
  return {
    url: location.href,
    title: document.title,
    viewport: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth },
    counts: {
      topbar: document.querySelectorAll('[data-xjk-global-topbar]').length,
      search: document.querySelectorAll('[data-xjk-search-owner="topbar"]').length,
      account: document.querySelectorAll('[data-xjk-account-widget-slot="topbar"]').length,
      accountWidget: document.querySelectorAll('.xjk-account-widget').length,
      sidenav: document.querySelectorAll('.xjk-sidenav').length,
      pageToolbar: document.querySelectorAll('[data-xjk-page-toolbar]').length,
    },
    chromeState: document.documentElement.dataset.xjkChromeScrollReveal || 'visible',
    mobileChrome: matchMedia('(max-width: 880px)').matches,
    controls: {
      identity: control('.xjk-global-topbar__identity'),
      search: control('[data-xjk-search-owner="topbar"]'),
      account: control('.xjk-account-widget [data-xjk-trigger]'),
      sidenavCollapse: control('.xjk-sidenav-collapse'),
      sidenavNetwork: control('.xjk-sidenav [data-xjk-nettoggle]'),
      sidenavMobile: control('.xjk-sidenav-mobile-toggle'),
      sidenavActions: [...document.querySelectorAll('.xjk-sidenav [data-xjk-item]')].map(controlForNode),
    },
    identityHref: document.querySelector('.xjk-global-topbar__identity')?.href || '',
    topbarMeta: (() => {
      const node = document.querySelector('[data-xjk-global-topbar]');
      if (!node) return null;
      return {
        tag: node.tagName.toLowerCase(),
        className: node.className,
        mode: node.dataset.xjkTopbarMode || '',
        parentTag: node.parentElement?.tagName.toLowerCase() || '',
        parentClassName: node.parentElement?.className || '',
      };
    })(),
    topbar: rect('[data-xjk-global-topbar]'),
    identity: rect('.xjk-global-topbar__identity'),
    identityMark: rect('.xjk-global-topbar__mark'),
    identityContext: rect('.xjk-global-topbar__context'),
    search: rect('[data-xjk-search-owner="topbar"]'),
    account: rect('[data-xjk-account-widget-slot="topbar"]'),
    sidenav: rect('.xjk-sidenav'),
    contentHero: rect('main header, main .hero, main .vista, main > section:first-child'),
    overflow,
    brokenImages: [...document.images]
      .filter((image) => image.hasAttribute('src') && image.getAttribute('src').trim() && image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src)
      .slice(0, 20),
  };
})()`;

let client;
try {
  const port = await readDevToolsPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target was not found");
  client = new CdpClient(target.webSocketDebuggerUrl);
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Network.enable"),
    client.send("Log.enable"),
  ]);
  if (localSessionToken) {
    const cookie = await client.send("Network.setCookie", {
      name: "xjk_session",
      value: localSessionToken,
      url: auditLocation.href,
      path: "/",
      sameSite: "Lax",
    });
    if (!cookie.success) throw new Error("Chrome rejected the local xjk session cookie");
  }
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 560,
    screenWidth: width,
    screenHeight: height,
  });

  let activeErrors = [];
  client.on("Network.responseReceived", ({ response, type }) => {
    if (Number(response?.status || 0) >= 400 && ["Document", "Stylesheet", "Script", "Image"].includes(type)) {
      activeErrors.push({
        kind: "http",
        status: response.status,
        type,
        url: response.url,
      });
    }
  });
  client.on("Network.loadingFailed", ({ errorText, type, canceled }) => {
    if (!canceled && ["Document", "Stylesheet", "Script", "Image"].includes(type)) {
      activeErrors.push({ kind: "network", type, error: errorText });
    }
  });
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    activeErrors.push({
      kind: "exception",
      error: exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime exception",
    });
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") {
      activeErrors.push({
        kind: "console",
        error: entry.text,
        url: entry.url,
        diagnosticOnly: true,
      });
    }
  });

  const report = [];
  for (const [name, url] of routes) {
    activeErrors = [];
    await client.send("Network.clearBrowserCache");
    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url });
    try {
      await loaded;
    } catch (error) {
      activeErrors.push({ kind: "load", error: error.message });
      await client.send("Page.stopLoading");
    }
    await delay(waitMsArg);
    if (scrollFromYArg > 0) {
      await client.send("Runtime.evaluate", {
        expression: `window.scrollTo(0, ${Math.round(scrollFromYArg)})`,
      });
      await delay(500);
    }
    if (scrollYValue !== undefined) {
      await client.send("Runtime.evaluate", {
        expression: `window.scrollTo(0, ${Math.round(scrollYArg)})`,
      });
      await delay(scrollSettleMsArg);
    }

    const evaluated = await client.send("Runtime.evaluate", {
      expression: auditExpression,
      returnByValue: true,
      awaitPromise: true,
    });
    const metrics = evaluated.result?.value;
    if (!metrics) throw new Error(`No metrics returned for ${name}`);

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });
    fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
    const finalUrl = new URL(metrics.url);
    const expectedChrome =
      finalUrl.hostname === "localhost" ||
      finalUrl.hostname === "127.0.0.1" ||
      finalUrl.hostname.endsWith(".localhost");
    const isExpectedAuthPage = name === "site-dash" && finalUrl.pathname.startsWith("/dash/login");
    const violations = activeErrors
      .filter((error) => !error.diagnosticOnly)
      .map((error) => `${error.kind}: ${error.url || error.error || error.status}`);

    if (!expectedChrome) {
      violations.push(`unexpected non-local navigation: ${metrics.url}`);
    }
    if (expectedChrome && Math.abs(metrics.viewport.innerWidth - width) > 2) {
      violations.push(`viewport width: expected ${width}px, received ${metrics.viewport.innerWidth}px`);
    }
    if (metrics.brokenImages.length) violations.push(`broken images: ${metrics.brokenImages.join(", ")}`);
    if (Math.max(metrics.viewport.scrollWidth, metrics.viewport.bodyScrollWidth) > metrics.viewport.clientWidth + 2) {
      violations.push(
        `horizontal overflow: ${Math.max(metrics.viewport.scrollWidth, metrics.viewport.bodyScrollWidth)}px > ${metrics.viewport.clientWidth}px`
      );
    }
    if (expectedChrome && !isExpectedAuthPage) {
      for (const key of ["topbar", "search", "account", "accountWidget", "sidenav"]) {
        if (metrics.counts[key] !== 1) violations.push(`${key} count: expected 1, received ${metrics.counts[key]}`);
      }
      const requireVisible = metrics.chromeState !== "hidden";
      appendControlViolations(violations, metrics.controls.identity, "topbar identity", {
        allowedTags: ["a"],
        requireHref: true,
        requireVisible,
      });
      appendControlViolations(violations, metrics.controls.search, "topbar search", {
        allowedTags: ["button"],
        requireVisible,
      });
      appendControlViolations(violations, metrics.controls.account, "topbar account", {
        allowedTags: ["button"],
        requireVisible,
      });

      try {
        const identityUrl = new URL(metrics.identityHref);
        if (
          !["localhost", "127.0.0.1", "xjk.localhost"].includes(identityUrl.hostname) ||
          identityUrl.pathname !== "/"
        ) {
          violations.push(`topbar identity destination is not xjk home: ${metrics.identityHref}`);
        }
      } catch {
        violations.push(`topbar identity destination is invalid: ${metrics.identityHref || "missing"}`);
      }

      if (metrics.mobileChrome) {
        appendControlViolations(violations, metrics.controls.sidenavMobile, "mobile sidenav toggle", {
          allowedTags: ["button"],
          requireVisible,
        });
      } else {
        appendControlViolations(violations, metrics.controls.sidenavCollapse, "sidenav collapse", {
          allowedTags: ["button"],
          requireVisible,
        });
        appendControlViolations(violations, metrics.controls.sidenavNetwork, "sidenav network", {
          allowedTags: ["button"],
          requireVisible,
        });
        metrics.controls.sidenavActions.forEach((control, index) => {
          appendControlViolations(violations, control, `sidenav action ${index + 1}`, {
            allowedTags: ["a", "button"],
            requireHref: control.tag === "a",
            requireVisible,
          });
        });
      }
    }

    report.push({
      name,
      requestedUrl: url,
      ...metrics,
      errors: activeErrors,
      violations,
    });
    console.log(
      `[${report.length}/${routes.length}] ${name} ${metrics.viewport.innerWidth}x${metrics.viewport.innerHeight}`
    );
  }

  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path.join(outputDir, "report.json")}`);
  const failures = report.filter((entry) => entry.violations.length > 0);
  if (failures.length) {
    console.error(`Audit violations: ${failures.length}/${report.length} routes`);
    failures.forEach((entry) => console.error(`- ${entry.name}: ${entry.violations.join("; ")}`));
    if (strict) process.exitCode = 1;
  }
} finally {
  client?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, delay(2_000)]);
  }
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
  } catch {}
}
