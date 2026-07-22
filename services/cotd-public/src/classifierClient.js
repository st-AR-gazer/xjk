import { normalizeConfidence, normalizeRankedStyles } from "./classificationNormalization.js";

function normalizeClassifierPayload(payload, mode) {
  const data = payload?.ok === true && payload?.data ? payload.data : payload?.data || payload || {};
  const rawStyles = data.rankedStyles || data.ranked_styles || data.styles || data.predictions || [];
  const rankedStyles = normalizeRankedStyles(rawStyles);

  const normalizedRankedStyles = rankedStyles.length ? rankedStyles : [{ rank: 1, style: "unknown", score: 0 }];

  const confidence = normalizeConfidence(data.confidence, normalizedRankedStyles);
  const metadata = data.classifier || data.metadata || data.model || {};

  return {
    rankedStyles: normalizedRankedStyles,
    confidence,
    status: String(data.status || (mode === "stub" ? "demo" : "classified")).trim(),
    classifier: {
      mode,
      provider: String(metadata.provider || data.provider || "trackmania-map-classifier").trim(),
      model: String(metadata.model || data.model || "generalized-map-style").trim(),
      version: String(metadata.version || data.version || "").trim() || null,
      generatedAt: data.generatedAt || data.generated_at || new Date().toISOString(),
      baseUrlConfigured: mode === "upstream",
    },
    warnings: Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [],
    raw: data.raw || data.debug || null,
  };
}

function createStubClassification({ reason = "classifier_not_configured" } = {}) {
  return {
    rankedStyles: [
      { rank: 1, style: "mixed", score: 0.34, evidence: ["Demo placeholder until classifier ingestion is wired."] },
      { rank: 2, style: "technical", score: 0.29 },
      { rank: 3, style: "speed", score: 0.21 },
    ],
    confidence: {
      score: 0,
      label: "demo",
    },
    status: "demo",
    classifier: {
      mode: "stub",
      provider: "trackmania-map-classifier",
      model: "generalized-map-style",
      version: null,
      generatedAt: new Date().toISOString(),
      baseUrlConfigured: false,
    },
    warnings: [
      reason === "classifier_not_configured"
        ? "COTD_CLASSIFIER_BASE_URL is not configured, so this classification is demo data."
        : "Classifier request failed, so this classification is fallback demo data.",
    ],
    raw: {
      reason,
    },
  };
}

class ClassifierHttpError extends Error {
  constructor(message, statusCode, payload = null) {
    super(message);
    this.name = "ClassifierHttpError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function createClassifierClient(config) {
  const baseUrl = String(config.classifierBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const classifierPath = String(config.classifierPath || "/api/v1/classify").trim() || "/api/v1/classify";
  const timeoutMs = Math.max(1000, Number(config.classifierTimeoutMs) || 15000);

  function isConfigured() {
    return Boolean(baseUrl);
  }

  function buildHeaders() {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "cotd.xjk.yt public service",
    };

    if (config.classifierToken) {
      const tokenValue = config.classifierTokenPrefix
        ? `${config.classifierTokenPrefix} ${config.classifierToken}`
        : config.classifierToken;
      if (String(config.classifierTokenHeader || "").toLowerCase() === "authorization") {
        headers.authorization = tokenValue;
      } else {
        headers[config.classifierTokenHeader] = tokenValue;
      }
    }

    return headers;
  }

  async function classify({ map, evidence }) {
    if (!isConfigured()) {
      return createStubClassification();
    }

    const safePath = classifierPath.startsWith("/") ? classifierPath : `/${classifierPath}`;
    const response = await fetch(`${baseUrl}${safePath}`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        map,
        evidence,
        requestedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || payload?.ok === false) {
      throw new ClassifierHttpError(
        `Classifier request failed with HTTP ${response.status}.`,
        response.status,
        payload
      );
    }

    return normalizeClassifierPayload(payload, "upstream");
  }

  async function classifyWithFallback(input) {
    try {
      return await classify(input);
    } catch (error) {
      console.warn("[cotd-public] classifier request fell back to stub:", error?.message || error);
      return createStubClassification({ reason: "classifier_unavailable" });
    }
  }

  return {
    classify,
    classifyWithFallback,
    isConfigured,
  };
}

export { ClassifierHttpError, createClassifierClient, createStubClassification, normalizeClassifierPayload };
