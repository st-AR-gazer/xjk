function asTrimmedString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function unwrapEnvelope(payload) {
  if (payload?.ok === true && payload.data !== undefined) return payload.data;
  if (payload?.data !== undefined) return payload.data;
  return payload;
}

function extractItems(payload) {
  const data = unwrapEnvelope(payload);
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  for (const key of ["items", "maps", "totdMaps", "totds", "tracks", "history", "results", "rows"]) {
    if (Array.isArray(data[key])) return data[key];
  }

  if (data.map || data.cotd || data.currentCotd || data.track) {
    return [data];
  }

  for (const key of ["latest", "today", "current"]) {
    if (data[key] && typeof data[key] === "object") return [data[key]];
  }

  return [data];
}

function pickDate(root, map) {
  return (
    root.cotdDate ??
    root.cotd_date ??
    root.totdDate ??
    root.totd_date ??
    root.trackOfTheDayDate ??
    root.track_of_the_day_date ??
    root.date ??
    map.cotdDate ??
    map.cotd_date ??
    map.totdDate ??
    map.totd_date ??
    map.trackOfTheDayDate ??
    map.track_of_the_day_date ??
    map.date ??
    root.startedAt ??
    root.started_at ??
    root.startDate ??
    root.start_date ??
    map.startedAt ??
    map.started_at ??
    map.startDate ??
    map.start_date
  );
}

function normalizeSourceMap(item, index) {
  const root = item && typeof item === "object" ? item : {};
  const map =
    root.cotd && typeof root.cotd === "object"
      ? root.cotd
      : root.currentCotd && typeof root.currentCotd === "object"
        ? root.currentCotd
        : root.map && typeof root.map === "object"
          ? root.map
          : root.track && typeof root.track === "object"
            ? root.track
            : root;

  const mapUid = asTrimmedString(map.mapUid ?? map.mapUID ?? map.map_uid ?? map.uid);
  const mapName = asTrimmedString(map.mapName ?? map.map_name ?? map.trackName ?? map.track_name ?? map.name);
  if (!mapUid && !mapName) return null;

  return {
    id: root.id,
    source: "totd-fetch",
    status: "pending_classifier",
    cotd: {
      ...map,
      cotdDate: pickDate(root, map),
    },
    records: root.records || root.topRecords || root.top_records || map.records || [],
    evidenceSummary: root.evidenceSummary || root.evidence_summary || root.evidence || {},
    warnings: Array.isArray(root.warnings) ? root.warnings.filter(Boolean) : [],
    raw: root.raw || root.debug || root,
    sourceIndex: index,
  };
}

class TotdSourceError extends Error {
  constructor(message, statusCode = 0, payload = null) {
    super(message);
    this.name = "TotdSourceError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function createTotdClient(config) {
  const sourceUrl = String(config.sourceUrl || "").trim();
  const timeoutMs = Math.max(1000, Number(config.sourceTimeoutMs) || 15000);

  function isConfigured() {
    return Boolean(sourceUrl);
  }

  function buildHeaders() {
    const headers = {
      accept: "application/json",
      "user-agent": "cotd.xjk.yt public service",
    };

    if (config.sourceToken) {
      const tokenValue = config.sourceTokenPrefix
        ? `${config.sourceTokenPrefix} ${config.sourceToken}`
        : config.sourceToken;
      if (String(config.sourceTokenHeader || "").toLowerCase() === "authorization") {
        headers.authorization = tokenValue;
      } else {
        headers[config.sourceTokenHeader] = tokenValue;
      }
    }

    return headers;
  }

  async function fetchLatest() {
    const fetchedAt = new Date().toISOString();
    if (!isConfigured()) {
      return {
        status: "source_not_configured",
        fetchedAt,
        source: {
          mode: "stub",
          urlConfigured: false,
        },
        maps: [],
        warnings: ["COTD_TOTD_SOURCE_URL is not configured, so no live TOTD fetch was attempted."],
      };
    }

    const response = await fetch(sourceUrl, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new TotdSourceError("TOTD source returned non-JSON content.", response.status);
      }
    }

    if (!response.ok || payload?.ok === false) {
      throw new TotdSourceError(`TOTD source request failed with HTTP ${response.status}.`, response.status, payload);
    }

    const maps = extractItems(payload).map(normalizeSourceMap).filter(Boolean);
    return {
      status: maps.length ? "ok" : "empty",
      fetchedAt,
      source: {
        mode: "http",
        urlConfigured: true,
      },
      maps,
      warnings: Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [],
    };
  }

  return {
    fetchLatest,
    isConfigured,
  };
}

export { TotdSourceError, createTotdClient };
