import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import Jimp from "jimp";
import { fileURLToPath } from "url";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, "..", "frontend");
const OPENPLANET_ORIGIN = "https://openplanet.dev";
const OPENPLANET_PROFILE_URL = process.env.OPENPLANET_PROFILE_URL || `${OPENPLANET_ORIGIN}/u/st-AR-gazer`;
const PLUGIN_INSTALL_LABEL = process.env.PLUGIN_INSTALL_LABEL || "Openplanet plugin manager";
const PLUGINS_CACHE_TTL_MS = Number(process.env.PLUGINS_CACHE_TTL_MS || 5 * 60 * 1000);
const OPENPLANET_FETCH_TIMEOUT_MS = Number(process.env.OPENPLANET_FETCH_TIMEOUT_MS || 12000);
const OPENPLANET_MAX_PAGES = Number(process.env.OPENPLANET_MAX_PAGES || 20);
const REQUEST_UA = process.env.OPENPLANET_REQUEST_UA || "plugins.xjk.yt (+https://plugins.xjk.yt)";
const IMAGE_PALETTE_CACHE_TTL_MS = Number(process.env.IMAGE_PALETTE_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
const IMAGE_PALETTE_MAX_CONCURRENCY = Number(process.env.IMAGE_PALETTE_MAX_CONCURRENCY || 4);
const IMAGE_SAMPLE_SIZE = Number(process.env.IMAGE_SAMPLE_SIZE || 72);

const pluginCache = {
  fetchedAt: "",
  expiresAt: 0,
  pageCount: 0,
  plugins: [],
};

const imagePaletteCache = new Map();

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function toneForPluginId(id) {
  return hashString(String(id || "")) % 2 === 0 ? "cool" : "warm";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(hue) {
  const normalized = Number(hue) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function hueDistance(a, b) {
  const diff = Math.abs(wrapHue(a) - wrapHue(b));
  return diff > 180 ? 360 - diff : diff;
}

function blendHue(fromHue, toHue, amount) {
  const from = wrapHue(fromHue);
  const to = wrapHue(toHue);
  const diff = ((to - from + 540) % 360) - 180;
  return wrapHue(from + diff * clamp(amount, 0, 1));
}

function rgbToHex(r, g, b) {
  const part = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsl(r, g, b) {
  const rr = clamp(r, 0, 255) / 255;
  const gg = clamp(g, 0, 255) / 255;
  const bb = clamp(b, 0, 255) / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case rr:
        h = 60 * (((gg - bb) / delta) % 6);
        break;
      case gg:
        h = 60 * ((bb - rr) / delta + 2);
        break;
      default:
        h = 60 * ((rr - gg) / delta + 4);
        break;
    }
  }

  return {
    h: wrapHue(h),
    s: clamp(s * 100, 0, 100),
    l: clamp(l * 100, 0, 100),
  };
}

function toHsl(h, s, l) {
  return `hsl(${Math.round(wrapHue(h))} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}%)`;
}

function toHsla(h, s, l, alpha) {
  return `hsla(${Math.round(wrapHue(h))} ${Math.round(clamp(s, 0, 100))}% ${Math.round(clamp(l, 0, 100))}% / ${alpha})`;
}

function fallbackPalette(seedValue) {
  const seed = hashString(String(seedValue || ""));
  const hueCenter = wrapHue((seed % 360) + 26);
  const hueA = wrapHue(hueCenter - 6);
  const hueB = wrapHue(hueCenter + 6);

  const sat = 36;
  const satSoft = 30;
  const lightHi = 60;
  const lightMid = 55;
  const lightLow = 50;

  return {
    source: "fallback",
    primaryHex: rgbToHex(120, 150, 180),
    secondaryHex: rgbToHex(104, 136, 168),
    accentA: toHsla(hueA, sat, lightMid, 0.22),
    accentB: toHsla(hueB, satSoft, lightLow - 1, 0.09),
    buttonA: toHsl(hueA, sat, lightHi),
    buttonB: toHsl(hueB, sat, lightMid),
    buttonC: toHsl(hueB, satSoft, lightLow),
    buttonBorder: toHsla(hueCenter, satSoft, 76, 0.28),
    buttonShadow: toHsla(hueCenter, satSoft, 20, 0.3),
    cardBorderHover: toHsla(hueCenter, sat, 68, 0.42),
    titleHover: toHsl(hueCenter, sat, 69),
    squareA: toHsla(hueA, sat, lightMid, 0.24),
    squareB: toHsla(hueB, satSoft, lightLow, 0.1),
  };
}

function normalizeImagePalette(palette, seedValue) {
  const fallback = fallbackPalette(seedValue);
  const source = typeof palette?.source === "string" ? palette.source : fallback.source;
  const primaryHex = typeof palette?.primaryHex === "string" ? palette.primaryHex : fallback.primaryHex;
  const secondaryHex = typeof palette?.secondaryHex === "string" ? palette.secondaryHex : fallback.secondaryHex;

  return {
    source,
    primaryHex,
    secondaryHex,
    accentA: typeof palette?.accentA === "string" ? palette.accentA : fallback.accentA,
    accentB: typeof palette?.accentB === "string" ? palette.accentB : fallback.accentB,
    buttonA: typeof palette?.buttonA === "string" ? palette.buttonA : fallback.buttonA,
    buttonB: typeof palette?.buttonB === "string" ? palette.buttonB : fallback.buttonB,
    buttonC: typeof palette?.buttonC === "string" ? palette.buttonC : fallback.buttonC,
    buttonBorder: typeof palette?.buttonBorder === "string" ? palette.buttonBorder : fallback.buttonBorder,
    buttonShadow: typeof palette?.buttonShadow === "string" ? palette.buttonShadow : fallback.buttonShadow,
    cardBorderHover: typeof palette?.cardBorderHover === "string" ? palette.cardBorderHover : fallback.cardBorderHover,
    titleHover: typeof palette?.titleHover === "string" ? palette.titleHover : fallback.titleHover,
    squareA: typeof palette?.squareA === "string" ? palette.squareA : fallback.squareA,
    squareB: typeof palette?.squareB === "string" ? palette.squareB : fallback.squareB,
  };
}

function buildPaletteFromHsl(primary, secondary, seedValue, meta = {}) {
  const seed = hashString(String(seedValue || ""));
  const fallbackHue = wrapHue((seed % 360) + 18);
  const hueCenter = Number.isFinite(primary?.h) ? wrapHue(primary.h) : fallbackHue;
  const hueAccentRaw = Number.isFinite(secondary?.h) ? wrapHue(secondary.h) : wrapHue(hueCenter + 10);
  const hueAccent = blendHue(hueCenter, hueAccentRaw, 0.34);
  const hueA = wrapHue(hueCenter - 6.5);
  const hueB = wrapHue(hueAccent + 5.5);

  const primarySat = Number.isFinite(primary?.s) ? primary.s : 34;
  const secondarySat = Number.isFinite(secondary?.s) ? secondary.s : primarySat;
  const primaryLight = Number.isFinite(primary?.l) ? primary.l : 52;

  const sat = clamp(primarySat * 0.72 + 9, 24, 54);
  const satSoft = clamp(secondarySat * 0.58 + 10, 20, 44);
  const lightHi = clamp(primaryLight * 0.64 + 20, 48, 64);
  const lightMid = clamp(lightHi - 5, 42, 58);
  const lightLow = clamp(lightMid - 6, 36, 52);

  return normalizeImagePalette(
    {
      source: meta.source || "image",
      primaryHex: meta.primaryHex || rgbToHex(122, 151, 176),
      secondaryHex: meta.secondaryHex || rgbToHex(108, 138, 162),
      accentA: toHsla(hueA, sat, lightMid, 0.22),
      accentB: toHsla(hueB, satSoft, lightLow - 1, 0.09),
      buttonA: toHsl(hueA, sat, lightHi),
      buttonB: toHsl(hueB, sat, lightMid),
      buttonC: toHsl(hueB, satSoft, lightLow),
      buttonBorder: toHsla(hueCenter, satSoft, 76, 0.28),
      buttonShadow: toHsla(hueCenter, satSoft, 20, 0.3),
      cardBorderHover: toHsla(hueCenter, sat, 68, 0.42),
      titleHover: toHsl(hueCenter, sat, 69),
      squareA: toHsla(hueA, sat, lightMid, 0.24),
      squareB: toHsla(hueB, satSoft, lightLow, 0.1),
    },
    seedValue
  );
}

function sampleDominantBuckets(image) {
  const sampled = image.clone().resize(IMAGE_SAMPLE_SIZE, IMAGE_SAMPLE_SIZE);
  const { data, width, height } = sampled.bitmap;
  const buckets = new Map();

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 100) continue;

      const hsl = rgbToHsl(r, g, b);
      if (hsl.l < 7 || hsl.l > 94) continue;

      const hueBucket = Math.round(hsl.h / 10) * 10;
      const satBucket = Math.round(hsl.s / 18) * 18;
      const lightBucket = Math.round(hsl.l / 14) * 14;
      const key = `${hueBucket}:${satBucket}:${lightBucket}`;
      const chromaBoost = clamp((hsl.s - 10) / 90, 0, 1);
      const lightBias = 1 - clamp(Math.abs(hsl.l - 52) / 52, 0, 1);
      const weight = 1 + chromaBoost * 1.8 + lightBias * 0.5;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          weight: 0,
          r: 0,
          g: 0,
          b: 0,
          h: 0,
          s: 0,
          l: 0,
        };
        buckets.set(key, bucket);
      }

      bucket.weight += weight;
      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
      bucket.h += hsl.h * weight;
      bucket.s += hsl.s * weight;
      bucket.l += hsl.l * weight;
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.weight > 0)
    .map((bucket) => ({
      score: bucket.weight,
      r: bucket.r / bucket.weight,
      g: bucket.g / bucket.weight,
      b: bucket.b / bucket.weight,
      h: bucket.h / bucket.weight,
      s: bucket.s / bucket.weight,
      l: bucket.l / bucket.weight,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildPaletteFromImageBuffer(imageBuffer, seedValue) {
  return Jimp.read(imageBuffer)
    .then((image) => {
      const buckets = sampleDominantBuckets(image);
      if (!buckets.length) {
        return fallbackPalette(seedValue);
      }

      const primary =
        buckets.find((bucket) => bucket.s >= 18 && bucket.l >= 12 && bucket.l <= 88) || buckets[0];
      const secondary =
        buckets.find(
          (bucket) =>
            bucket !== primary && bucket.s >= 14 && hueDistance(bucket.h, primary.h) >= 18
        ) ||
        buckets.find((bucket) => bucket !== primary) ||
        primary;

      const primaryHsl = { h: primary.h, s: primary.s, l: primary.l };
      const secondaryHsl = { h: secondary.h, s: secondary.s, l: secondary.l };

      return buildPaletteFromHsl(primaryHsl, secondaryHsl, seedValue, {
        source: "image",
        primaryHex: rgbToHex(primary.r, primary.g, primary.b),
        secondaryHex: rgbToHex(secondary.r, secondary.g, secondary.b),
      });
    })
    .catch((err) => {
      console.warn("Image palette extraction failed:", err.message);
      return fallbackPalette(seedValue);
    });
}

function decodeHtmlEntities(value) {
  if (!value) return "";

  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return String(value)
    .replace(/&#(\d+);/g, (_all, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (all, key) => (named[key] !== undefined ? named[key] : all));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteOpenplanetUrl(relativeOrAbsolute) {
  try {
    return new URL(String(relativeOrAbsolute || ""), OPENPLANET_ORIGIN).toString();
  } catch {
    return "";
  }
}

function pluginIdFromHref(href, index) {
  const match = String(href || "").match(/\/plugin\/([^/?#]+)/i);
  return match ? match[1].trim() : `plugin-${index + 1}`;
}

function parseTargetFromTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "Trackmania + Openplanet";
  return `${tags.join(" / ")} + Openplanet`;
}

function parseTotalPages(profileHtml) {
  let maxPage = 1;
  for (const match of profileHtml.matchAll(/href="\?page=(\d+)"/g)) {
    const page = Number(match[1]);
    if (Number.isFinite(page) && page > maxPage) maxPage = page;
  }
  return Math.max(1, Math.min(maxPage, OPENPLANET_MAX_PAGES));
}

function parsePluginCards(profileHtml, pageNumber) {
  const blocks = String(profileHtml || "").split('<div class="column is-4 plugin-info">').slice(1);
  const parsed = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const hrefMatch = block.match(/<a href="(\/plugin\/[^"]+)"/i);
    if (!hrefMatch) continue;

    const titleMatch = block.match(/<p class="plugin-title">\s*<a href="[^"]+">([\s\S]*?)<\/a>/i);
    const descMatch = block.match(/<p class="plugin-description">([\s\S]*?)<\/p>/i);
    const imageMatch = block.match(/<img class="plugin-image[^"]*"[^>]*src="([^"]+)"/i);
    const tagMatches = [...block.matchAll(/<span class="tag [^"]*">([\s\S]*?)<\/span>/gi)];

    const tags = tagMatches
      .map((match) => decodeHtmlEntities(stripHtml(match[1])))
      .map((tag) => tag.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const href = decodeHtmlEntities(hrefMatch[1]);
    const id = pluginIdFromHref(href, i);
    const name = decodeHtmlEntities(stripHtml(titleMatch ? titleMatch[1] : id)) || id;
    const description = decodeHtmlEntities(stripHtml(descMatch ? descMatch[1] : "")) || "No description provided.";
    const image = imageMatch ? toAbsoluteOpenplanetUrl(decodeHtmlEntities(imageMatch[1])) : "";

    parsed.push({
      id,
      name,
      description,
      category: "Plugin",
      status: "live",
      target: parseTargetFromTags(tags),
      install: PLUGIN_INSTALL_LABEL,
      link: toAbsoluteOpenplanetUrl(href),
      tone: toneForPluginId(id),
      image,
      tags,
      sourcePage: pageNumber,
    });
  }

  return parsed;
}

function profilePageUrl(pageNumber) {
  const url = new URL(OPENPLANET_PROFILE_URL);
  if (pageNumber > 1) {
    url.searchParams.set("page", String(pageNumber));
  } else {
    url.searchParams.delete("page");
  }
  return url.toString();
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENPLANET_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": REQUEST_UA,
      },
    });
    if (!response.ok) {
      throw new Error(`Fetch failed for ${url} (HTTP ${response.status})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImageBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENPLANET_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/*",
        "User-Agent": REQUEST_UA,
      },
    });
    if (!response.ok) {
      throw new Error(`Image fetch failed for ${url} (HTTP ${response.status})`);
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error(`Expected image content type for ${url}, received "${contentType}"`);
    }

    const raw = await response.arrayBuffer();
    return Buffer.from(raw);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(items, concurrency, worker) {
  const count = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  const output = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) break;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: count }, () => runner()));
  return output;
}

async function getImagePalette(imageUrl, seedValue) {
  if (!imageUrl) {
    return fallbackPalette(seedValue);
  }

  const now = Date.now();
  const cacheEntry = imagePaletteCache.get(imageUrl);
  if (cacheEntry && now < cacheEntry.expiresAt) {
    return normalizeImagePalette(cacheEntry.palette, seedValue);
  }

  try {
    const imageBuffer = await fetchImageBuffer(imageUrl);
    const palette = await buildPaletteFromImageBuffer(imageBuffer, seedValue);
    imagePaletteCache.set(imageUrl, {
      palette,
      expiresAt: now + IMAGE_PALETTE_CACHE_TTL_MS,
    });
    return normalizeImagePalette(palette, seedValue);
  } catch (err) {
    console.warn(`Image palette fallback for ${imageUrl}:`, err.message);
    const palette = fallbackPalette(seedValue);
    imagePaletteCache.set(imageUrl, {
      palette,
      expiresAt: now + 15 * 60 * 1000,
    });
    return palette;
  }
}

async function withImagePalettes(plugins) {
  return mapLimit(plugins, IMAGE_PALETTE_MAX_CONCURRENCY, async (plugin, index) => {
    const seed = `${plugin.id}:${plugin.image || ""}:${index}`;
    const imagePalette = await getImagePalette(plugin.image, seed);
    return {
      ...plugin,
      imagePalette,
    };
  });
}

async function fetchOpenplanetPlugins() {
  const firstPageHtml = await fetchHtml(profilePageUrl(1));
  const totalPages = parseTotalPages(firstPageHtml);
  const pagePayload = [{ pageNumber: 1, html: firstPageHtml }];

  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_unused, idx) => {
        const pageNumber = idx + 2;
        return fetchHtml(profilePageUrl(pageNumber)).then((html) => ({ pageNumber, html }));
      })
    );
    rest.sort((a, b) => a.pageNumber - b.pageNumber);
    pagePayload.push(...rest);
  }

  const deduped = new Map();
  for (const page of pagePayload) {
    const cards = parsePluginCards(page.html, page.pageNumber);
    for (const plugin of cards) {
      if (!deduped.has(plugin.id)) {
        deduped.set(plugin.id, plugin);
      }
    }
  }

  const plugins = [...deduped.values()];
  if (!plugins.length) {
    throw new Error("No plugins could be parsed from Openplanet profile HTML.");
  }

  const pluginsWithPalettes = await withImagePalettes(plugins);

  return {
    plugins: pluginsWithPalettes,
    pageCount: totalPages,
  };
}

async function getPluginsWithCache() {
  const now = Date.now();
  if (pluginCache.plugins.length && now < pluginCache.expiresAt) {
    return {
      plugins: pluginCache.plugins,
      fetchedAt: pluginCache.fetchedAt,
      pageCount: pluginCache.pageCount,
      cached: true,
      stale: false,
      warning: null,
    };
  }

  try {
    const fetched = await fetchOpenplanetPlugins();
    pluginCache.plugins = fetched.plugins;
    pluginCache.pageCount = fetched.pageCount;
    pluginCache.fetchedAt = new Date().toISOString();
    pluginCache.expiresAt = now + PLUGINS_CACHE_TTL_MS;

    return {
      plugins: pluginCache.plugins,
      fetchedAt: pluginCache.fetchedAt,
      pageCount: pluginCache.pageCount,
      cached: false,
      stale: false,
      warning: null,
    };
  } catch (err) {
    if (pluginCache.plugins.length) {
      console.warn("Openplanet fetch failed; returning stale cache:", err.message);
      return {
        plugins: pluginCache.plugins,
        fetchedAt: pluginCache.fetchedAt,
        pageCount: pluginCache.pageCount,
        cached: true,
        stale: true,
        warning: err.message,
      };
    }
    throw err;
  }
}

const app = express();
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        imgSrc: ["'self'", "data:", OPENPLANET_ORIGIN],
      },
    },
  })
);
app.use(morgan("combined"));
app.use(express.json({ limit: "200kb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/plugins", async (_req, res) => {
  try {
    const payload = await getPluginsWithCache();
    res.json({
      plugins: payload.plugins,
      count: payload.plugins.length,
      source: "openplanet",
      profile: OPENPLANET_PROFILE_URL,
      fetchedAt: payload.fetchedAt,
      pageCount: payload.pageCount,
      cached: payload.cached,
      stale: payload.stale,
      warning: payload.warning,
    });
  } catch (err) {
    console.error("Failed to load plugins from Openplanet:", err.message);
    res.status(502).json({
      error: "Failed to load plugins from Openplanet profile.",
      details: err.message,
      source: "openplanet",
      profile: OPENPLANET_PROFILE_URL,
    });
  }
});

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.use(express.static(FRONTEND_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err) {
    console.error("Unexpected server error:", err);
    return res.status(500).json({ error: "Unexpected server error." });
  }

  return res.status(500).json({ error: "Unknown server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Backend listening on http://127.0.0.1:${PORT}`);
  console.log(`FRONTEND_DIR=${FRONTEND_DIR}`);
  console.log(`OPENPLANET_PROFILE_URL=${OPENPLANET_PROFILE_URL}`);
  console.log(`PLUGINS_CACHE_TTL_MS=${PLUGINS_CACHE_TTL_MS}`);
  console.log(`IMAGE_PALETTE_CACHE_TTL_MS=${IMAGE_PALETTE_CACHE_TTL_MS}`);
  console.log(`IMAGE_PALETTE_MAX_CONCURRENCY=${IMAGE_PALETTE_MAX_CONCURRENCY}`);
});
