import net from "node:net";

export function createBingoProtocol({ config, helpers } = {}) {
  const { base64Url, hmacBase64Url, nowMs } = helpers;

  const BINGO_PURPOSE_DIRECTORY = "directory";
  const BINGO_PURPOSE_PLAYER = "player";
  const BINGO_CLIENT_KIND_DIRECTORY = "console-directory";
  const BINGO_CLIENT_KIND_WEB_PLAYER = "console-web";
  const BINGO_BRIDGE_ORIGIN = "console-hub";

  function buildBridgeAuthKey({ accountId, displayName, purpose = BINGO_PURPOSE_PLAYER }) {
    if (config.bingoAllowDevKeyExchange) {
      return "";
    }
    if (!config.bingoAuthSecret) {
      throw new Error("Bingo bridge auth secret is not configured.");
    }
    const payload = {
      v: 1,
      purpose,
      accountId,
      displayName,
      issuedAt: nowMs(),
      expiresAt: nowMs() + 5 * 60 * 1000,
    };
    const encoded = base64Url(JSON.stringify(payload));
    const signature = hmacBase64Url(config.bingoAuthSecret, encoded);
    return `xjk1.${encoded}.${signature}`;
  }

  function frameMessage(jsonText) {
    const body = Buffer.from(jsonText, "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(body.length, 0);
    return Buffer.concat([header, body]);
  }

  class BingoClient {
    constructor({ label = "bingo-client" } = {}) {
      this.label = label;
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      this.pending = new Map();
      this.sequence = 0;
      this.connected = false;
      this.closing = false;
      this.eventHandler = null;
      this.closeHandler = null;
    }

    onEvent(handler) {
      this.eventHandler = handler;
    }

    onClose(handler) {
      this.closeHandler = handler;
    }

    async connect({
      accountId,
      displayName,
      purpose = BINGO_PURPOSE_PLAYER,
      clientKind = purpose === BINGO_PURPOSE_DIRECTORY ? BINGO_CLIENT_KIND_DIRECTORY : BINGO_CLIENT_KIND_WEB_PLAYER,
      bridgeOrigin = BINGO_BRIDGE_ORIGIN,
    }) {
      if (this.connected) return;
      const key = buildBridgeAuthKey({ accountId, displayName, purpose });
      const socket = net.createConnection({
        host: config.bingoTcpHost,
        port: config.bingoTcpPort,
      });
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.closing = false;
      socket.setNoDelay(true);

      socket.on("data", (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.flushFrames();
      });
      socket.on("error", (error) => {
        this.failPending(error);
      });
      socket.on("close", () => {
        this.connected = false;
        this.failPending(new Error("Bingo socket closed."));
        if (!this.closing && typeof this.closeHandler === "function") {
          this.closeHandler();
        }
      });

      await new Promise((resolve, reject) => {
        const onError = (error) => {
          socket.off("connect", onConnect);
          reject(error);
        };
        const onConnect = () => {
          socket.off("error", onError);
          resolve();
        };
        socket.once("error", onError);
        socket.once("connect", onConnect);
      });

      const keyReply = await this.exchangeKey({
        key,
        accountId,
        displayName,
        purpose,
        clientKind,
        bridgeOrigin,
      });
      const bingoToken = String(keyReply?.token || "").trim();
      if (!bingoToken) {
        throw new Error("Bingo key exchange did not return a client token.");
      }
      const handshakeReply = await this.performHandshake({ bingoToken });
      if (!handshakeReply?.success) {
        throw new Error(handshakeReply?.reason || "Bingo handshake failed.");
      }
      this.connected = true;
      return handshakeReply;
    }

    flushFrames() {
      while (this.buffer.length >= 4) {
        const length = this.buffer.readUInt32LE(0);
        if (this.buffer.length < 4 + length) return;
        const payload = this.buffer.subarray(4, 4 + length).toString("utf8");
        this.buffer = this.buffer.subarray(4 + length);
        this.handleMessage(payload);
      }
    }

    handleMessage(payload) {
      let message = null;
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      if (message && typeof message.seq === "number") {
        const pending = this.pending.get(message.seq);
        if (pending) {
          this.pending.delete(message.seq);
          if (message.error) {
            pending.reject(new Error(String(message.error)));
          } else {
            pending.resolve(message);
          }
        }
        return;
      }
      if (message?.event && typeof this.eventHandler === "function") {
        this.eventHandler(message);
        return;
      }
      if (message?.token && this.pending.has(-1)) {
        const pending = this.pending.get(-1);
        this.pending.delete(-1);
        pending.resolve(message);
        return;
      }
      if (typeof message?.success === "boolean" && this.pending.has(-2)) {
        const pending = this.pending.get(-2);
        this.pending.delete(-2);
        pending.resolve(message);
      }
    }

    failPending(error) {
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
    }

    async exchangeKey({ key, accountId, displayName, purpose, clientKind, bridgeOrigin }) {
      const request = {
        key,
        account_id: accountId,
        display_name: displayName,
        bridge_purpose: String(purpose || ""),
        bridge_client_kind: String(clientKind || ""),
        bridge_origin: String(bridgeOrigin || ""),
      };
      return this.sendSpecial(-1, request);
    }

    async performHandshake({ bingoToken }) {
      const request = {
        version: config.bingoPluginVersion,
        game: 0,
        token: bingoToken,
      };
      return this.sendSpecial(-2, request);
    }

    async sendSpecial(pendingKey, payload) {
      if (!this.socket) throw new Error("Bingo socket is not open.");
      const message = JSON.stringify(payload);
      const reply = new Promise((resolve, reject) => {
        this.pending.set(pendingKey, { resolve, reject });
        setTimeout(() => {
          const current = this.pending.get(pendingKey);
          if (current) {
            this.pending.delete(pendingKey);
            reject(new Error("Bingo handshake timed out."));
          }
        }, 5000).unref?.();
      });
      this.socket.write(frameMessage(message));
      return reply;
    }

    async request(requestName, fields = {}, timeoutMs = 5000) {
      if (!this.socket || !this.connected) throw new Error("Bingo client is not connected.");
      const seq = this.sequence++;
      const payload = {
        ...fields,
        seq,
        req: requestName,
      };
      const response = new Promise((resolve, reject) => {
        this.pending.set(seq, { resolve, reject });
        const timeout = setTimeout(() => {
          if (this.pending.delete(seq)) {
            reject(new Error(`Bingo request ${requestName} timed out.`));
          }
        }, timeoutMs);
        timeout.unref?.();
      });
      this.socket.write(frameMessage(JSON.stringify(payload)));
      return response;
    }

    close() {
      this.closing = true;
      try {
        this.socket?.destroy();
      } catch {
        // Ignore socket teardown failures.
      }
      this.connected = false;
    }
  }

  return {
    BINGO_PURPOSE_DIRECTORY,
    BINGO_PURPOSE_PLAYER,
    BINGO_CLIENT_KIND_DIRECTORY,
    BINGO_CLIENT_KIND_WEB_PLAYER,
    BINGO_BRIDGE_ORIGIN,
    buildBridgeAuthKey,
    frameMessage,
    BingoClient,
  };
}
