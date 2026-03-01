class TrackerRealtimeHub {
  constructor({ logger = console, pingIntervalMs = 25_000 } = {}) {
    this.logger = logger;
    this.clients = new Map();
    this.nextClientId = 1;
    this.pingIntervalMs = Math.max(5_000, Number(pingIntervalMs) || 25_000);
    this.pingTimer = setInterval(() => {
      this.broadcast("ping", { at: new Date().toISOString() });
    }, this.pingIntervalMs);
    if (typeof this.pingTimer?.unref === "function") {
      this.pingTimer.unref();
    }
  }

  connect(req, res) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const clientId = this.nextClientId++;
    this.clients.set(clientId, res);

    this.sendToClient(clientId, "connected", {
      at: new Date().toISOString(),
      clientId,
      clients: this.clients.size,
    });

    const closeClient = () => {
      if (!this.clients.has(clientId)) return;
      this.clients.delete(clientId);
      try {
        res.end();
      } catch (_error) { }
    };

    req.on("close", closeClient);
    req.on("end", closeClient);
  }

  sendToClient(clientId, event, payload) {
    const res = this.clients.get(clientId);
    if (!res) return;
    try {
      this.writeEvent(res, event, payload);
    } catch (error) {
      this.logger.warn?.(`[tracker] realtime client ${clientId} write failed: ${error?.message || error}`);
      this.clients.delete(clientId);
      try {
        res.end();
      } catch (_endError) { }
    }
  }

  broadcast(event, payload) {
    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, event, payload);
    }
  }

  writeEvent(res, event, payload) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload || {});
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  }

  getStatus() {
    return {
      connectedClients: this.clients.size,
    };
  }

  close() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    for (const [clientId, res] of this.clients.entries()) {
      this.clients.delete(clientId);
      try {
        res.end();
      } catch (_error) { }
    }
  }
}

export { TrackerRealtimeHub };
