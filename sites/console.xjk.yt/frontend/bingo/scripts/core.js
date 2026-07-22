const BOARD_SIZE_STORAGE_KEY = "xjk.console.bingo.boardTileSize";
const BOARD_TILE_MIN = 82;
const BOARD_TILE_DEFAULT = 132;
const BOARD_TILE_MAX = Math.round(BOARD_TILE_DEFAULT * 3);
const BOARD_TILE_HOLD_MS = 560;
const BOARD_TILE_HOLD_MOVE_TOLERANCE = 12;
const BINGO_RUN_NOTIFICATION_DURATION_MS = 15000;
const MAP_SWITCH_STEPS = [
  {
    key: "finding-map",
    title: "Finding map",
    detail: "Checking the selected Bingo tile and map UID.",
  },
  {
    key: "requesting-nadeo",
    title: "Requesting Nadeo servers",
    detail: "Fetching the official map data needed by the room.",
  },
  {
    key: "sending-map",
    title: "Sending map to queue",
    detail: "Updating your generated console room with the selected map.",
  },
];

function clampNumber(value, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, next));
}

function readStoredBoardTileSize() {
  try {
    const raw = window.localStorage.getItem(BOARD_SIZE_STORAGE_KEY);
    if (!raw) return BOARD_TILE_DEFAULT;
    return clampNumber(raw, BOARD_TILE_MIN, BOARD_TILE_MAX);
  } catch {
    return BOARD_TILE_DEFAULT;
  }
}

const state = {
  session: null,
  readiness: null,
  rooms: [],
  activeMatch: null,
  activeTab: "games",
  lobbySubtab: "join",
  tileModalTab: "details",
  mapSwitchProgress: {
    visible: false,
    step: "finding-map",
    state: "idle",
    detail: "",
  },
  mapSwitchFallbackTimers: [],
  selectedCellId: null,
  currentLookupRoom: null,
  eventSource: null,
  eventScope: "",
  tilePopoverAnchor: null,
  boardTileSize: readStoredBoardTileSize(),
  boardGesture: null,
  boardPointers: new Map(),
  boardHoldAction: null,
  boardSuppressClickUntil: 0,
  bingoNotifications: [],
  bingoNotificationTimers: new Map(),
  joiningRoomCodes: new Set(),
  leavingMatch: false,
  regeneratingRoom: false,
  checkingCurrentMap: false,
  shellCollapsed: false,
  shellHidden: window.matchMedia("(max-width: 899px)").matches,
};

const els = {
  runtimeShell: document.getElementById("runtimeShell"),
  shellEdgeToggle: document.getElementById("shellEdgeToggle"),
  shellScrim: document.getElementById("shellScrim"),
  tabGamesButton: document.getElementById("tabGamesButton"),
  tabLobbyButton: document.getElementById("tabLobbyButton"),
  tabRoomButton: document.getElementById("tabRoomButton"),
  roomSettingsButton: document.getElementById("roomSettingsButton"),
  roomSettingsModal: document.getElementById("roomSettingsModal"),
  roomSettingsBackdrop: document.getElementById("roomSettingsBackdrop"),
  roomSettingsClose: document.getElementById("roomSettingsClose"),
  roomSettingsTitle: document.getElementById("roomSettingsTitle"),
  roomSettingsHostNote: document.getElementById("roomSettingsHostNote"),
  roomSettingsGrid: document.getElementById("roomSettingsGrid"),
  gamesPanel: document.getElementById("gamesPanel"),
  lobbyPanel: document.getElementById("lobbyPanel"),
  roomPanel: document.getElementById("roomPanel"),
  refreshRoomsButton: document.getElementById("refreshRoomsButton"),
  publicRooms: document.getElementById("publicRooms"),
  privateLookupForm: document.getElementById("privateLookupForm"),
  privateLookupResult: document.getElementById("privateLookupResult"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  lobbyEmpty: document.getElementById("lobbyEmpty"),
  lobbyActive: document.getElementById("lobbyActive"),
  matchTitle: document.getElementById("matchTitle"),
  matchPhasePill: document.getElementById("matchPhasePill"),
  matchSummary: document.getElementById("matchSummary"),
  leaveMatchButton: document.getElementById("leaveMatchButton"),
  teamPicker: document.getElementById("teamPicker"),
  teamPickerIntro: document.getElementById("teamPickerIntro"),
  teamPickerList: document.getElementById("teamPickerList"),
  lobbyJoinTabButton: document.getElementById("lobbyJoinTabButton"),
  lobbyPlayersTabButton: document.getElementById("lobbyPlayersTabButton"),
  lobbyJoinPanel: document.getElementById("lobbyJoinPanel"),
  lobbyPlayersPanel: document.getElementById("lobbyPlayersPanel"),
  joinGuideTitle: document.getElementById("joinGuideTitle"),
  joinGuideIntro: document.getElementById("joinGuideIntro"),
  joinInstructionsTitle: document.getElementById("joinInstructionsTitle"),
  joinInstructionsIntro: document.getElementById("joinInstructionsIntro"),
  lobbyPlayersTitle: document.getElementById("lobbyPlayersTitle"),
  lobbyPlayersList: document.getElementById("lobbyPlayersList"),
  openBoardButton: document.getElementById("openBoardButton"),
  regenerateRoomButton: document.getElementById("regenerateRoomButton"),
  roomEmpty: document.getElementById("roomEmpty"),
  roomActive: document.getElementById("roomActive"),
  boardLayout: document.getElementById("boardLayout"),
  boardPane: document.getElementById("boardPane"),
  boardGrid: document.getElementById("boardGrid"),
  boardSizeSlider: document.getElementById("boardSizeSlider"),
  boardSizeValue: document.getElementById("boardSizeValue"),
  manualRecordButton: document.getElementById("manualRecordButton"),
  manualRecordStatus: document.getElementById("manualRecordStatus"),
  tilePopover: document.getElementById("tilePopover"),
  tilePopoverClose: document.getElementById("tilePopoverClose"),
  tilePopoverBackdrop: document.getElementById("tilePopoverBackdrop"),
  selectedMapMedia: document.getElementById("selectedMapMedia"),
  selectedMapTitle: document.getElementById("selectedMapTitle"),
  selectedMapSubtitle: document.getElementById("selectedMapSubtitle"),
  selectedMapStats: document.getElementById("selectedMapStats"),
  selectedMapRunHistory: document.getElementById("selectedMapRunHistory"),
  tileDetailsTabButton: document.getElementById("tileDetailsTabButton"),
  tileRunsTabButton: document.getElementById("tileRunsTabButton"),
  tileDetailsPanel: document.getElementById("tileDetailsPanel"),
  tileRunsPanel: document.getElementById("tileRunsPanel"),
  mapSwitchOverlay: document.getElementById("mapSwitchOverlay"),
  mapSwitchTitle: document.getElementById("mapSwitchTitle"),
  mapSwitchBody: document.getElementById("mapSwitchBody"),
  mapSwitchSteps: document.getElementById("mapSwitchSteps"),
  mapSwitchCloseButton: document.getElementById("mapSwitchCloseButton"),
  switchMapButton: document.getElementById("switchMapButton"),
  checkMapButton: document.getElementById("checkMapButton"),
  claimStatusTitle: document.getElementById("claimStatusTitle"),
  claimStatusBody: document.getElementById("claimStatusBody"),
  clubPathList: document.getElementById("clubPathList"),
  clubPathNote: document.getElementById("clubPathNote"),
  roomCardTemplate: document.getElementById("roomCardTemplate"),
  bingoNotifications: document.getElementById("bingoNotifications"),
};

function resolveAppBasePath() {
  const pathname = String(window.location.pathname || "/");
  const lowerPath = pathname.toLowerCase();
  const marker = "/bingo/";
  const index = lowerPath.indexOf(marker);
  if (index >= 0) {
    return pathname.slice(0, index + "/bingo".length) || "/bingo";
  }
  if (lowerPath.endsWith("/bingo")) {
    return pathname || "/bingo";
  }
  return "/bingo";
}

const APP_BASE_PATH = resolveAppBasePath();
const APP_PARENT_PREFIX =
  APP_BASE_PATH.endsWith("/bingo") && APP_BASE_PATH.length > "/bingo".length
    ? APP_BASE_PATH.slice(0, -"/bingo".length)
    : "";

function prefixAppPath(path) {
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  return `${APP_BASE_PATH}${normalizedPath === "/" ? "/" : normalizedPath}`;
}

function normalizeServerUrl(urlLike) {
  const value = String(urlLike || "").trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (APP_PARENT_PREFIX && value.startsWith("/bingo/")) {
    return `${APP_PARENT_PREFIX}${value}`;
  }
  if (APP_PARENT_PREFIX && value === "/bingo") {
    return `${APP_PARENT_PREFIX}/bingo`;
  }
  return value;
}

function apiUrl(path) {
  return prefixAppPath(path);
}

function isDesktopShell() {
  return window.matchMedia("(min-width: 900px)").matches;
}

function applyShellState() {
  if (!els.runtimeShell) return;
  const desktop = isDesktopShell();
  els.runtimeShell.classList.toggle("is-sidebar-collapsed", desktop && state.shellCollapsed);
  els.runtimeShell.classList.toggle("is-sidebar-hidden", !desktop && state.shellHidden);
  if (els.shellScrim) {
    els.shellScrim.classList.toggle("hidden", desktop || state.shellHidden);
  }
  if (els.shellEdgeToggle) {
    const expanded = desktop ? !state.shellCollapsed : !state.shellHidden;
    els.shellEdgeToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    els.shellEdgeToggle.setAttribute(
      "aria-label",
      desktop
        ? state.shellCollapsed
          ? "Expand sidebar"
          : "Collapse sidebar"
        : state.shellHidden
          ? "Open menu"
          : "Close menu"
    );
  }
}

function setShellHidden(hidden) {
  state.shellHidden = Boolean(hidden);
  applyShellState();
}

function toggleShell() {
  if (isDesktopShell()) {
    state.shellCollapsed = !state.shellCollapsed;
    applyShellState();
    return;
  }
  setShellHidden(!state.shellHidden);
}

function closeShell() {
  if (isDesktopShell()) return;
  setShellHidden(true);
}

function syncShellLayout() {
  if (isDesktopShell()) {
    state.shellHidden = false;
  } else {
    state.shellCollapsed = false;
    state.shellHidden = true;
  }
  applyShellState();
}

function setTileModalTab(tab) {
  state.tileModalTab = tab === "runs" ? "runs" : "details";
  const runsActive = state.tileModalTab === "runs";
  els.tileDetailsTabButton?.classList.toggle("is-active", !runsActive);
  els.tileRunsTabButton?.classList.toggle("is-active", runsActive);
  els.tileDetailsTabButton?.setAttribute("aria-selected", runsActive ? "false" : "true");
  els.tileRunsTabButton?.setAttribute("aria-selected", runsActive ? "true" : "false");
  els.tileDetailsPanel?.classList.toggle("hidden", runsActive);
  els.tileRunsPanel?.classList.toggle("hidden", !runsActive);
}

export {
  BINGO_RUN_NOTIFICATION_DURATION_MS,
  BOARD_SIZE_STORAGE_KEY,
  BOARD_TILE_DEFAULT,
  BOARD_TILE_HOLD_MOVE_TOLERANCE,
  BOARD_TILE_HOLD_MS,
  BOARD_TILE_MAX,
  BOARD_TILE_MIN,
  MAP_SWITCH_STEPS,
  apiUrl,
  clampNumber,
  closeShell,
  els,
  normalizeServerUrl,
  setTileModalTab,
  state,
  syncShellLayout,
  toggleShell,
};
