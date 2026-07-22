import { configureBingoActions } from "./actions.js?v=2";
import {
  BOARD_SIZE_STORAGE_KEY,
  apiUrl,
  closeShell,
  els,
  normalizeServerUrl,
  setTileModalTab,
  state,
  syncShellLayout,
  toggleShell,
} from "./core.js?v=2";
import {
  apiRequest,
  cellMapName,
  currentMatchRouteScope,
  escapeHtml,
  getSelectedCell,
  matchEventScope,
  normalizedJoinCode,
  parseHashRoute,
  setHashRoute,
  toJoinedRoom,
} from "./domain.js?v=2";
import {
  closeRoomSettings,
  failMapSwitchProgress,
  finishMapSwitchProgress,
  hideMapSwitchProgress,
  openRoomSettings,
  renderLobbySubtabs,
  renderTabState,
  showBingoNotification,
  startMapSwitchProgress,
  updateMapSwitchProgress,
} from "./chrome-ui.js?v=2";
import {
  cancelBoardHoldAction,
  closeTilePopover,
  openTilePopover,
  renderClaimStatus,
  renderMatch,
  renderSelectedMap,
  setBoardTileSize,
  startBoardGestureIfReady,
  syncBoardSizeControls,
  updateBoardGesture,
} from "./match-ui.js?v=2";
import {
  renderJoinSurfaces,
  renderLookupResult,
  renderRooms,
  renderSession,
  setLeaveButtonState,
  setManualCheckButtonState,
  setRegenerateRoomButtonState,
} from "./room-list-ui.js?v=2";

async function loadSession() {
  try {
    state.session = await apiRequest("/api/v1/session");
    if (state.session?.loginUrl) {
      state.session.loginUrl = normalizeServerUrl(state.session.loginUrl);
    }
    state.readiness = state.session?.readiness || null;
  } catch (error) {
    state.session = null;
    state.readiness = {
      detail: error?.message || "Failed to read session state.",
    };
  }
  renderSession();
}

async function loadRooms() {
  globalThis.XjkSafeHtml.set(els.publicRooms, `<p class="panel__intro">Loading rooms...</p>`);
  try {
    const payload = await apiRequest("/api/v1/rooms/public");
    state.rooms = Array.isArray(payload?.rooms) ? payload.rooms.map(toJoinedRoom).filter(Boolean) : [];
  } catch (error) {
    state.rooms = [];
    globalThis.XjkSafeHtml.set(
      els.publicRooms,
      `<p class="state-bad">${escapeHtml(error.message || "Failed to load rooms.")}</p>`
    );
    return;
  }
  renderRooms();
}

async function lookupPrivateRoom(joinCode) {
  renderLookupResult(null, "");
  try {
    const payload = await apiRequest("/api/v1/rooms/private/lookup", {
      method: "POST",
      body: { joinCode },
    });
    state.currentLookupRoom = payload?.room ? toJoinedRoom(payload.room) : null;
    if (!state.currentLookupRoom) {
      renderLookupResult(null, "That join code did not resolve to a Bingo room.");
      return;
    }
    renderLookupResult(state.currentLookupRoom, "");
  } catch (error) {
    renderLookupResult(null, error.message || "Lookup failed.");
  }
}

async function joinMatch(joinCode, { activeTab = "lobby", lobbySubtab = "join", showErrors = true } = {}) {
  const joinCodeKey = normalizedJoinCode(joinCode);
  if (!joinCodeKey || state.joiningRoomCodes.has(joinCodeKey)) return;
  state.joiningRoomCodes.add(joinCodeKey);
  renderJoinSurfaces();
  try {
    const payload = await apiRequest("/api/v1/matches/join", {
      method: "POST",
      body: { joinCode: joinCodeKey },
    });
    state.activeMatch = payload;
    state.selectedCellId = null;
    state.activeTab = ["games", "lobby", "room"].includes(activeTab) ? activeTab : "lobby";
    if (state.activeTab === "room" && !payload?.matchState?.cells?.length) {
      state.activeTab = "lobby";
    }
    state.lobbySubtab = lobbySubtab === "players" ? "players" : "join";
    const routeScope = currentMatchRouteScope(payload);
    if (routeScope) {
      setHashRoute(routeScope, {
        activeTab: state.activeTab,
        lobbySubtab: state.lobbySubtab,
      });
    }
    connectMatchEvents(routeScope);
    if (payload?.roomSummary?.joinCode) {
      await loadRooms();
    }
    renderMatch();
    closeShell();
  } catch (error) {
    if (error.code === "login_required" && error.loginUrl) {
      window.location.assign(error.loginUrl);
      return;
    }
    if (showErrors) {
      window.alert(error.message || "Failed to join the match.");
    }
  } finally {
    state.joiningRoomCodes.delete(joinCodeKey);
    renderJoinSurfaces();
  }
}

async function leaveMatch() {
  if (state.leavingMatch || !state.activeMatch) return;
  const matchUid = state.activeMatch.matchUid || "current";
  state.leavingMatch = true;
  state.regeneratingRoom = false;
  state.checkingCurrentMap = false;
  setLeaveButtonState();
  setRegenerateRoomButtonState();
  try {
    await apiRequest(`/api/v1/matches/${encodeURIComponent(matchUid)}/leave`, {
      method: "POST",
    });
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
      state.eventScope = "";
    }
    state.activeMatch = null;
    state.selectedCellId = null;
    state.activeTab = "games";
    state.lobbySubtab = "join";
    setHashRoute("", { activeTab: "games", lobbySubtab: "join" });
    closeTilePopover();
    closeRoomSettings();
    await loadRooms();
    renderMatch();
  } catch (error) {
    window.alert(error.message || "Failed to leave the room.");
  } finally {
    state.leavingMatch = false;
    setLeaveButtonState();
    setRegenerateRoomButtonState();
  }
}

async function chooseTeam(matchUid, teamId) {
  try {
    state.activeMatch = await apiRequest(`/api/v1/matches/${encodeURIComponent(matchUid)}/team`, {
      method: "POST",
      body: { teamId },
    });
    connectMatchEvents(matchUid);
    state.activeTab = "room";
    setHashRoute(matchUid, {
      activeTab: state.activeTab,
      lobbySubtab: state.lobbySubtab,
    });
    renderMatch();
    closeShell();
  } catch (error) {
    window.alert(error.message || "Failed to join the team.");
  }
}

async function loadMatch(matchUid, { activeTab = "room", lobbySubtab = "join" } = {}) {
  try {
    state.activeMatch = await apiRequest(`/api/v1/matches/${encodeURIComponent(matchUid)}`);
    connectMatchEvents(matchEventScope(state.activeMatch) || matchUid);
    state.activeTab = ["games", "lobby", "room"].includes(activeTab) ? activeTab : "room";
    state.lobbySubtab = lobbySubtab === "players" ? "players" : "join";
    state.selectedCellId = null;
    renderMatch();
    closeShell();
  } catch (error) {
    state.activeMatch = null;
    renderMatch();
    window.alert(error.message || "Failed to load match details.");
  }
}

async function returnToPlayAfterRoomExit({ message = "", showAlert = false } = {}) {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.activeMatch = null;
  state.selectedCellId = null;
  state.regeneratingRoom = false;
  state.checkingCurrentMap = false;
  state.activeTab = "games";
  state.lobbySubtab = "join";
  setHashRoute("", { activeTab: "games", lobbySubtab: "join" });
  closeTilePopover();
  closeRoomSettings();
  renderMatch();
  await loadRooms();
  if (showAlert && message) {
    window.alert(message);
  }
}

function applyEventPayload(payload) {
  if (!payload || !state.activeMatch) return;
  if (payload.left || payload.roomClosed) {
    void returnToPlayAfterRoomExit({
      message: payload.message || "The host closed this Bingo room.",
      showAlert: Boolean(payload.roomClosed && !state.leavingMatch),
    });
    return;
  }
  if (payload.matchState) {
    state.activeMatch.matchState = payload.matchState;
  }
  if (payload.roomBinding) {
    state.activeMatch.roomBinding = payload.roomBinding;
  }
  if (payload.roomSummary) {
    state.activeMatch.roomSummary = payload.roomSummary;
  }
  if (payload.claimStatus) {
    state.activeMatch.claimStatus = payload.claimStatus;
  }
  if (payload.detailMessage !== undefined) {
    state.activeMatch.detailMessage = payload.detailMessage;
  }
  if (payload.mapSwitchProgress) {
    updateMapSwitchProgress(payload.mapSwitchProgress);
  }
  if (payload.notification) {
    showBingoNotification(payload.notification);
  }
  if (payload.requiresTeamChoice !== undefined) {
    state.activeMatch.requiresTeamChoice = Boolean(payload.requiresTeamChoice);
  }
  if (payload.teamChoiceAllowed !== undefined) {
    state.activeMatch.teamChoiceAllowed = Boolean(payload.teamChoiceAllowed);
  }
  if (payload.matchUid && !String(payload.matchUid).startsWith("room:")) {
    state.activeMatch.matchUid = payload.matchUid;
  }
  if (payload.matchState?.cells?.length && state.activeTab === "lobby") {
    state.activeTab = "room";
  }
  const nextScope = currentMatchRouteScope();
  if (nextScope) {
    setHashRoute(nextScope, {
      activeTab: state.activeTab,
      lobbySubtab: state.lobbySubtab,
    });
    if (nextScope !== state.eventScope) {
      connectMatchEvents(nextScope);
    }
  }
  renderMatch();
  if (!els.tilePopover?.classList.contains("hidden")) {
    renderSelectedMap();
    renderClaimStatus();
  }
}

function connectMatchEvents(matchUid) {
  if (!matchUid) return;
  if (state.eventSource && state.eventScope === matchUid) return;
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  const sourceUrl = apiUrl(`/events/matches/${encodeURIComponent(matchUid)}`);
  const source = new EventSource(sourceUrl);
  source.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyEventPayload(payload);
    } catch (error) {
      console.warn("Failed to parse SSE payload", error);
    }
  });
  source.addEventListener("error", () => {
    source.close();
    if (state.eventSource === source) {
      state.eventSource = null;
      state.eventScope = "";
    }
  });
  state.eventSource = source;
  state.eventScope = matchUid;
}

async function switchMapCell(cellId, { anchor = null } = {}) {
  const matchUid = state.activeMatch?.matchUid;
  if (!matchUid || cellId === null || cellId === undefined) return;
  if (state.mapSwitchProgress.visible && state.mapSwitchProgress.state === "running") return;
  cancelBoardHoldAction({ suppressClick: true });
  state.selectedCellId = cellId;
  const targetCell = getSelectedCell();
  const targetMapName = targetCell?.map ? cellMapName(targetCell) : "that map";
  state.tilePopoverAnchor = anchor || state.tilePopoverAnchor;
  if (anchor) {
    els.boardGrid?.querySelectorAll(".board-cell.is-selected").forEach((cell) => {
      cell.classList.remove("is-selected");
    });
    anchor.classList.add("is-selected");
  }
  if (els.switchMapButton) {
    els.switchMapButton.disabled = true;
  }
  renderSelectedMap();
  renderClaimStatus();
  startMapSwitchProgress();
  try {
    const payload = await apiRequest(
      `/api/v1/matches/${encodeURIComponent(matchUid)}/tiles/${encodeURIComponent(cellId)}/select-map`,
      { method: "POST" }
    );
    applyEventPayload(payload);
    finishMapSwitchProgress(`Moved to ${targetMapName}. Your generated console room now points at this tile.`);
  } catch (error) {
    failMapSwitchProgress(error.message || "Failed to switch the room map.");
  } finally {
    renderSelectedMap();
  }
}

function openNotification(notification) {
  const cellId = Number(notification?.cellId);
  if (!Number.isFinite(cellId) || !state.activeMatch?.matchState?.cells?.length) return;
  state.activeTab = "room";
  state.selectedCellId = cellId;
  const routeScope = currentMatchRouteScope();
  if (routeScope) {
    setHashRoute(routeScope, {
      activeTab: state.activeTab,
      lobbySubtab: state.lobbySubtab,
    });
  }
  renderMatch();
  window.setTimeout(() => {
    const anchors = Array.from(els.boardGrid?.querySelectorAll(".board-cell") || []);
    const anchor = anchors.find((entry) => Number(entry.dataset.cellId) === cellId) || null;
    openTilePopover(cellId, anchor);
  }, 0);
}

async function switchSelectedMap() {
  await switchMapCell(state.selectedCellId);
}

async function checkCurrentMap() {
  const matchUid = state.activeMatch?.matchUid;
  if (!matchUid || state.checkingCurrentMap) return;
  state.checkingCurrentMap = true;
  setManualCheckButtonState();
  try {
    const payload = await apiRequest(`/api/v1/matches/${encodeURIComponent(matchUid)}/current-map/check`, {
      method: "POST",
    });
    applyEventPayload(payload);
    if (els.manualRecordStatus) {
      const remaining = payload?.manualCheck?.remaining;
      els.manualRecordStatus.textContent =
        remaining !== undefined
          ? `Checked. ${remaining} manual checks left this minute.`
          : "Checked. Bingo updates when a new verified record is found.";
    }
  } catch (error) {
    if (error.status === 429 && error.payload?.retryAfterSeconds) {
      if (els.manualRecordStatus) {
        els.manualRecordStatus.textContent = `Manual check limit reached. Try again in ${error.payload.retryAfterSeconds}s.`;
      }
    } else {
      window.alert(error.message || "Failed to request an immediate verification.");
    }
  } finally {
    state.checkingCurrentMap = false;
    renderSelectedMap();
    setManualCheckButtonState();
  }
}

async function regenerateRoom() {
  const matchUid = state.activeMatch?.matchUid;
  if (!matchUid || state.regeneratingRoom) return;
  state.regeneratingRoom = true;
  setRegenerateRoomButtonState();
  try {
    const payload = await apiRequest(`/api/v1/matches/${encodeURIComponent(matchUid)}/room/regenerate`, {
      method: "POST",
    });
    applyEventPayload(payload);
    if (els.clubPathNote) {
      els.clubPathNote.textContent =
        "Fresh one-player room generated. If the old slot was taken, back out in Trackmania and enter this room again.";
    }
  } catch (error) {
    window.alert(error.message || "Failed to regenerate the console room.");
  } finally {
    state.regeneratingRoom = false;
    renderMatch();
  }
}

function setActiveTab(tab) {
  const nextTab = ["games", "lobby", "room"].includes(tab) ? tab : "games";
  state.activeTab = !state.activeMatch && nextTab !== "games" ? "games" : nextTab;
  if (state.activeTab !== "room") closeTilePopover();
  setHashRoute(currentMatchRouteScope(), {
    activeTab: state.activeTab,
    lobbySubtab: state.lobbySubtab,
  });
  renderTabState();
}

function setLobbySubtab(tab) {
  state.lobbySubtab = tab === "players" ? "players" : "join";
  setHashRoute(currentMatchRouteScope(), {
    activeTab: state.activeTab,
    lobbySubtab: state.lobbySubtab,
  });
  renderLobbySubtabs();
}

async function bootstrap() {
  syncShellLayout();
  syncBoardSizeControls();
  els.shellEdgeToggle?.addEventListener("click", toggleShell);
  els.shellScrim?.addEventListener("click", closeShell);
  window.addEventListener("resize", syncShellLayout);
  els.boardSizeSlider?.addEventListener("input", (event) => {
    setBoardTileSize(event.currentTarget.value);
  });
  els.boardPane?.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextSize = state.boardTileSize + direction * Math.max(4, state.boardTileSize * 0.08);
      setBoardTileSize(nextSize, {
        focalClientX: event.clientX,
        focalClientY: event.clientY,
      });
    },
    { passive: false }
  );
  els.boardPane?.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    state.boardPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.boardPointers.size === 2) {
      els.boardPane.setPointerCapture?.(event.pointerId);
      startBoardGestureIfReady();
    }
  });
  els.boardPane?.addEventListener("pointermove", (event) => {
    if (!state.boardPointers.has(event.pointerId)) return;
    state.boardPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    updateBoardGesture(event);
  });
  const finishBoardPointer = (event) => {
    state.boardPointers.delete(event.pointerId);
    if (state.boardGesture && state.boardPointers.size < 2) {
      state.boardGesture = null;
      state.boardSuppressClickUntil = Date.now() + 350;
      try {
        window.localStorage.setItem(BOARD_SIZE_STORAGE_KEY, String(Math.round(state.boardTileSize)));
      } catch {
        // Non-critical.
      }
    }
  };
  els.boardPane?.addEventListener("pointerup", finishBoardPointer);
  els.boardPane?.addEventListener("pointercancel", finishBoardPointer);
  els.boardPane?.addEventListener("pointerleave", finishBoardPointer);
  els.tabGamesButton?.addEventListener("click", () => setActiveTab("games"));
  els.tabLobbyButton?.addEventListener("click", () => setActiveTab("lobby"));
  els.tabRoomButton?.addEventListener("click", () => setActiveTab("room"));
  els.roomSettingsButton?.addEventListener("click", openRoomSettings);
  els.roomSettingsClose?.addEventListener("click", closeRoomSettings);
  els.roomSettingsBackdrop?.addEventListener("click", closeRoomSettings);
  els.lobbyJoinTabButton?.addEventListener("click", () => setLobbySubtab("join"));
  els.lobbyPlayersTabButton?.addEventListener("click", () => setLobbySubtab("players"));
  els.tileDetailsTabButton?.addEventListener("click", () => setTileModalTab("details"));
  els.tileRunsTabButton?.addEventListener("click", () => setTileModalTab("runs"));
  els.mapSwitchCloseButton?.addEventListener("click", hideMapSwitchProgress);
  els.refreshRoomsButton.addEventListener("click", loadRooms);
  els.openBoardButton?.addEventListener("click", () => setActiveTab("room"));
  els.regenerateRoomButton?.addEventListener("click", regenerateRoom);
  els.leaveMatchButton?.addEventListener("click", leaveMatch);
  els.manualRecordButton?.addEventListener("click", checkCurrentMap);
  els.privateLookupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const joinCode = String(els.joinCodeInput.value || "").trim();
    if (!joinCode) {
      renderLookupResult(null, "Enter a join code first.");
      return;
    }
    lookupPrivateRoom(joinCode);
  });
  els.switchMapButton.addEventListener("click", switchSelectedMap);
  els.checkMapButton.addEventListener("click", checkCurrentMap);
  els.tilePopoverClose?.addEventListener("click", () => closeTilePopover());
  els.tilePopoverBackdrop?.addEventListener("click", () => closeTilePopover());
  document.addEventListener("pointerdown", (event) => {
    if (els.tilePopover?.classList.contains("hidden")) return;
    const target = event.target;
    if (els.tilePopover?.contains(target) || state.tilePopoverAnchor?.contains(target)) return;
    closeTilePopover();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeRoomSettings();
    closeTilePopover();
  });
  window.addEventListener("hashchange", () => {
    const route = parseHashRoute();
    const matchUid = route.matchUid;
    if (!matchUid) {
      if (route.joinCode) {
        joinMatch(route.joinCode, {
          activeTab: route.activeTab,
          lobbySubtab: route.lobbySubtab,
          showErrors: false,
        });
      } else {
        state.activeMatch = null;
        state.activeTab = "games";
        state.lobbySubtab = "join";
        if (state.eventSource) {
          state.eventSource.close();
          state.eventSource = null;
          state.eventScope = "";
        }
        renderMatch();
      }
      return;
    }
    loadMatch(matchUid, route);
  });

  await loadSession();
  await loadRooms();
  const route = parseHashRoute();
  if (route.matchUid) {
    await loadMatch(route.matchUid, route);
  } else if (route.joinCode) {
    await joinMatch(route.joinCode, {
      activeTab: route.activeTab,
      lobbySubtab: route.lobbySubtab,
      showErrors: false,
    });
  } else {
    state.activeTab = "games";
    state.lobbySubtab = "join";
    renderMatch();
  }
}

configureBingoActions({ chooseTeam, joinMatch, openNotification, switchMapCell });
bootstrap();
