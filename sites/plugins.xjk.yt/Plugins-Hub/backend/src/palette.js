import { Jimp } from "jimp";
import { hashString } from "./hash.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(hue) {
  const normalized = Number(hue) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function hueDistance(left, right) {
  const difference = Math.abs(wrapHue(left) - wrapHue(right));
  return difference > 180 ? 360 - difference : difference;
}

function blendHue(fromHue, toHue, amount) {
  const from = wrapHue(fromHue);
  const to = wrapHue(toHue);
  const difference = ((to - from + 540) % 360) - 180;
  return wrapHue(from + difference * clamp(amount, 0, 1));
}

function rgbToHex(red, green, blue) {
  const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${part(red)}${part(green)}${part(blue)}`;
}

function rgbToHsl(red, green, blue) {
  const normalizedRed = clamp(red, 0, 255) / 255;
  const normalizedGreen = clamp(green, 0, 255) / 255;
  const normalizedBlue = clamp(blue, 0, 255) / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (maximum) {
      case normalizedRed:
        hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
        break;
      case normalizedGreen:
        hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
        break;
      default:
        hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
        break;
    }
  }

  return {
    h: wrapHue(hue),
    s: clamp(saturation * 100, 0, 100),
    l: clamp(lightness * 100, 0, 100),
  };
}

function toHsl(hue, saturation, lightness) {
  return `hsl(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 100))}% ${Math.round(
    clamp(lightness, 0, 100)
  )}%)`;
}

function toHsla(hue, saturation, lightness, alpha) {
  return `hsla(${Math.round(wrapHue(hue))} ${Math.round(clamp(saturation, 0, 100))}% ${Math.round(
    clamp(lightness, 0, 100)
  )}% / ${alpha})`;
}

export function fallbackPalette(seedValue) {
  const seed = hashString(String(seedValue || ""));
  const hueCenter = wrapHue((seed % 360) + 26);
  const hueA = wrapHue(hueCenter - 6);
  const hueB = wrapHue(hueCenter + 6);
  const saturation = 36;
  const softSaturation = 30;
  const highLightness = 60;
  const middleLightness = 55;
  const lowLightness = 50;

  return {
    source: "fallback",
    primaryHex: rgbToHex(120, 150, 180),
    secondaryHex: rgbToHex(104, 136, 168),
    accentA: toHsla(hueA, saturation, middleLightness, 0.22),
    accentB: toHsla(hueB, softSaturation, lowLightness - 1, 0.09),
    buttonA: toHsl(hueA, saturation, highLightness),
    buttonB: toHsl(hueB, saturation, middleLightness),
    buttonC: toHsl(hueB, softSaturation, lowLightness),
    buttonBorder: toHsla(hueCenter, softSaturation, 76, 0.28),
    buttonShadow: toHsla(hueCenter, softSaturation, 20, 0.3),
    cardBorderHover: toHsla(hueCenter, saturation, 68, 0.42),
    titleHover: toHsl(hueCenter, saturation, 69),
    squareA: toHsla(hueA, saturation, middleLightness, 0.24),
    squareB: toHsla(hueB, softSaturation, lowLightness, 0.1),
  };
}

export function normalizeImagePalette(palette, seedValue) {
  const fallback = fallbackPalette(seedValue);
  const field = (name) => (typeof palette?.[name] === "string" ? palette[name] : fallback[name]);
  return {
    source: field("source"),
    primaryHex: field("primaryHex"),
    secondaryHex: field("secondaryHex"),
    accentA: field("accentA"),
    accentB: field("accentB"),
    buttonA: field("buttonA"),
    buttonB: field("buttonB"),
    buttonC: field("buttonC"),
    buttonBorder: field("buttonBorder"),
    buttonShadow: field("buttonShadow"),
    cardBorderHover: field("cardBorderHover"),
    titleHover: field("titleHover"),
    squareA: field("squareA"),
    squareB: field("squareB"),
  };
}

function buildPaletteFromHsl(primary, secondary, seedValue, metadata = {}) {
  const seed = hashString(String(seedValue || ""));
  const fallbackHue = wrapHue((seed % 360) + 18);
  const hueCenter = Number.isFinite(primary?.h) ? wrapHue(primary.h) : fallbackHue;
  const rawAccentHue = Number.isFinite(secondary?.h) ? wrapHue(secondary.h) : wrapHue(hueCenter + 10);
  const accentHue = blendHue(hueCenter, rawAccentHue, 0.34);
  const hueA = wrapHue(hueCenter - 6.5);
  const hueB = wrapHue(accentHue + 5.5);
  const primarySaturation = Number.isFinite(primary?.s) ? primary.s : 34;
  const secondarySaturation = Number.isFinite(secondary?.s) ? secondary.s : primarySaturation;
  const primaryLightness = Number.isFinite(primary?.l) ? primary.l : 52;
  const saturation = clamp(primarySaturation * 0.72 + 9, 24, 54);
  const softSaturation = clamp(secondarySaturation * 0.58 + 10, 20, 44);
  const highLightness = clamp(primaryLightness * 0.64 + 20, 48, 64);
  const middleLightness = clamp(highLightness - 5, 42, 58);
  const lowLightness = clamp(middleLightness - 6, 36, 52);

  return normalizeImagePalette(
    {
      source: metadata.source || "image",
      primaryHex: metadata.primaryHex || rgbToHex(122, 151, 176),
      secondaryHex: metadata.secondaryHex || rgbToHex(108, 138, 162),
      accentA: toHsla(hueA, saturation, middleLightness, 0.22),
      accentB: toHsla(hueB, softSaturation, lowLightness - 1, 0.09),
      buttonA: toHsl(hueA, saturation, highLightness),
      buttonB: toHsl(hueB, saturation, middleLightness),
      buttonC: toHsl(hueB, softSaturation, lowLightness),
      buttonBorder: toHsla(hueCenter, softSaturation, 76, 0.28),
      buttonShadow: toHsla(hueCenter, softSaturation, 20, 0.3),
      cardBorderHover: toHsla(hueCenter, saturation, 68, 0.42),
      titleHover: toHsl(hueCenter, saturation, 69),
      squareA: toHsla(hueA, saturation, middleLightness, 0.24),
      squareB: toHsla(hueB, softSaturation, lowLightness, 0.1),
    },
    seedValue
  );
}

function sampleDominantBuckets(image, imageSampleSize) {
  const sampled = image.clone().resize({ w: imageSampleSize, h: imageSampleSize });
  const { data, width, height } = sampled.bitmap;
  const buckets = new Map();

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      if (alpha < 100) continue;

      const hsl = rgbToHsl(red, green, blue);
      if (hsl.l < 7 || hsl.l > 94) continue;
      const key = `${Math.round(hsl.h / 10) * 10}:${Math.round(hsl.s / 18) * 18}:${Math.round(hsl.l / 14) * 14}`;
      const chromaBoost = clamp((hsl.s - 10) / 90, 0, 1);
      const lightBias = 1 - clamp(Math.abs(hsl.l - 52) / 52, 0, 1);
      const weight = 1 + chromaBoost * 1.8 + lightBias * 0.5;
      const bucket = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0, h: 0, s: 0, l: 0 };
      bucket.weight += weight;
      bucket.r += red * weight;
      bucket.g += green * weight;
      bucket.b += blue * weight;
      bucket.h += hsl.h * weight;
      bucket.s += hsl.s * weight;
      bucket.l += hsl.l * weight;
      buckets.set(key, bucket);
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
    .sort((left, right) => right.score - left.score);
}

export async function buildPaletteFromImageBuffer(
  imageBuffer,
  seedValue,
  { imageSampleSize = 72, readImage = (buffer) => Jimp.read(buffer), logger = console } = {}
) {
  try {
    const image = await readImage(imageBuffer);
    const buckets = sampleDominantBuckets(image, imageSampleSize);
    if (!buckets.length) return fallbackPalette(seedValue);
    const primary = buckets.find((bucket) => bucket.s >= 18 && bucket.l >= 12 && bucket.l <= 88) || buckets[0];
    const secondary =
      buckets.find((bucket) => bucket !== primary && bucket.s >= 14 && hueDistance(bucket.h, primary.h) >= 18) ||
      buckets.find((bucket) => bucket !== primary) ||
      primary;
    return buildPaletteFromHsl(primary, secondary, seedValue, {
      source: "image",
      primaryHex: rgbToHex(primary.r, primary.g, primary.b),
      secondaryHex: rgbToHex(secondary.r, secondary.g, secondary.b),
    });
  } catch (error) {
    logger.warn?.("Image palette extraction failed:", error?.message || error);
    return fallbackPalette(seedValue);
  }
}

async function mapLimit(items, concurrency, worker) {
  const runnerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  const output = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: runnerCount }, run));
  return output;
}

export function createImagePaletteService({ config, fetchImageBuffer, now = Date.now, logger = console } = {}) {
  if (!config || typeof fetchImageBuffer !== "function") {
    throw new Error("Image palette config and fetchImageBuffer are required.");
  }
  const cache = new Map();
  const inFlight = new Map();

  function setCache(key, palette, expiresAt) {
    cache.delete(key);
    cache.set(key, { palette, expiresAt });
    while (cache.size > config.imagePaletteCacheMaxEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  function cachedPalette(key, seedValue) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (now() >= entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return normalizeImagePalette(entry.palette, seedValue);
  }

  async function getImagePalette(imageUrl, seedValue) {
    const key = String(imageUrl || "").trim();
    if (!key) return fallbackPalette(seedValue);
    const cached = cachedPalette(key, seedValue);
    if (cached) return cached;

    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const imageBuffer = await fetchImageBuffer(key);
          const palette = await buildPaletteFromImageBuffer(imageBuffer, seedValue, {
            imageSampleSize: config.imageSampleSize,
            logger,
          });
          setCache(key, palette, now() + config.imagePaletteCacheTtlMs);
          return palette;
        } catch (error) {
          logger.warn?.(`Image palette fallback for ${key}:`, error?.message || error);
          const palette = fallbackPalette(seedValue);
          setCache(key, palette, now() + config.imagePaletteFailureCacheTtlMs);
          return palette;
        }
      })();
      inFlight.set(key, pending);
    }

    try {
      return normalizeImagePalette(await pending, seedValue);
    } finally {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    }
  }

  async function withImagePalettes(plugins) {
    return mapLimit(plugins, config.imagePaletteMaxConcurrency, async (plugin, index) => ({
      ...plugin,
      imagePalette: await getImagePalette(plugin.image, `${plugin.id}:${plugin.image || ""}:${index}`),
    }));
  }

  return {
    get cacheSize() {
      return cache.size;
    },
    get inFlightSize() {
      return inFlight.size;
    },
    getImagePalette,
    withImagePalettes,
  };
}

export { mapLimit, rgbToHsl };
