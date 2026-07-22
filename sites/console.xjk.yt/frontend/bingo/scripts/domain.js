import { apiUrl, normalizeServerUrl, state } from "./core.js?v=2";

async function apiRequest(path, { method = "GET", body } = {}) {
  let response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25000);
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    throw Object.assign(
      new Error(
        timedOut
          ? "The Console Bingo backend did not answer in time. Try again in a moment."
          : "Could not reach the Console Bingo backend. Refresh the page and try again."
      ),
      {
        cause: error,
        code: timedOut ? "timeout" : "network_error",
      }
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const isJson = String(response.headers.get("content-type") || "").includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (response.status === 401 && payload?.loginUrl) {
    state.readiness = payload;
    throw Object.assign(new Error(payload.error || "Login required."), {
      code: "login_required",
      loginUrl: normalizeServerUrl(payload.loginUrl),
    });
  }

  if (!response.ok) {
    const message = payload?.error || `${response.status} ${response.statusText}`;
    throw Object.assign(new Error(message), { status: response.status, payload });
  }

  return payload;
}

function normalizedJoinCode(joinCode) {
  return String(joinCode || "").trim();
}

function buildHashRoute({ matchUid = "", activeTab = "games", lobbySubtab = "join" } = {}) {
  const routeScope = String(matchUid || "").trim();
  if (!routeScope) return "#/play";
  const roomScopeMatch = routeScope.match(/^room:(.+)$/);
  if (roomScopeMatch) {
    const encodedJoinCode = encodeURIComponent(roomScopeMatch[1]);
    if (activeTab === "lobby") {
      const safeLobbySubtab = lobbySubtab === "players" ? "players" : "join";
      return `#/room/${encodedJoinCode}/lobby/${safeLobbySubtab}`;
    }
    if (activeTab === "room") {
      return `#/room/${encodedJoinCode}/room`;
    }
    return `#/room/${encodedJoinCode}/play`;
  }
  const encodedMatchUid = encodeURIComponent(routeScope);
  if (activeTab === "lobby") {
    const safeLobbySubtab = lobbySubtab === "players" ? "players" : "join";
    return `#/match/${encodedMatchUid}/lobby/${safeLobbySubtab}`;
  }
  if (activeTab === "games") {
    return `#/match/${encodedMatchUid}/play`;
  }
  return `#/match/${encodedMatchUid}/room`;
}

function setHashRoute(matchUid = "", { activeTab = state.activeTab, lobbySubtab = state.lobbySubtab } = {}) {
  const nextHash = buildHashRoute({ matchUid, activeTab, lobbySubtab });
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, "", nextHash);
}

function matchEventScope(match) {
  if (match?.matchUid) return String(match.matchUid);
  const joinCode = normalizedJoinCode(match?.roomSummary?.joinCode);
  return joinCode ? `room:${joinCode}` : "";
}

function currentMatchRouteScope(match = state.activeMatch) {
  return match?.matchUid || matchEventScope(match) || "";
}

function parseHashRoute() {
  const hash = String(window.location.hash || "").trim();
  if (!hash || hash === "#" || hash === "#/" || hash === "#/play" || hash === "#/games") {
    return { matchUid: "", joinCode: "", eventScope: "", activeTab: "games", lobbySubtab: "join" };
  }

  const room = hash.match(/^#\/room\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (room) {
    const joinCode = normalizedJoinCode(decodeURIComponent(room[1] || ""));
    const rawTab = String(room[2] || "")
      .trim()
      .toLowerCase();
    const rawLobbySubtab = String(room[3] || "")
      .trim()
      .toLowerCase();
    const activeTab = rawTab === "play" || rawTab === "games" ? "games" : rawTab === "room" ? "room" : "lobby";
    const lobbySubtab = rawLobbySubtab === "players" ? "players" : "join";
    return {
      matchUid: "",
      joinCode,
      eventScope: joinCode ? `room:${joinCode}` : "",
      activeTab,
      lobbySubtab,
    };
  }

  const match = hash.match(/^#\/match\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!match) {
    return { matchUid: "", joinCode: "", eventScope: "", activeTab: "games", lobbySubtab: "join" };
  }

  const matchUid = decodeURIComponent(match[1] || "");
  const rawTab = String(match[2] || "")
    .trim()
    .toLowerCase();
  const rawLobbySubtab = String(match[3] || "")
    .trim()
    .toLowerCase();
  const activeTab = rawTab === "play" || rawTab === "games" ? "games" : rawTab === "lobby" ? "lobby" : "room";
  const lobbySubtab = rawLobbySubtab === "players" ? "players" : "join";
  return { matchUid, joinCode: "", eventScope: matchUid, activeTab, lobbySubtab };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "-";
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((value % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function medalName(medal) {
  const index = Number(medal);
  return ["WR", "Author", "Gold", "Silver", "Bronze", "None"][index] || String(medal || "-");
}

function matchPhaseName(phase) {
  const index = Number(phase);
  return ["Pregame", "Starting", "No Bingo", "Running", "Overtime", "Ended"][index] || "Unknown";
}

function matchPhaseLabel(match = state.activeMatch) {
  const room = activeRoomSummary(match);
  const matchState = match?.matchState || null;
  const isLive = Boolean(room.isLive || Number(room.started || 0) > 0);
  if (match?.requiresTeamChoice) return "Pick team first";
  if (matchState?.cells && Array.isArray(matchState.cells) && matchState.cells.length === 0 && isLive) {
    return "Live";
  }
  if (Number(matchState?.phase) === 0 && isLive) return "Live";
  return matchState ? matchPhaseName(matchState.phase) : isLive ? "Live" : "Waiting";
}

function mapModeName(selection) {
  const index = Number(selection);
  return ["Random Maps", "Tags", "Mappack", "Campaign"][index] || "Unknown";
}

function activeRoomSummary(match = state.activeMatch) {
  return match?.roomSummary || {};
}

function activeMatchConfig(match = state.activeMatch) {
  const room = activeRoomSummary(match);
  return match?.matchState?.config || room.matchConfig || room.match_config || {};
}

function activeRoomConfig(match = state.activeMatch) {
  const room = activeRoomSummary(match);
  return room.config || room.roomConfig || room.room_config || {};
}

function activeTargetMedal(match = state.activeMatch) {
  const config = activeMatchConfig(match);
  const room = activeRoomSummary(match);
  return Number(config.target_medal ?? config.targetMedal ?? room.targetMedal ?? 0);
}

function targetTimeForMap(map, targetMedal = activeTargetMedal()) {
  const medal = Number(targetMedal);
  const fieldsByMedal = {
    1: ["author_time", "authorTime"],
    2: ["gold_time", "goldTime"],
    3: ["silver_time", "silverTime"],
    4: ["bronze_time", "bronzeTime"],
  };
  const fields = fieldsByMedal[medal] || [];
  for (const field of fields) {
    const formatted = formatTime(map?.[field]);
    if (formatted !== "-") return formatted;
  }
  return "-";
}

function boolText(value) {
  return value ? "On" : "Off";
}

function compactIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function currentUserIdentityValues() {
  const user = state.session?.session?.user || {};
  return new Set(
    [user.accountId, user.ubisoftAccountId, user.xjkAccountId, user.subject, user.displayName, user.username]
      .map(compactIdentity)
      .filter(Boolean)
  );
}

function profileIdentityValues(profile = {}) {
  return [
    profile.account_id,
    profile.accountId,
    profile.uid,
    profile.id,
    profile.subject,
    profile.display_name,
    profile.displayName,
    profile.name,
    profile.username,
    profile.login,
  ]
    .map(compactIdentity)
    .filter(Boolean);
}

function currentUserIsRoomHost(match = state.activeMatch) {
  const userValues = currentUserIdentityValues();
  if (!userValues.size) return false;

  const room = activeRoomSummary(match);
  const hostName = compactIdentity(room.hostName || room.host_name || room.hostname);
  if (hostName && userValues.has(hostName)) return true;

  const teams = [
    ...(Array.isArray(room.teams) ? room.teams : []),
    ...(Array.isArray(match?.matchState?.teams) ? match.matchState.teams : []),
  ];
  for (const team of teams) {
    const members = Array.isArray(team?.members) ? team.members : [];
    for (const member of members) {
      const profile = member?.profile || member || {};
      const isHostMember = Boolean(member?.operator || profile?.operator);
      if (!isHostMember) continue;
      if (profileIdentityValues(profile).some((value) => userValues.has(value))) return true;
    }
  }

  return false;
}

function toJoinedRoom(room) {
  if (!room) return null;
  const matchConfig = room.matchConfig || room.match_config || {};
  const roomConfig = room.config || {};
  const started = Number(room.started || 0);
  return {
    joinCode: room.joinCode || room.join_code || room.code || "",
    name: room.name || roomConfig.name || "Bingo Room",
    hostName: room.hostName || room.host_name || room.hostname || "",
    playerCount: Number(room.playerCount ?? room.player_count ?? 0),
    public: Boolean(roomConfig.public),
    randomize: Boolean(roomConfig.randomize),
    hostControl: Boolean(roomConfig.host_control ?? roomConfig.hostControl),
    lateJoin: Boolean(matchConfig.late_join ?? matchConfig.lateJoin ?? true),
    gridSize: Number(matchConfig.grid_size ?? matchConfig.gridSize ?? 0),
    selection: Number(matchConfig.selection ?? 0),
    targetMedal: Number(matchConfig.target_medal ?? matchConfig.targetMedal ?? 0),
    started,
    isLive: started > 0,
  };
}

const TEAM_NAME_COLORS = {
  blue: [72, 150, 255],
  red: [255, 88, 88],
  green: [83, 218, 142],
  yellow: [255, 209, 96],
  orange: [255, 154, 82],
  magenta: [255, 93, 215],
  purple: [181, 129, 255],
  pink: [255, 116, 196],
  cyan: [84, 205, 255],
  white: [230, 236, 246],
  black: [82, 91, 110],
};

const TEAM_FALLBACK_COLORS = [
  [72, 150, 255],
  [255, 88, 88],
  [83, 218, 142],
  [255, 209, 96],
  [255, 93, 215],
  [84, 205, 255],
  [181, 129, 255],
  [230, 236, 246],
];

function normalizeTeamRgb(value, fallback = [141, 160, 193]) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 3).map((entry, index) => {
    const numeric = Number(entry);
    if (!Number.isFinite(numeric)) return fallback[index] || 0;
    return Math.max(0, Math.min(255, numeric <= 1 ? Math.round(numeric * 255) : Math.round(numeric)));
  });
}

function teamVisualFromTeam(team, index = 0) {
  const teamId = Number(team?.base?.id ?? team?.id ?? index);
  const rawName = String(team?.base?.name || team?.name || "").trim();
  const nameKey = rawName.toLowerCase();
  const fallbackColor =
    TEAM_NAME_COLORS[nameKey] || TEAM_FALLBACK_COLORS[Math.abs(teamId || index) % TEAM_FALLBACK_COLORS.length];
  const rgb = normalizeTeamRgb(team?.base?.color || team?.color, fallbackColor);
  const textColor = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 170 ? "#09101d" : "#f8fbff";
  return {
    id: teamId,
    name: rawName || `Team ${Number.isFinite(teamId) ? teamId : "?"}`,
    border: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    soft: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.16)`,
    fill: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.24)`,
    strong: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.72)`,
    glow: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.38)`,
    text: textColor,
  };
}

function teamStyleAttribute(visual) {
  if (!visual) return "";
  return [
    `--team-border:${visual.border}`,
    `--team-soft:${visual.soft}`,
    `--team-fill:${visual.fill}`,
    `--team-strong:${visual.strong}`,
    `--team-glow:${visual.glow}`,
    `--team-text:${visual.text}`,
  ].join(";");
}

function applyTeamStyle(element, visual) {
  if (!element || !visual) return;
  element.style.setProperty("--team-border", visual.border);
  element.style.setProperty("--team-soft", visual.soft);
  element.style.setProperty("--team-fill", visual.fill);
  element.style.setProperty("--team-strong", visual.strong);
  element.style.setProperty("--team-glow", visual.glow);
  element.style.setProperty("--team-text", visual.text);
}

function teamColorMap(matchState) {
  const map = new Map();
  const teams = Array.isArray(matchState?.teams) ? matchState.teams : [];
  for (const team of teams) {
    const visual = teamVisualFromTeam(team, map.size);
    map.set(visual.id, visual);
  }
  return map;
}

function teamColorForId(teamId, matchState = state.activeMatch?.matchState) {
  const target = Number(teamId);
  return teamColorMap(matchState).get(target) || null;
}

function getCellState(cell) {
  const leading = Array.isArray(cell?.claims) && cell.claims.length ? cell.claims[0] : null;
  return {
    cellId: Number(cell?.cell_id ?? -1),
    map: cell?.map || null,
    leading,
    claimant: Number(cell?.claimant ?? leading?.team_id ?? -1),
    state: Number(cell?.state ?? 0),
  };
}

function getSelectedCell() {
  const cells = Array.isArray(state.activeMatch?.matchState?.cells) ? state.activeMatch.matchState.cells : [];
  return cells.find((cell) => Number(cell?.cell_id) === Number(state.selectedCellId)) || null;
}

function getCellIndex(cellId) {
  const cells = Array.isArray(state.activeMatch?.matchState?.cells) ? state.activeMatch.matchState.cells : [];
  return cells.findIndex((cell) => Number(cell?.cell_id) === Number(cellId));
}

function getSelectedMap() {
  const cell = getSelectedCell();
  return cell?.map || null;
}

function currentRoomMapCellId() {
  const binding = state.activeMatch?.roomBinding || {};
  const value = Number(binding.selectedCellId ?? binding.selected_cell_id ?? -1);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function teamNameForId(teamId) {
  const teams = Array.isArray(state.activeMatch?.matchState?.teams) ? state.activeMatch.matchState.teams : [];
  const target = Number(teamId);
  const team = teams.find((entry) => Number(entry?.base?.id ?? entry?.id) === target);
  return team?.base?.name || team?.name || (Number.isFinite(target) && target >= 0 ? `Team ${target}` : "No team");
}

function claimPlayerName(claim) {
  const profile = claim?.player?.profile || claim?.player || claim?.profile || claim || {};
  return (
    profile.display_name ||
    profile.displayName ||
    profile.name ||
    profile.username ||
    claim?.display_name ||
    claim?.displayName ||
    profile.account_id ||
    profile.accountId ||
    claim?.account_id ||
    claim?.accountId ||
    "Unknown player"
  );
}

function claimTeamId(claim) {
  return Number(claim?.team_id ?? claim?.teamId ?? claim?.team?.id ?? claim?.team?.base?.id ?? -1);
}

function sortedCellClaims(cell) {
  return (Array.isArray(cell?.claims) ? [...cell.claims] : []).sort(
    (a, b) => Number(a?.time ?? Number.MAX_SAFE_INTEGER) - Number(b?.time ?? Number.MAX_SAFE_INTEGER)
  );
}

function spreadsheetColumnLabel(index) {
  let value = Math.max(0, Number(index) || 0);
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function tileCoordinateLabel(index, gridSize) {
  const safeGridSize = Math.max(1, Number(gridSize) || 1);
  const safeIndex = Math.max(0, Number(index) || 0);
  const row = Math.floor(safeIndex / safeGridSize);
  const column = (safeIndex % safeGridSize) + 1;
  return `${spreadsheetColumnLabel(row)}${column}`;
}

function cellMapName(cell) {
  if (!cell?.map) return "Unknown map";
  if (cell.map.type === "TMX") {
    return cell.map.track_name || cell.map.trackName || "TMX map";
  }
  return `Campaign map #${cell.map.map ?? "?"}`;
}

function cellMapAuthor(cell) {
  const map = cell?.map || {};
  return map.username || map.author || map.authorName || "";
}

function cellMapUid(cell) {
  return cell?.map?.uid || "";
}

function cellMapTmxId(cellOrMap) {
  const map = cellOrMap?.map || cellOrMap || {};
  return String(map.tmxid || map.tmx_id || map.id || map.trackId || map.TrackID || "").trim();
}

function cellThumbnailUrl(cellOrMap) {
  const map = cellOrMap?.map || cellOrMap || {};
  const direct =
    map.thumbnailUrl ||
    map.thumbnail_url ||
    map.screenshotUrl ||
    map.screenshot_url ||
    map.imageUrl ||
    map.image_url ||
    map.mediaUrlPngMedium ||
    map.mediaUrlPngSmall ||
    map.mediaUrl ||
    "";
  if (direct) return String(direct);
  const tmxId = cellMapTmxId(map);
  if (String(map.type || "").toUpperCase() === "TMX" && tmxId) {
    return `https://trackmania.exchange/maps/screenshot_normal/${encodeURIComponent(tmxId)}`;
  }
  return "";
}

function roomJoinDisabled(room) {
  return room.isLive && !room.lateJoin;
}

function getLobbyTeams(match) {
  const teams = Array.isArray(match?.matchState?.teams)
    ? match.matchState.teams
    : Array.isArray(match?.roomSummary?.teams)
      ? match.roomSummary.teams
      : [];
  const colors = teamColorMap(match?.matchState || { teams });
  const grouped = [];
  for (const team of teams) {
    const teamName = team?.base?.name || team?.name || `Team ${team?.id ?? "?"}`;
    const teamId = Number(team?.base?.id ?? team?.id ?? -1);
    const color = colors.get(teamId) || teamVisualFromTeam(team, grouped.length);
    const members = Array.isArray(team?.members) ? team.members : [];
    const players = [];
    for (const member of members) {
      const profile = member?.profile || member || {};
      const name =
        profile.display_name ||
        profile.displayName ||
        profile.name ||
        profile.username ||
        profile.account_id ||
        profile.accountId ||
        "Unknown";
      players.push({
        name,
        teamName,
        teamId,
        color,
        operator: Boolean(member?.operator || profile?.operator),
      });
    }
    grouped.push({
      name: teamName,
      id: teamId,
      color,
      players,
    });
  }
  return grouped;
}

export {
  activeMatchConfig,
  activeRoomConfig,
  activeRoomSummary,
  activeTargetMedal,
  apiRequest,
  applyTeamStyle,
  boolText,
  cellMapAuthor,
  cellMapName,
  cellMapTmxId,
  cellMapUid,
  cellThumbnailUrl,
  claimPlayerName,
  claimTeamId,
  currentMatchRouteScope,
  currentRoomMapCellId,
  currentUserIsRoomHost,
  escapeHtml,
  formatTime,
  getCellIndex,
  getCellState,
  getLobbyTeams,
  getSelectedCell,
  getSelectedMap,
  mapModeName,
  matchEventScope,
  matchPhaseLabel,
  medalName,
  normalizedJoinCode,
  parseHashRoute,
  roomJoinDisabled,
  setHashRoute,
  sortedCellClaims,
  targetTimeForMap,
  teamColorForId,
  teamColorMap,
  teamNameForId,
  teamStyleAttribute,
  teamVisualFromTeam,
  tileCoordinateLabel,
  toJoinedRoom,
};
