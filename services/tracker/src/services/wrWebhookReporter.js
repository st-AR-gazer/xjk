import { normalizeAccountId, toText } from "../../../shared/valueUtils.js";

function normalizeEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function normalizeEvent(event = {}) {
  const mapUid = toText(event.mapUid || event.uid || event.map_uid);
  if (!mapUid) return null;
  const mapName = toText(event.mapName || event.name || event.map_name) || mapUid;
  const holder = toText(event.holder || event.displayName || event.wrHolder) || "Unknown";
  const accountId = normalizeAccountId(
    event.accountId || event.account_id || event.wrAccountId || event.wr_account_id || holder
  );
  const wrMs = Math.max(0, toInt(event.wrMs ?? event.wr_ms ?? event.recordTime, 0));
  const recordedAt = toText(event.at || event.recordedAt || event.timestamp) || new Date().toISOString();
  return {
    mapUid,
    mapName,
    accountId: accountId || null,
    holder,
    wrMs,
    recordedAt,
  };
}

class WrWebhookReporter {
  constructor({
    enabled = false,
    endpointUrl = "",
    secret = "",
    timeoutMs = 5000,
    onHttpEvent = null,
    logger = console,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.endpointUrl = normalizeEndpoint(endpointUrl);
    this.secret = toText(secret);
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 5000);
    this.emitHttpEvent = createSafeEventSink(onHttpEvent);
    this.logger = logger;
  }

  get isReady() {
    return this.enabled && Boolean(this.endpointUrl) && Boolean(this.secret);
  }

  buildHeaders() {
    return {
      "content-type": "application/json",
      "x-webhook-secret": this.secret,
    };
  }

  async sendEvent(event, { run = null } = {}) {
    const payload = normalizeEvent(event);
    if (!payload) {
      return { ok: false, error: "Invalid event payload." };
    }
    const startedAt = Date.now();
    const target = this.endpointUrl || "";
    let targetHost = "";
    let targetPath = "/";
    try {
      const parsed = new URL(target);
      targetHost = String(parsed.host || "").toLowerCase();
      targetPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    } catch {
      targetHost = "";
      targetPath = "/";
    }
    const requestBody = JSON.stringify({
      ...payload,
      source: "tracker",
      provider: toText(run?.provider || ""),
      runId: Number(run?.runId || 0) || null,
    });
    const requestBytes = Buffer.byteLength(requestBody, "utf8");

    try {
      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: this.buildHeaders(),
        body: requestBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const responseText = await response.text();
      const responseBytes = responseText ? Buffer.byteLength(responseText, "utf8") : 0;

      this.emitHttpEvent({
        direction: "outgoing",
        component: "webhook",
        service: "tracker",
        method: "POST",
        route: targetPath,
        targetHost,
        targetPath,
        statusCode: Number(response.status || 0),
        durationMs: Date.now() - startedAt,
        bytesIn: requestBytes,
        bytesOut: responseBytes,
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: responseText || `Webhook request failed (${response.status}).`,
        };
      }
      let data = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }
      return {
        ok: true,
        data,
      };
    } catch (error) {
      this.emitHttpEvent({
        direction: "outgoing",
        component: "webhook",
        service: "tracker",
        method: "POST",
        route: targetPath,
        targetHost,
        targetPath,
        statusCode: 0,
        durationMs: Date.now() - startedAt,
        bytesIn: requestBytes,
        bytesOut: 0,
      });
      return {
        ok: false,
        error: error?.message || String(error),
      };
    }
  }

  async sendEvents(events = [], { run = null } = {}) {
    if (!this.isReady) {
      return {
        skipped: true,
        reason: "disabled-or-missing-config",
      };
    }
    const list = Array.isArray(events) ? events : [];
    if (!list.length) {
      return {
        skipped: true,
        reason: "no-events",
      };
    }

    let sent = 0;
    let failed = 0;
    const failures = [];
    for (const event of list) {
      const result = await this.sendEvent(event, { run });
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        failures.push(result.error || "Unknown webhook failure.");
      }
    }

    if (failed > 0) {
      this.logger.warn(
        `[tracker-webhook] failed to deliver ${failed}/${list.length} WR events: ${failures.slice(0, 3).join(" | ")}`
      );
    }

    return {
      ok: failed === 0,
      attempted: list.length,
      sent,
      failed,
      failures,
    };
  }
}

export { WrWebhookReporter };
import { createSafeEventSink } from "../telemetry/safeEventSink.js";
