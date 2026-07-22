import { escapeHtml } from "../../../shared/xjk-core/dom-utils.js?v=2";

export { escapeHtml };

const LEARN_PREFIX = "/learn";
const DEFAULT_ALLOWED_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const URL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const URL_SCHEME_IGNORED_CHARACTERS = /[\u0000-\u0020\u007F]+/g;

export function getBasePath() {
  const path = globalThis.window?.location?.pathname || globalThis.location?.pathname || "/";
  if (path === LEARN_PREFIX || path.startsWith(`${LEARN_PREFIX}/`)) return LEARN_PREFIX;
  return "";
}

export function assetPath(path = "") {
  const safePath = sanitizeUrl(path);
  if (!safePath) return "";
  if (/^(https?:)?\/\//i.test(safePath) || URL_SCHEME_PATTERN.test(safePath) || safePath.startsWith("#")) {
    return safePath;
  }
  const base = getBasePath();
  if (safePath.startsWith("/")) return `${base}${safePath}`;
  return `${base}/${safePath.replace(/^\.\//, "")}`;
}

export function renderIcon(name = "", className = "") {
  const safeName = String(name).replace(/[^a-z0-9-]/gi, "");
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `<svg class="learn-icon${extraClass}" aria-hidden="true" focusable="false"><use href="#learn-icon-${escapeHtml(safeName)}"></use></svg>`;
}

export function sanitizeUrl(value, options = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // Browsers ignore ASCII whitespace and controls inside a URL scheme. Probe
  // the compact form so values such as `java\tscript:` cannot masquerade as
  // relative URLs, while preserving ordinary spaces in safe URL payloads.
  const schemeProbe = raw.replace(URL_SCHEME_IGNORED_CHARACTERS, "");
  const schemeMatch = URL_SCHEME_PATTERN.exec(schemeProbe);
  if (!schemeMatch) return raw;

  const configuredSchemes = options.allowedSchemes ?? DEFAULT_ALLOWED_URL_SCHEMES;
  const allowedSchemes =
    configuredSchemes === DEFAULT_ALLOWED_URL_SCHEMES
      ? DEFAULT_ALLOWED_URL_SCHEMES
      : new Set(Array.from(configuredSchemes, (scheme) => String(scheme).toLowerCase()));
  return allowedSchemes.has(schemeMatch[1].toLowerCase()) ? raw : "";
}

export function slugToHash(slug = "") {
  const clean = String(slug)
    .replace(/^#\/?/, "")
    .replace(/^learn\//, "")
    .replace(/^\/+/, "");
  return `#/learn/${clean}`;
}

export function viewToHash(view = "learn", extra = "") {
  if ((view === "learn" || view === "map") && !extra) return "#/";
  const suffix = extra ? `/${String(extra).replace(/^\/+/, "")}` : "";
  return `#/${view}${suffix}`;
}

export function pageTitle(page) {
  return page?.title || "Untitled topic";
}

export function clusterForPage(page) {
  return page?.graph?.primaryCluster || page?.cluster || page?.category || "learn";
}

export function clusterSvgIcon(clusterId = "", className = "") {
  const icon =
    {
      underwater: "waves",
      "desert-car": "car",
      snowcar: "snowflake",
      recovery: "reset",
      advanced: "spark",
      style: "map",
      "speed-momentum": "spark",
      "grip-contact": "circle",
      inputs: "density",
      surfaces: "map",
      vehicles: "car",
      "block-geometry": "sidebar",
      "special-forces": "waves",
      techniques: "tools",
      contexts: "library",
      "practice-analysis": "list",
    }[clusterId] || "map";
  return renderIcon(icon, className);
}

export function difficultyLabel(value = "") {
  return String(value || "guide").replace(/^\w/, (char) => char.toUpperCase());
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can be unavailable in hardened/private contexts.
  }
}

export function readText(key, fallback = "") {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage can be unavailable in hardened/private contexts.
  }
}

export function normalizeSeries(values = [], width = 500, height = 120, min = 0, max = 1) {
  if (!values.length) return "";
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index ? "L" : "M"}${x.toFixed(1)},${clamp(y, 0, height).toFixed(1)}`;
    })
    .join(" ");
}

export function makeTelemetry(seedText = "learn", points = 84) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const curve = (base, amp, noise) =>
    Array.from({ length: points }, (_, index) => {
      const t = index / Math.max(1, points - 1);
      return base + Math.sin(t * Math.PI * 4 + rand() * 0.9) * amp + (rand() - 0.5) * noise;
    });
  return {
    speed: curve(96, 7, 4),
    steer: curve(0, 0.22, 0.16),
    pitch: curve(0, 9, 4),
    angle: curve(1.5, 3.2, 1.1),
    ghost: curve(1.1, 2.3, 0.5),
    you: curve(4.3, 4.1, 1.2),
  };
}

export function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}
