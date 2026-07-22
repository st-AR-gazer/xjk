export function createDirectoryService({ auth, bingo, config, helpers, nadeo, roomSummary } = {}) {
  const { getOperatorIdentitySnapshot } = auth;
  const { BINGO_CLIENT_KIND_DIRECTORY, BINGO_PURPOSE_DIRECTORY, BingoClient } = bingo;
  const { ensureServiceIdentity } = nadeo;
  const { nowMs } = helpers;
  const { normalizeRoomSummary } = roomSummary;

  const directoryState = {
    connection: null,
    rooms: new Map(),
    ready: false,
    source: "none",
    error: "",
  };

  function getDirectoryIdentity() {
    if (config.directoryAccountId) {
      return {
        accountId: config.directoryAccountId,
        displayName: config.directoryDisplayName,
      };
    }
    const operator = getOperatorIdentitySnapshot();
    if (operator?.accountId && operator?.displayName) {
      return {
        accountId: operator.accountId,
        displayName: operator.displayName,
      };
    }
    return null;
  }

  class DirectoryConnection {
    constructor() {
      this.client = null;
      this.reconnectTimer = null;
    }

    async start() {
      let identity = getDirectoryIdentity();
      if (!identity) {
        await ensureServiceIdentity();
        identity = getDirectoryIdentity();
      }
      if (!identity) {
        directoryState.ready = false;
        directoryState.error = "No directory identity is configured.";
        return;
      }
      const client = new BingoClient({ label: "directory" });
      client.onEvent((event) => this.handleEvent(event));
      client.onClose(() => this.scheduleReconnect());
      await client.connect({
        accountId: identity.accountId,
        displayName: identity.displayName,
        purpose: BINGO_PURPOSE_DIRECTORY,
        clientKind: BINGO_CLIENT_KIND_DIRECTORY,
      });
      this.client = client;
      directoryState.connection = client;
      directoryState.ready = true;
      directoryState.error = "";
      const response = await client.request("GetPublicRooms", {});
      const rooms = Array.isArray(response?.rooms) ? response.rooms : [];
      directoryState.rooms = new Map(
        rooms
          .map((room) => normalizeRoomSummary(room))
          .filter((room) => room.joinCode)
          .map((room) => [room.joinCode, room])
      );
      directoryState.source = "tcp";
    }

    handleEvent(event) {
      const type = String(event?.event || "");
      if (type === "PublicRooms") {
        const rooms = Array.isArray(event.rooms) ? event.rooms : [];
        directoryState.rooms = new Map(
          rooms
            .map((room) => normalizeRoomSummary(room))
            .filter((room) => room.joinCode)
            .map((room) => [room.joinCode, room])
        );
        directoryState.source = "tcp";
        return;
      }
      if (type === "RoomListed") {
        const room = normalizeRoomSummary(event);
        if (room.joinCode) directoryState.rooms.set(room.joinCode, room);
        return;
      }
      if (type === "RoomUnlisted") {
        directoryState.rooms.delete(String(event.join_code || ""));
        return;
      }
      if (type === "RoomlistPlayerCountUpdate") {
        const key = String(event.code || "");
        const room = directoryState.rooms.get(key);
        if (!room) return;
        room.playerCount = Math.max(0, Number(room.playerCount || 0) + Number(event.delta || 0));
        directoryState.rooms.set(key, room);
        return;
      }
      if (type === "RoomlistConfigUpdate") {
        const key = String(event.code || "");
        const room = directoryState.rooms.get(key);
        if (!room) return;
        room.config = event.config || room.config;
        room.matchConfig = event.match_config || room.matchConfig;
        room.randomize = Boolean(room.config.randomize);
        room.hostControl = Boolean(room.config.host_control);
        room.lateJoin = Boolean(room.matchConfig.late_join ?? true);
        room.gridSize = Number(room.matchConfig.grid_size ?? 0);
        room.selection = Number(room.matchConfig.selection ?? 0);
        room.targetMedal = Number(room.matchConfig.target_medal ?? 0);
        directoryState.rooms.set(key, room);
        return;
      }
      if (type === "RoomlistInGameStatusUpdate") {
        const key = String(event.code || "");
        const room = directoryState.rooms.get(key);
        if (!room) return;
        room.started = Date.parse(event.start_time || "") || room.started || nowMs();
        room.isLive = room.started > 0;
        directoryState.rooms.set(key, room);
      }
    }

    async refreshRooms() {
      if (!this.client || !this.client.connected) {
        await this.start();
      }
      const response = await this.client.request("GetPublicRooms", {});
      const rooms = Array.isArray(response?.rooms) ? response.rooms : [];
      directoryState.rooms = new Map(
        rooms
          .map((room) => normalizeRoomSummary(room))
          .filter((room) => room.joinCode)
          .map((room) => [room.joinCode, room])
      );
      directoryState.source = "tcp";
      directoryState.ready = true;
      directoryState.error = "";
      return currentPublicRooms();
    }

    scheduleReconnect() {
      directoryState.ready = false;
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.start().catch((error) => {
          directoryState.error = error?.message || String(error);
          this.scheduleReconnect();
        });
      }, 5000);
      this.reconnectTimer.unref?.();
    }
  }

  const directoryConnection = new DirectoryConnection();

  async function ensureDirectoryConnection() {
    if (directoryState.ready) return;
    try {
      await directoryConnection.start();
    } catch (error) {
      directoryState.error = error?.message || String(error);
      directoryState.ready = false;
    }
  }

  function currentPublicRooms() {
    return [...directoryState.rooms.values()]
      .filter((room) => room.public !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  return {
    directoryState,
    getDirectoryIdentity,
    DirectoryConnection,
    directoryConnection,
    ensureDirectoryConnection,
    currentPublicRooms,
  };
}
