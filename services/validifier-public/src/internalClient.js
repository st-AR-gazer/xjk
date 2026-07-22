import fs from "node:fs";
import path from "node:path";

const INTERNAL_ACCESS_TOKEN_HEADER = "X-Validifier-Access-Token";
const INTERNAL_SUBMISSION_SECRET_HEADER = "X-Validifier-Internal-Secret";

function assertInternalSubmissionConfiguration(config) {
  if (config.internalBaseUrl && !String(config.internalSubmissionSecret || "").trim()) {
    const error = new Error(
      "VALIDIFIER_INTERNAL_SUBMISSION_SECRET is required whenever VALIDIFIER_INTERNAL_BASE_URL is configured."
    );
    error.code = "invalid_internal_configuration";
    throw error;
  }
}

class UpstreamHttpError extends Error {
  constructor(message, statusCode, payload = null) {
    super(message);
    this.name = "UpstreamHttpError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function createInternalClient(inputConfig) {
  const config = { ...inputConfig };
  assertInternalSubmissionConfiguration(config);

  function ensureConfigured() {
    if (!config.internalBaseUrl) {
      const error = new Error("Public service is missing the private backend base URL.");
      error.code = "upstream_unavailable";
      throw error;
    }
  }

  function buildHeaders(body) {
    const headers = {
      accept: "application/json",
      "user-agent": "validifier.xjk.yt public service",
    };

    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (config.internalToken) {
      const tokenValue = config.internalTokenPrefix
        ? `${config.internalTokenPrefix} ${config.internalToken}`
        : config.internalToken;
      if (String(config.internalTokenHeader || "").toLowerCase() === "authorization") {
        headers.authorization = tokenValue;
      } else {
        headers[config.internalTokenHeader] = tokenValue;
      }
    }

    return headers;
  }

  function buildSubmissionHeaders() {
    const headers = {
      accept: "application/json",
      "user-agent": "validifier.xjk.yt public service",
    };

    if (config.internalSubmissionSecret) {
      headers[INTERNAL_SUBMISSION_SECRET_HEADER] = config.internalSubmissionSecret;
    }

    return headers;
  }

  async function requestJson(relativePath, options = {}) {
    ensureConfigured();

    const safePath = String(relativePath || "").replace(/^\/+/, "");
    const url = `${config.internalBaseUrl}/${safePath}`;
    const headers = {
      ...buildHeaders(options.body),
      ...(options.headers || {}),
    };
    if (config.internalAccessToken && safePath.startsWith("v1/")) {
      headers[INTERNAL_ACCESS_TOKEN_HEADER] = config.internalAccessToken;
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
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

    if (!response.ok) {
      throw new UpstreamHttpError(
        `Private backend request failed with HTTP ${response.status}.`,
        response.status,
        payload
      );
    }

    return payload;
  }

  async function resolveReplayBuildId() {
    if (config.replayBuildId) {
      return config.replayBuildId;
    }

    const state = await requestJson("/admin/api/state");
    const builds = Array.isArray(state?.builds) ? state.builds.filter((item) => item && item.supported !== false) : [];
    const latest = builds
      .slice()
      .sort((left, right) => String(right.build_id || "").localeCompare(String(left.build_id || "")))[0];

    if (!latest?.build_id) {
      const error = new Error("The private backend did not expose any supported replay build.");
      error.code = "upstream_unavailable";
      throw error;
    }

    return String(latest.build_id);
  }

  async function submitReplayMultipart({
    recordId,
    mapUid,
    rank = null,
    mapPath,
    mapFilename,
    replayPath,
    replayFilename,
    submissionId,
    submissionSource = "validifier.xjk.yt",
    buildId = "",
    validateExeVersion = "",
  }) {
    ensureConfigured();
    assertInternalSubmissionConfiguration(config);

    const form = new FormData();
    form.append("record_id", String(recordId || "").trim());
    form.append("map_uid", String(mapUid || "").trim());
    if (rank !== null && rank !== undefined && String(rank).trim?.() !== "") {
      form.append("rank", String(rank));
    }
    if (submissionId) {
      form.append("submission_id", String(submissionId));
    }
    if (submissionSource) {
      form.append("submission_source", String(submissionSource));
    }
    if (buildId) {
      form.append("build_id", String(buildId));
    }
    if (validateExeVersion) {
      form.append("validate_exe_version", String(validateExeVersion));
    }

    const mapBuffer = await fs.promises.readFile(mapPath);
    const replayBuffer = await fs.promises.readFile(replayPath);
    form.append(
      "map_file",
      new Blob([mapBuffer], { type: "application/octet-stream" }),
      mapFilename || path.basename(mapPath)
    );
    form.append(
      "replay_file",
      new Blob([replayBuffer], { type: "application/octet-stream" }),
      replayFilename || path.basename(replayPath)
    );

    const response = await fetch(`${config.internalBaseUrl}/internal/api/v1/submissions/replay`, {
      method: "POST",
      headers: buildSubmissionHeaders(),
      body: form,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
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

    if (!response.ok) {
      throw new UpstreamHttpError(
        `Private backend request failed with HTTP ${response.status}.`,
        response.status,
        payload
      );
    }

    return payload;
  }

  return {
    requestJson,
    resolveReplayBuildId,
    submitReplayMultipart,
  };
}

export {
  INTERNAL_ACCESS_TOKEN_HEADER,
  INTERNAL_SUBMISSION_SECRET_HEADER,
  UpstreamHttpError,
  assertInternalSubmissionConfiguration,
  createInternalClient,
};
