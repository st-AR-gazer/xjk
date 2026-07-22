import { waitForGlobalNadeoSlot } from "./nadeoGlobalThrottle.js";
import { toTextOrFallback } from "./valueUtils.js";

function requestMetadata(url, { method = "GET", body } = {}) {
  let targetHost = "";
  let targetPath = "/";
  try {
    const parsed = new URL(String(url || ""));
    targetHost = String(parsed.host || "").toLowerCase();
    targetPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
  } catch {}

  const bodyText =
    body === null || body === undefined
      ? ""
      : typeof body === "string"
        ? body
        : body instanceof URLSearchParams
          ? body.toString()
          : "";

  return {
    method: String(method || "GET").toUpperCase(),
    targetHost,
    targetPath,
    requestBytes: bodyText ? Buffer.byteLength(bodyText, "utf8") : 0,
  };
}

function responseErrorDetails(payload, responseText, response) {
  return (
    payload?.message ||
    payload?.error ||
    payload?.detail ||
    String(responseText || "").trim() ||
    `HTTP ${response.status}`
  );
}

function createHttpRequestError({ message, statusCode, payload, responseText, requestUrl, requestMethod }) {
  const error = new Error(message);
  error.statusCode = Number(statusCode || 0);
  error.payload = payload;
  error.responseText = String(responseText || "");
  error.requestUrl = String(requestUrl || "");
  error.requestMethod = String(requestMethod || "GET").toUpperCase();
  return error;
}

class ThrottledHttpClientRuntime {
  constructor({
    fetchImpl = fetch,
    requestTimeoutMs = 15000,
    minRequestGapMs = 0,
    globalThrottleFile = "",
    globalMinRequestGapMs = 0,
    defaultThrottleLabel = "outbound-request",
    telemetryComponent = "",
    telemetryService = "",
    onHttpEvent = null,
    createError = createHttpRequestError,
    now = Date.now,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
    this.minRequestGapMs = Math.max(0, Number(minRequestGapMs) || 0);
    this.globalThrottleFile = String(globalThrottleFile || "").trim();
    this.globalMinRequestGapMs = Math.max(0, Number(globalMinRequestGapMs) || 0);
    this.defaultThrottleLabel = toTextOrFallback(defaultThrottleLabel, "outbound-request");
    this.telemetryComponent = String(telemetryComponent || "").trim();
    this.telemetryService = String(telemetryService || "").trim();
    this.onHttpEvent = typeof onHttpEvent === "function" ? onHttpEvent : null;
    this.createError = typeof createError === "function" ? createError : createHttpRequestError;
    this.now = now;
    this.sleep = sleep;
    this.nextRequestAtMs = 0;
  }

  buildHttpEvent(metadata, { statusCode, startedAt, responseBytes = 0 } = {}) {
    return {
      direction: "outgoing",
      component: this.telemetryComponent,
      service: this.telemetryService,
      method: metadata.method,
      route: metadata.targetPath,
      targetHost: metadata.targetHost,
      targetPath: metadata.targetPath,
      statusCode: Number(statusCode || 0),
      durationMs: this.now() - startedAt,
      bytesIn: metadata.requestBytes,
      bytesOut: responseBytes,
    };
  }

  emitHttpEvent(metadata, result = {}) {
    if (!this.onHttpEvent) return;
    try {
      this.onHttpEvent(this.buildHttpEvent(metadata, result));
    } catch {}
  }

  async waitForRateSlot(label = this.defaultThrottleLabel) {
    if (this.minRequestGapMs > 0) {
      const waitMs = Math.max(0, this.nextRequestAtMs - this.now());
      if (waitMs > 0) await this.sleep(waitMs);
      this.nextRequestAtMs = this.now() + this.minRequestGapMs;
    }

    const sharedGapMs = Math.max(this.minRequestGapMs, this.globalMinRequestGapMs);
    if (sharedGapMs > 0) {
      await waitForGlobalNadeoSlot({
        stateFile: this.globalThrottleFile,
        minGapMs: sharedGapMs,
        label: toTextOrFallback(label, this.defaultThrottleLabel),
      });
    }
  }

  async fetchResponse(url, fetchOptions, throttleLabel = this.defaultThrottleLabel) {
    const metadata = requestMetadata(url, fetchOptions);
    const startedAt = this.now();
    await this.waitForRateSlot(throttleLabel);

    try {
      const response = await this.fetchImpl(url, {
        ...fetchOptions,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      return { metadata, response, startedAt };
    } catch (error) {
      this.emitHttpEvent(metadata, { statusCode: 0, startedAt });
      throw error;
    }
  }

  async requestJson(url, options = {}) {
    const {
      throttleLabel = this.defaultThrottleLabel,
      formatError = ({ status, method, requestUrl, details }) =>
        `Request failed (${status}) for ${method} ${requestUrl}: ${details}`,
      ...fetchOptions
    } = options;
    const { metadata, response, startedAt } = await this.fetchResponse(url, fetchOptions, throttleLabel);

    const responseText = await response.text();
    const responseBytes = responseText ? Buffer.byteLength(responseText, "utf8") : 0;
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {}
    }

    this.emitHttpEvent(metadata, {
      statusCode: response.status,
      startedAt,
      responseBytes,
    });

    if (!response.ok) {
      const details = responseErrorDetails(payload, responseText, response);
      const message = formatError({
        status: response.status,
        method: metadata.method,
        requestUrl: String(url || ""),
        details,
      });
      throw this.createError({
        message,
        statusCode: response.status,
        payload,
        responseText,
        requestUrl: url,
        requestMethod: metadata.method,
      });
    }

    return payload;
  }

  async requestBinary(url, options = {}) {
    const {
      throttleLabel = this.defaultThrottleLabel,
      formatError = ({ status, details }) => `Binary request failed with HTTP ${status}: ${details}`,
      ...fetchOptions
    } = options;
    const { metadata, response, startedAt } = await this.fetchResponse(url, fetchOptions, throttleLabel);

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const details = responseText || response.statusText || `HTTP ${response.status}`;
      this.emitHttpEvent(metadata, {
        statusCode: response.status,
        startedAt,
        responseBytes: responseText ? Buffer.byteLength(responseText, "utf8") : 0,
      });
      throw this.createError({
        message: formatError({
          status: response.status,
          method: metadata.method,
          requestUrl: String(url || ""),
          details,
        }),
        statusCode: response.status,
        payload: null,
        responseText,
        requestUrl: url,
        requestMethod: metadata.method,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    this.emitHttpEvent(metadata, {
      statusCode: response.status,
      startedAt,
      responseBytes: buffer.length,
    });
    return buffer;
  }
}

export { createHttpRequestError, requestMetadata, ThrottledHttpClientRuntime };
