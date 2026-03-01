(function initToolTheme(global) {
  "use strict";

  const TOOL_META_BY_ID = {
    "map-cleaner": {
      id: "map-cleaner",
      slug: "Strip-RaceValidationGhost",
      tone: "cool",
    },
    "ghost-embedder": {
      id: "ghost-embedder",
      slug: "Embed-RaceValidationGhost",
      tone: "warm",
    },
    "embedded-checker": {
      id: "embedded-checker",
      slug: "Embedded-Blocks-And-Items-Checker",
      tone: "cool",
    },
    "replay-data-extractor": {
      id: "replay-data-extractor",
      slug: "Extract-Replay-Data",
      tone: "cool",
    },
    "medal-time-modifier": {
      id: "medal-time-modifier",
      slug: "Gbx-Medal-Time-Modifier",
      tone: "warm",
    },
    "map-validation-checker": {
      id: "map-validation-checker",
      slug: "Map-Validation-Checker",
      tone: "cool",
    },
  };

  const BASE_COOL_HUE = 194;
  const BASE_WARM_HUE = 24;
  const TAU = Math.PI * 2;
  const HUE_CIRCLE_START_RAD = (18 * Math.PI) / 180;

  const TOOL_ID_BY_SLUG = Object.values(TOOL_META_BY_ID).reduce((acc, item) => {
    acc[item.slug] = item.id;
    return acc;
  }, {});

  function wrapHue(hue) {
    const normalized = Number(hue) % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function radToHue(rad) {
    return wrapHue((rad * 180) / Math.PI);
  }

  function buildHueCircleMap(metaById, startRad = HUE_CIRCLE_START_RAD) {
    const ids = Object.keys(metaById);
    const count = Math.max(ids.length, 1);
    const step = TAU / count;

    return ids.reduce((acc, id, index) => {
      acc[id] = radToHue(startRad + step * index);
      return acc;
    }, {});
  }

  const HUE_BY_TOOL_ID = buildHueCircleMap(TOOL_META_BY_ID);

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function toHsl(hue, sat, light) {
    return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
  }

  function toHsla(hue, sat, light, alpha) {
    return `hsla(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}% / ${alpha})`;
  }

  function inferToolIdFromPathname(pathname) {
    const segments = String(pathname || "")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      if (TOOL_ID_BY_SLUG[segment]) return TOOL_ID_BY_SLUG[segment];
    }

    return null;
  }

  function normalizeToolInput(input) {
    if (typeof input === "string") {
      const directId = TOOL_META_BY_ID[input] ? input : null;
      const directSlug = TOOL_ID_BY_SLUG[input] || null;
      const inferredId = directId || directSlug || input;
      const known = TOOL_META_BY_ID[inferredId];
      if (known) return { ...known };
      return { id: inferredId, slug: inferredId, tone: "cool" };
    }

    if (!input || typeof input !== "object") {
      return { id: "unknown-tool", slug: "unknown-tool", tone: "cool" };
    }

    const idRaw = typeof input.id === "string" ? input.id : "";
    const linkRaw = typeof input.link === "string" ? input.link : "";
    const slugRaw = linkRaw.replace(/^\/+|\/+$/g, "");
    const slug = slugRaw || (typeof input.slug === "string" ? input.slug : "");
    const fromSlug = slug && TOOL_ID_BY_SLUG[slug] ? TOOL_ID_BY_SLUG[slug] : "";
    const knownFromId = idRaw && TOOL_META_BY_ID[idRaw] ? idRaw : "";
    const resolvedId = knownFromId || fromSlug || idRaw || slug || "unknown-tool";
    const known = TOOL_META_BY_ID[resolvedId];
    const tone =
      String(input.tone || known?.tone || "cool").toLowerCase() === "warm" ? "warm" : "cool";

    return {
      id: known?.id || resolvedId,
      slug: known?.slug || slug || resolvedId,
      tone,
      name: typeof input.name === "string" ? input.name : "",
      category: typeof input.category === "string" ? input.category : "",
      highlightHue: typeof input.highlightHue === "number" ? input.highlightHue : null,
    };
  }

  function getToolPalette(input) {
    const meta = normalizeToolInput(input);
    const seed = hashString(`${meta.id}:${meta.slug}`);
    const fallbackHue = radToHue(HUE_CIRCLE_START_RAD + ((seed % 8192) / 8192) * TAU);
    const hueCenter =
      typeof meta.highlightHue === "number"
        ? wrapHue(meta.highlightHue)
        : HUE_BY_TOOL_ID[meta.id] ?? fallbackHue;
    const hueA = wrapHue(hueCenter - 7);
    const hueB = wrapHue(hueCenter + 7);

    const highlightSat = 38;
    const highlightSatSoft = 32;
    const highlightLightHi = 61;
    const highlightLightMid = 56;
    const highlightLightLo = 51;

    const coolSat = 52;
    const coolLight = 57;
    const warmSat = 54;
    const warmLight = 56;

    return {
      id: meta.id,
      slug: meta.slug,
      tone: meta.tone,
      highlightHue: hueCenter,
      huePrimary: hueCenter,
      hueSecondary: BASE_COOL_HUE,
      hueTertiary: BASE_WARM_HUE,

      accentA: toHsla(hueA, highlightSat, highlightLightMid, 0.22),
      accentB: toHsla(hueB, highlightSatSoft, highlightLightLo - 1, 0.09),
      buttonA: toHsl(hueA, highlightSat, highlightLightHi),
      buttonB: toHsl(hueB, highlightSat, highlightLightMid),
      buttonC: toHsl(hueB, highlightSatSoft, highlightLightLo),
      buttonBorder: toHsla(hueCenter, highlightSatSoft, 76, 0.28),
      buttonShadow: toHsla(hueCenter, highlightSatSoft, 20, 0.3),
      cardBorderHover: toHsla(hueCenter, highlightSat, 68, 0.42),
      titleHover: toHsl(hueCenter, highlightSat, 69),

      bgCool: toHsla(BASE_COOL_HUE, coolSat, coolLight, 0.16),
      bgWarm: toHsla(BASE_WARM_HUE, warmSat, warmLight, 0.13),
      bgHighlight: toHsla(hueCenter, highlightSatSoft, highlightLightMid, 0.055),
      sweepWarm: toHsla(BASE_WARM_HUE, warmSat, warmLight, 0.22),
      sweepCool: toHsla(BASE_COOL_HUE, coolSat, coolLight, 0.18),
      dropA: toHsla(hueA, highlightSat, highlightLightHi, 0.18),
      dropB: toHsla(hueB, highlightSatSoft, highlightLightMid, 0.12),
      dropC: toHsla(hueB, highlightSatSoft, highlightLightLo, 0.08),
      dropHoverBorder: toHsla(hueCenter, highlightSat, 66, 0.56),
      dropDragBorder: toHsla(hueCenter, highlightSat, 64, 0.72),
      dropReadyBorder: toHsla(154, 61, 60, 0.68),
      liteHoverBorder: toHsla(hueCenter, highlightSat, 67, 0.64),
      squareA: toHsla(hueA, highlightSat, highlightLightMid, 0.24),
      squareB: toHsla(hueB, highlightSatSoft, highlightLightLo, 0.1),

      warmVar: toHsl(BASE_WARM_HUE, warmSat, warmLight),
      coolVar: toHsl(BASE_COOL_HUE, coolSat, coolLight),
    };
  }

  function applyPaletteToRoot(palette, rootElement) {
    const root = rootElement || (typeof document !== "undefined" ? document.documentElement : null);
    if (!root || !palette) return palette;

    const vars = {
      "--tool-accent-a": palette.accentA,
      "--tool-accent-b": palette.accentB,
      "--tool-btn-a": palette.buttonA,
      "--tool-btn-b": palette.buttonB,
      "--tool-btn-c": palette.buttonC,
      "--tool-btn-border": palette.buttonBorder,
      "--tool-btn-shadow": palette.buttonShadow,
      "--tool-card-border-hover": palette.cardBorderHover,
      "--tool-title-hover": palette.titleHover,

      "--theme-bg-cool": palette.bgCool,
      "--theme-bg-warm": palette.bgWarm,
      "--theme-bg-highlight": palette.bgHighlight,
      "--theme-sweep-warm": palette.sweepWarm,
      "--theme-sweep-cool": palette.sweepCool,
      "--theme-drop-a": palette.dropA,
      "--theme-drop-b": palette.dropB,
      "--theme-drop-c": palette.dropC,
      "--theme-drop-hover-border": palette.dropHoverBorder,
      "--theme-drop-drag-border": palette.dropDragBorder,
      "--theme-drop-ready-border": palette.dropReadyBorder,
      "--theme-btn-a": palette.buttonA,
      "--theme-btn-b": palette.buttonB,
      "--theme-btn-highlight": palette.titleHover,
      "--theme-btn-shadow": palette.buttonShadow,
      "--theme-btn-lite-hover": palette.liteHoverBorder,
      "--theme-accent": palette.titleHover,
      "--theme-accent-alt": palette.buttonB,
      "--theme-highlight": palette.titleHover,
      "--theme-highlight-soft": palette.accentA,
      "--theme-highlight-a": palette.buttonA,
      "--theme-highlight-b": palette.buttonB,
      "--theme-highlight-deep": palette.accentB,

      "--warm": palette.warmVar,
      "--cool": palette.coolVar,
    };

    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    return palette;
  }

  function detectToolIdFromDocument() {
    if (typeof document === "undefined") return null;
    const fromData =
      document.documentElement.getAttribute("data-tool-id") ||
      document.body?.getAttribute("data-tool-id") ||
      "";

    if (fromData) {
      if (TOOL_META_BY_ID[fromData]) return fromData;
      if (TOOL_ID_BY_SLUG[fromData]) return TOOL_ID_BY_SLUG[fromData];
      return fromData;
    }

    return inferToolIdFromPathname(global.location?.pathname || "");
  }

  function applyToolTheme(input, rootElement) {
    const target = input || detectToolIdFromDocument();
    if (!target) return null;
    const palette = getToolPalette(target);
    applyPaletteToRoot(palette, rootElement);
    return palette;
  }

  const api = {
    TOOL_META_BY_ID,
    TOOL_ID_BY_SLUG,
    HUE_BY_TOOL_ID,
    hashString,
    wrapHue,
    radToHue,
    buildHueCircleMap,
    inferToolIdFromPathname,
    normalizeToolInput,
    getToolPalette,
    applyPaletteToRoot,
    applyToolTheme,
    detectToolIdFromDocument,
  };

  global.ToolTheme = api;

  if (typeof document !== "undefined") {
    applyToolTheme();
  }
})(window);
