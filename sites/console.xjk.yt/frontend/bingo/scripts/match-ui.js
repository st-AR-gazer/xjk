import { chooseTeam, switchMapCell } from "./actions.js?v=2";
import {
  closeRoomSettings,
  hideMapSwitchProgress,
  renderLobbySubtabs,
  renderRoomSettings,
  renderTabState,
} from "./chrome-ui.js?v=2";
import {
  BOARD_SIZE_STORAGE_KEY,
  BOARD_TILE_DEFAULT,
  BOARD_TILE_HOLD_MOVE_TOLERANCE,
  BOARD_TILE_HOLD_MS,
  BOARD_TILE_MAX,
  BOARD_TILE_MIN,
  clampNumber,
  els,
  setTileModalTab,
  state,
} from "./core.js?v=2";
import {
  activeTargetMedal,
  applyTeamStyle,
  cellMapAuthor,
  cellMapName,
  cellMapTmxId,
  cellThumbnailUrl,
  claimPlayerName,
  claimTeamId,
  currentRoomMapCellId,
  escapeHtml,
  formatTime,
  getCellIndex,
  getCellState,
  getLobbyTeams,
  getSelectedCell,
  getSelectedMap,
  mapModeName,
  matchPhaseLabel,
  medalName,
  sortedCellClaims,
  targetTimeForMap,
  teamColorForId,
  teamColorMap,
  teamNameForId,
  teamStyleAttribute,
  teamVisualFromTeam,
  tileCoordinateLabel,
} from "./domain.js?v=2";
import { setLeaveButtonState, setManualCheckButtonState, setRegenerateRoomButtonState } from "./room-list-ui.js?v=2";
function renderMatch() {
  renderTabState();
  if (!state.activeMatch) {
    els.lobbyEmpty.classList.remove("hidden");
    els.lobbyActive.classList.add("hidden");
    els.roomEmpty.classList.remove("hidden");
    els.roomActive.classList.add("hidden");
    els.boardLayout?.classList.remove("has-selection");
    renderRoomSettings();
    closeRoomSettings();
    closeTilePopover();
    setLeaveButtonState();
    setRegenerateRoomButtonState();
    setManualCheckButtonState();
    return;
  }

  renderLobbySubtabs();

  els.lobbyEmpty.classList.add("hidden");
  els.lobbyActive.classList.remove("hidden");
  els.roomEmpty.classList.add("hidden");
  els.roomActive.classList.remove("hidden");
  const match = state.activeMatch;
  const room = match.roomSummary || {};
  const matchState = match.matchState || null;
  const showTeamPicker = Boolean(
    match.requiresTeamChoice && Array.isArray(matchState?.teams) && matchState.teams.length
  );
  els.matchTitle.textContent = room.name || `Match ${match.matchUid}`;
  els.matchPhasePill.textContent = matchPhaseLabel(match);
  setLeaveButtonState();
  setRegenerateRoomButtonState();
  setManualCheckButtonState();

  const chips = [];
  if (room.joinCode) chips.push(`Join code: ${room.joinCode}`);
  if (room.playerCount !== undefined) chips.push(`Players: ${room.playerCount}`);
  if (room.gridSize) chips.push(`Grid: ${room.gridSize}x${room.gridSize}`);
  if (room.selection !== undefined) chips.push(`${mapModeName(room.selection)}`);
  if (match.teamChoiceAllowed) {
    chips.push(showTeamPicker ? "Team required" : "Team locked in");
  } else if (room.hostControl || room.randomize) {
    chips.push("Team locked by host");
  }
  const detailMessage = /already joined/i.test(String(match.detailMessage || ""))
    ? "You're connected to this Bingo room. Open it in Trackmania, then continue in Room here."
    : match.detailMessage;
  globalThis.XjkSafeHtml.set(
    els.matchSummary,
    `<div class="summary-row">${chips
      .map((chip) => `<span class="summary-chip">${escapeHtml(chip)}</span>`)
      .join("")}</div>` +
      (showTeamPicker
        ? `<div class="team-required-banner">` +
          `<p class="team-required-banner__eyebrow">Action required</p>` +
          `<h3>Pick a team to enter the live board</h3>` +
          `<p>You are already connected to this Bingo match. The board opens after you choose which team your console player should join.</p>` +
          `</div>`
        : "") +
      (detailMessage ? `<p class="panel__intro">${escapeHtml(detailMessage)}</p>` : "")
  );

  els.teamPicker.classList.toggle("hidden", !showTeamPicker);
  els.lobbySubtabs?.classList.toggle("hidden", showTeamPicker);
  els.lobbyJoinPanel?.classList.toggle("hidden", showTeamPicker || state.lobbySubtab === "players");
  els.lobbyPlayersPanel?.classList.toggle("hidden", showTeamPicker || state.lobbySubtab !== "players");

  if (showTeamPicker) {
    globalThis.XjkSafeHtml.set(
      els.teamPickerIntro,
      `<strong>Choose where you want to play.</strong>` +
        `<span>This only affects this Bingo match. You can leave and rejoin if you picked the wrong side.</span>`
    );
    els.teamPickerList.replaceChildren();
    const colors = teamColorMap(matchState);
    for (const [index, team] of matchState.teams.entries()) {
      const playerCount = Array.isArray(team.members) ? team.members.length : 0;
      const teamVisual = colors.get(Number(team?.base?.id ?? team?.id)) || teamVisualFromTeam(team, index);
      const teamName = teamVisual.name;
      const teamId = teamVisual.id;
      const button = document.createElement("button");
      button.className = "team-btn";
      button.type = "button";
      applyTeamStyle(button, teamVisual);
      globalThis.XjkSafeHtml.set(
        button,
        `<span class="team-color-dot" aria-hidden="true"></span>` +
          `<strong>Join ${escapeHtml(teamName)}</strong>` +
          `<span class="team-btn__meta">${playerCount} ${playerCount === 1 ? "player" : "players"} currently on this team</span>`
      );
      button.addEventListener("click", () => chooseTeam(match.matchUid, teamId));
      els.teamPickerList.appendChild(button);
    }
  }

  renderBoard();
  renderSelectedMap();
  renderClaimStatus();
  renderClubPath();
  renderLobbyPlayers();
  renderRoomSettings();
}

function boardSizePercent(size = state.boardTileSize) {
  return Math.round((Number(size || BOARD_TILE_DEFAULT) / BOARD_TILE_DEFAULT) * 100);
}

function syncBoardSizeControls() {
  if (els.boardGrid) {
    els.boardGrid.style.setProperty("--board-tile-size", `${Math.round(state.boardTileSize)}px`);
  }
  if (els.boardSizeSlider) {
    els.boardSizeSlider.value = String(Math.round(state.boardTileSize));
  }
  if (els.boardSizeValue) {
    els.boardSizeValue.textContent = `${boardSizePercent()}%`;
  }
}

function setBoardTileSize(size, { focalClientX = null, focalClientY = null, persist = true } = {}) {
  const pane = els.boardPane;
  const grid = els.boardGrid;
  const nextSize = clampNumber(size, BOARD_TILE_MIN, BOARD_TILE_MAX);
  const beforeWidth = grid?.scrollWidth || 0;
  const beforeHeight = grid?.scrollHeight || 0;
  let ratioX = null;
  let ratioY = null;
  let focalX = null;
  let focalY = null;

  if (pane && grid && beforeWidth > 0 && beforeHeight > 0 && focalClientX !== null && focalClientY !== null) {
    const rect = pane.getBoundingClientRect();
    focalX = focalClientX - rect.left;
    focalY = focalClientY - rect.top;
    ratioX = (pane.scrollLeft + focalX) / beforeWidth;
    ratioY = (pane.scrollTop + focalY) / beforeHeight;
  }

  state.boardTileSize = nextSize;
  syncBoardSizeControls();

  if (persist) {
    try {
      window.localStorage.setItem(BOARD_SIZE_STORAGE_KEY, String(Math.round(nextSize)));
    } catch {
      // Non-critical: browser privacy settings may block local storage.
    }
  }

  if (pane && grid && ratioX !== null && ratioY !== null) {
    window.requestAnimationFrame(() => {
      pane.scrollLeft = Math.max(0, (grid.scrollWidth || beforeWidth) * ratioX - focalX);
      pane.scrollTop = Math.max(0, (grid.scrollHeight || beforeHeight) * ratioY - focalY);
    });
  }
}

function boardPointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function boardPointerCenter(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function boardPointers() {
  return [...state.boardPointers.values()];
}

function startBoardGestureIfReady() {
  const pointers = boardPointers();
  if (pointers.length !== 2 || !els.boardPane) return;
  const center = boardPointerCenter(pointers[0], pointers[1]);
  state.boardGesture = {
    distance: Math.max(1, boardPointerDistance(pointers[0], pointers[1])),
    center,
    tileSize: state.boardTileSize,
    scrollLeft: els.boardPane.scrollLeft,
    scrollTop: els.boardPane.scrollTop,
  };
}

function updateBoardGesture(event) {
  if (!state.boardGesture || state.boardPointers.size !== 2 || !els.boardPane) return;
  cancelBoardHoldAction();
  const pointers = boardPointers();
  const center = boardPointerCenter(pointers[0], pointers[1]);
  const distance = Math.max(1, boardPointerDistance(pointers[0], pointers[1]));
  const scale = distance / state.boardGesture.distance;
  setBoardTileSize(state.boardGesture.tileSize * scale, {
    focalClientX: center.x,
    focalClientY: center.y,
    persist: false,
  });
  els.boardPane.scrollLeft = state.boardGesture.scrollLeft - (center.x - state.boardGesture.center.x);
  els.boardPane.scrollTop = state.boardGesture.scrollTop - (center.y - state.boardGesture.center.y);
  event?.preventDefault?.();
}

function cancelBoardHoldAction({ suppressClick = false } = {}) {
  const action = state.boardHoldAction;
  if (!action) return;
  window.clearTimeout(action.timer);
  action.button?.classList.remove("is-holding");
  state.boardHoldAction = null;
  if (suppressClick) {
    state.boardSuppressClickUntil = Date.now() + 650;
  }
}

function beginBoardHoldAction(event, cellId, button, supported = true) {
  if (!supported || !state.activeMatch?.matchUid) return;
  if (state.mapSwitchProgress.visible && state.mapSwitchProgress.state === "running") return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  cancelBoardHoldAction();
  state.boardHoldAction = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cellId,
    button,
    timer: window.setTimeout(() => {
      const active = state.boardHoldAction;
      if (!active || Number(active.cellId) !== Number(cellId)) return;
      button.classList.remove("is-holding");
      state.boardHoldAction = null;
      state.boardSuppressClickUntil = Date.now() + 750;
      void switchMapCell(cellId, { anchor: button });
    }, BOARD_TILE_HOLD_MS),
  };
  button.classList.add("is-holding");
}

function updateBoardHoldAction(event) {
  const action = state.boardHoldAction;
  if (!action || action.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - action.startX, event.clientY - action.startY);
  if (distance > BOARD_TILE_HOLD_MOVE_TOLERANCE) {
    cancelBoardHoldAction();
  }
}

function renderBoard() {
  const matchState = state.activeMatch?.matchState;
  els.boardGrid.replaceChildren();
  if (!matchState) {
    globalThis.XjkSafeHtml.set(els.boardGrid, `<p class="panel__compact-copy">Board is not ready yet.</p>`);
    return;
  }
  const cells = Array.isArray(matchState.cells) ? matchState.cells : [];
  const gridSize = Number(matchState.config?.grid_size ?? 0) || Math.max(1, Math.round(Math.sqrt(cells.length || 1)));
  syncBoardSizeControls();
  els.boardGrid.style.gridTemplateColumns = `repeat(${gridSize}, var(--board-tile-size))`;
  const colors = teamColorMap(matchState);
  const currentMapCellId = currentRoomMapCellId();

  for (const [index, rawCell] of cells.entries()) {
    const cell = getCellState(rawCell);
    const tileLabel = tileCoordinateLabel(index, gridSize);
    const thumbnail = cellThumbnailUrl(rawCell);
    const name = cellMapName(rawCell);
    const author = cellMapAuthor(rawCell);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "board-cell";
    button.dataset.cellId = String(cell.cellId);
    button.setAttribute("aria-label", `Tile ${tileLabel}: ${name}`);
    if (Number(state.selectedCellId) === cell.cellId) {
      button.classList.add("is-selected");
      state.tilePopoverAnchor = button;
    }
    const claimColor = colors.get(cell.claimant);
    if (claimColor) {
      button.style.setProperty("--claim-border", claimColor.border);
      button.style.setProperty("--claim-soft", claimColor.soft);
      button.style.setProperty("--claim-glow", claimColor.glow);
      applyTeamStyle(button, claimColor);
      button.setAttribute("aria-label", `Tile ${tileLabel}: ${name}, claimed by ${claimColor.name}`);
      button.classList.add("is-claimed");
    }
    const isCurrentMapCell = currentMapCellId !== null && Number(currentMapCellId) === Number(cell.cellId);
    if (isCurrentMapCell) {
      button.classList.add("is-current-map");
      button.setAttribute("aria-current", "true");
      button.setAttribute(
        "aria-label",
        claimColor
          ? `Current room map, tile ${tileLabel}: ${name}, claimed by ${claimColor.name}`
          : `Current room map, tile ${tileLabel}: ${name}`
      );
    }
    const currentStatus = isCurrentMapCell
      ? `<span class="board-cell__current-pulse" aria-hidden="true"></span>` +
        `<span class="board-cell__current-marker" aria-hidden="true">` +
        `<span class="board-cell__current-marker-icon"></span>` +
        `<span>You are here</span>` +
        `</span>`
      : "";
    const claimTag = claimColor
      ? `<span class="board-cell__claim-tag"><span class="team-color-dot" aria-hidden="true"></span><span>${escapeHtml(claimColor.name)}</span></span>`
      : "";
    globalThis.XjkSafeHtml.set(
      button,
      `<span class="board-cell__media${thumbnail ? "" : " is-missing"}">` +
        (thumbnail ? `<img loading="lazy" src="${escapeHtml(thumbnail)}" alt="">` : "") +
        `<span class="board-cell__fallback">${escapeHtml(tileLabel)}</span>` +
        `</span>` +
        `<span class="board-cell__caption">` +
        `<span class="board-cell__name">${escapeHtml(name)}</span>` +
        (author ? `<span class="board-cell__meta">by ${escapeHtml(author)}</span>` : "") +
        `</span>` +
        claimTag +
        `<span class="board-cell__id">${escapeHtml(tileLabel)}</span>` +
        currentStatus
    );
    const mediaElement = button.querySelector(".board-cell__media");
    const thumbnailElement = mediaElement?.querySelector("img");
    thumbnailElement?.addEventListener(
      "error",
      () => {
        mediaElement.classList.add("is-missing");
        thumbnailElement.remove();
      },
      { once: true }
    );
    button.addEventListener("pointerdown", (event) => {
      beginBoardHoldAction(event, cell.cellId, button, cell.map?.type === "TMX");
    });
    button.addEventListener("pointermove", updateBoardHoldAction);
    button.addEventListener("pointerup", () => cancelBoardHoldAction());
    button.addEventListener("pointercancel", () => cancelBoardHoldAction());
    button.addEventListener("pointerleave", () => cancelBoardHoldAction());
    button.addEventListener("contextmenu", (event) => {
      if (state.boardHoldAction?.button === button || Date.now() < state.boardSuppressClickUntil) {
        event.preventDefault();
      }
    });
    button.addEventListener("click", () => {
      if (Date.now() < state.boardSuppressClickUntil) return;
      openTilePopover(cell.cellId, button);
    });
    els.boardGrid.appendChild(button);
  }
}

function renderSelectedMapRunHistory(selectedCell) {
  const claims = sortedCellClaims(selectedCell);
  if (els.tileRunsTabButton) {
    els.tileRunsTabButton.textContent = claims.length ? `Run history (${claims.length})` : "Run history";
  }
  if (!els.selectedMapRunHistory) return;

  if (!selectedCell) {
    globalThis.XjkSafeHtml.set(
      els.selectedMapRunHistory,
      `<div class="run-history__empty">Select a tile to see submitted runs.</div>`
    );
    return;
  }

  if (!claims.length) {
    globalThis.XjkSafeHtml.set(
      els.selectedMapRunHistory,
      `<div class="run-history__empty">No submitted runs on this tile yet.</div>`
    );
    return;
  }

  globalThis.XjkSafeHtml.set(
    els.selectedMapRunHistory,
    claims
      .map((claim, index) => {
        const teamId = claimTeamId(claim);
        const teamColor = teamColorForId(teamId);
        const medal = claim?.medal ?? claim?.verified_medal ?? claim?.verifiedMedal ?? null;
        const recordId = String(claim?.record_id || claim?.recordId || "").trim();
        const medalLabel = medal !== null && medal !== undefined ? ` &middot; ${escapeHtml(medalName(medal))}` : "";
        return (
          `<article class="run-history__row${teamColor ? " is-team-colored" : ""}"${teamColor ? ` style="${teamStyleAttribute(teamColor)}"` : ""}>` +
          `<span class="run-history__rank">#${index + 1}</span>` +
          `<div class="run-history__main">` +
          `<strong>${escapeHtml(claimPlayerName(claim))}</strong>` +
          `<span class="run-history__team">${teamColor ? `<span class="team-color-dot" aria-hidden="true"></span>` : ""}${escapeHtml(teamNameForId(teamId))}${medalLabel}</span>` +
          (recordId ? `<small>${escapeHtml(recordId)}</small>` : "") +
          `</div>` +
          `<time class="run-history__time">${escapeHtml(formatTime(claim?.time ?? claim?.verified_time ?? claim?.verifiedTime))}</time>` +
          `</article>`
        );
      })
      .join("")
  );
}

function renderSelectedMapMedia({ thumbnail = "", tileLabel = "", title = "" } = {}) {
  if (!els.selectedMapMedia) return;
  els.selectedMapMedia.replaceChildren();
  els.selectedMapMedia.style.removeProperty("--thumb-aspect");
  els.selectedMapMedia.removeAttribute("data-thumbnail-size");
  els.selectedMapMedia.removeAttribute("data-thumbnail-src");

  if (!thumbnail) {
    els.selectedMapMedia.classList.add("is-missing");
    const fallback = document.createElement("span");
    fallback.textContent = tileLabel || "?";
    els.selectedMapMedia.appendChild(fallback);
    return;
  }

  els.selectedMapMedia.classList.remove("is-missing");
  els.selectedMapMedia.setAttribute("data-thumbnail-src", thumbnail);
  const image = new Image();
  image.alt = title ? `${title} thumbnail` : "Map thumbnail";
  image.decoding = "async";
  image.loading = "eager";
  image.addEventListener("load", () => {
    if (els.selectedMapMedia?.getAttribute("data-thumbnail-src") !== thumbnail) return;
    const width = Number(image.naturalWidth || 0);
    const height = Number(image.naturalHeight || 0);
    if (width > 0 && height > 0) {
      els.selectedMapMedia.style.setProperty("--thumb-aspect", `${width} / ${height}`);
      els.selectedMapMedia.setAttribute("data-thumbnail-size", `${width}x${height}`);
    }
  });
  image.addEventListener("error", () => {
    if (els.selectedMapMedia?.getAttribute("data-thumbnail-src") !== thumbnail) return;
    els.selectedMapMedia.classList.add("is-missing");
    els.selectedMapMedia.style.removeProperty("--thumb-aspect");
    els.selectedMapMedia.removeAttribute("data-thumbnail-size");
    els.selectedMapMedia.removeAttribute("data-thumbnail-src");
    els.selectedMapMedia.replaceChildren();
    const fallback = document.createElement("span");
    fallback.textContent = tileLabel || "?";
    els.selectedMapMedia.appendChild(fallback);
  });
  image.src = thumbnail;
  els.selectedMapMedia.appendChild(image);
}

function renderSelectedMap() {
  const selectedCell = getSelectedCell();
  const selectedMap = getSelectedMap();
  const hasSelection = Boolean(selectedCell && selectedMap);
  els.boardLayout?.classList.toggle("has-selection", hasSelection);
  if (!selectedCell || !selectedMap) {
    els.selectedMapTitle.textContent = "Pick a tile";
    els.selectedMapSubtitle.textContent = "Select a tile to target it.";
    els.selectedMapStats.replaceChildren();
    renderSelectedMapMedia();
    renderSelectedMapRunHistory(null);
    els.switchMapButton.disabled = true;
    setManualCheckButtonState();
    return;
  }

  const matchState = state.activeMatch?.matchState || {};
  const gridSize =
    Number(matchState.config?.grid_size ?? 0) ||
    Math.max(1, Math.round(Math.sqrt((matchState.cells || []).length || 1)));
  const selectedIndex = getCellIndex(selectedCell.cell_id ?? selectedCell.cellId);
  const tileLabel = tileCoordinateLabel(selectedIndex >= 0 ? selectedIndex : 0, gridSize);
  const thumbnail = cellThumbnailUrl(selectedCell);
  const mapTitle = cellMapName(selectedCell);
  els.selectedMapTitle.textContent = mapTitle;
  const claims = sortedCellClaims(selectedCell);
  const leadingTime = claims[0]?.time ?? claims[0]?.verified_time ?? claims[0]?.verifiedTime;
  els.selectedMapSubtitle.textContent =
    selectedMap.type === "TMX" ? `Tile ${tileLabel} is ready to open in your room.` : "Unsupported map type.";
  renderSelectedMapMedia({ thumbnail, tileLabel, title: mapTitle });

  const stats = [];
  stats.push(["Tile", tileLabel]);
  if (selectedMap.type === "TMX") {
    const author = cellMapAuthor(selectedCell);
    const tmxId = cellMapTmxId(selectedMap);
    const targetMedal = activeTargetMedal();
    const targetTime = targetTimeForMap(selectedMap, targetMedal);
    if (author) stats.push(["Mapper", author]);
    if (selectedMap.style) stats.push(["Style", selectedMap.style]);
    if (tmxId) stats.push(["TMX", `#${tmxId}`]);
    stats.push(["Map UID", selectedMap.uid || "-"]);
    stats.push(["Target Medal", medalName(targetMedal)]);
    stats.push(["Target Time", targetTime]);
    if (Number(targetMedal) !== 1) {
      stats.push(["Author Time", targetTimeForMap(selectedMap, 1)]);
    }
    stats.push(["Best Claim", leadingTime ? formatTime(leadingTime) : "No claims"]);
  } else {
    stats.push(["Campaign", `#${selectedMap.campaign_id ?? "-"}`]);
    stats.push(["Map Slot", `#${selectedMap.map ?? "-"}`]);
  }
  globalThis.XjkSafeHtml.set(
    els.selectedMapStats,
    stats.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")
  );
  renderSelectedMapRunHistory(selectedCell);

  const unsupported = selectedMap.type !== "TMX";
  els.switchMapButton.disabled = unsupported;
  setManualCheckButtonState();
}

function renderClaimStatus() {
  const selectedCell = getSelectedCell();
  const selectedMap = getSelectedMap();
  if (!selectedCell || !selectedMap) {
    els.claimStatusTitle.textContent = "Waiting";
    els.claimStatusBody.textContent = "Select a tile first.";
    return;
  }
  const status = state.activeMatch?.claimStatus || null;
  if (!status) {
    els.claimStatusTitle.textContent = "Waiting";
    els.claimStatusBody.textContent = "Select a tile first.";
    return;
  }
  els.claimStatusTitle.textContent = status.title || "Verification status";
  els.claimStatusBody.textContent = status.body || "Waiting for the next verification cycle.";
}

function renderClubPath() {
  const roomBinding = state.activeMatch?.roomBinding || null;
  const clubPath = roomBinding?.clubPath || [];
  const playerName =
    String(
      state.session?.session?.user?.displayName ||
        state.session?.session?.user?.username ||
        state.session?.session?.user?.ubisoftAccountId ||
        ""
    ).trim() || "your account";
  const matchFolderName = String(clubPath[2] || "match folder").trim();
  const playerFolderName = String(clubPath[3] || "player folder").trim();
  const roomName = String(roomBinding?.roomName || clubPath[4] || "Join room").trim();
  const roomJoinLabel = /^join\b/i.test(roomName) ? roomName : `Join ${roomName}`;

  els.clubPathList.replaceChildren();
  if (!clubPath.length) {
    globalThis.XjkSafeHtml.set(
      els.clubPathList,
      '<li class="path-step"><strong>Join a live match first.</strong><span>The room path appears here as soon as the website has prepared your console room.</span></li>'
    );
    els.clubPathNote.textContent = "Room path appears here.";
    return;
  }

  const steps = [
    {
      title: 'Open "Clubs"',
      note: "",
    },
    {
      title: 'Search for "Bingo On Console"',
      note: "",
    },
    {
      title: 'Open the "Rooms" folder',
      note: "",
    },
    {
      title: "Open the match folder",
      note: `Your match folder is named "${matchFolderName}".`,
    },
    {
      title: "Open your player folder",
      note: `Your player folder is named "${playerFolderName}".`,
    },
    {
      title: "Join the Nadeo room!",
      note: `The room is named "${roomJoinLabel}" and is reserved for ${playerName}.`,
    },
  ];

  for (const step of steps) {
    const item = document.createElement("li");
    item.className = "path-step";
    globalThis.XjkSafeHtml.set(
      item,
      `<strong>${escapeHtml(step.title)}</strong>` +
        (step.note ? `<span class="path-step__note">${escapeHtml(step.note)}</span>` : "")
    );
    els.clubPathList.appendChild(item);
  }
  els.clubPathNote.textContent = "The final room is the one you enter in Trackmania.";

  if (els.joinGuideTitle) {
    els.joinGuideTitle.textContent = roomJoinLabel ? `How to reach ${roomJoinLabel}` : "Open your generated room";
  }
  if (els.joinGuideIntro) {
    els.joinGuideIntro.textContent = roomJoinLabel
      ? `This side is reserved for the future video or screenshot walkthrough for reaching ${roomJoinLabel}.`
      : "This side is reserved for the future video or screenshot walkthrough.";
  }
  if (els.joinInstructionsTitle) {
    els.joinInstructionsTitle.textContent = roomJoinLabel ? roomJoinLabel : "Follow the room path";
  }
  if (els.joinInstructionsIntro) {
    els.joinInstructionsIntro.textContent = "Open Trackmania on console, then follow these steps in order.";
  }
}

function renderLobbyPlayers() {
  if (!els.lobbyPlayersList || !els.lobbyPlayersTitle) return;
  els.lobbyPlayersList.replaceChildren();
  const teams = getLobbyTeams(state.activeMatch);
  const players = teams.flatMap((team) => team.players);
  els.lobbyPlayersTitle.textContent = players.length === 1 ? "1 player in room" : `${players.length} players in room`;
  if (!players.length) {
    globalThis.XjkSafeHtml.set(
      els.lobbyPlayersList,
      `<p class="panel__compact-copy">Nobody has joined this room yet.</p>`
    );
    return;
  }

  for (const team of teams) {
    const column = document.createElement("section");
    column.className = "lobby-team-column";
    applyTeamStyle(column, team.color);
    globalThis.XjkSafeHtml.set(
      column,
      `<header class="lobby-team-column__head">` +
        `<strong><span class="team-color-dot" aria-hidden="true"></span>${escapeHtml(team.name)}</strong>` +
        `<span>${team.players.length} ${team.players.length === 1 ? "player" : "players"}</span>` +
        `</header>`
    );

    const list = document.createElement("div");
    list.className = "lobby-team-column__list";

    if (!team.players.length) {
      globalThis.XjkSafeHtml.set(list, `<p class="panel__compact-copy">Nobody on this team yet.</p>`);
    } else {
      for (const player of team.players) {
        const item = document.createElement("article");
        item.className = "lobby-player";
        applyTeamStyle(item, player.color || team.color);
        const initial = escapeHtml(
          String(player.name || "?")
            .slice(0, 1)
            .toUpperCase()
        );
        globalThis.XjkSafeHtml.set(
          item,
          `<div class="lobby-player__avatar" aria-hidden="true">${initial}</div>` +
            `<div class="lobby-player__copy">` +
            `<strong>${escapeHtml(player.name)}</strong>` +
            `<span>${player.operator ? "Host" : "Player"}</span>` +
            `</div>`
        );
        list.appendChild(item);
      }
    }

    column.appendChild(list);
    els.lobbyPlayersList.appendChild(column);
  }
}

function openTilePopover(cellId, anchor) {
  state.selectedCellId = cellId;
  state.tilePopoverAnchor = anchor || null;
  els.boardGrid?.querySelectorAll(".board-cell.is-selected").forEach((cell) => {
    cell.classList.remove("is-selected");
  });
  anchor?.classList.add("is-selected");
  renderSelectedMap();
  renderClaimStatus();
  setTileModalTab("details");
  if (els.tilePopover) {
    els.tilePopover.classList.remove("hidden");
  }
}

function closeTilePopover() {
  hideMapSwitchProgress();
  state.tilePopoverAnchor = null;
  state.selectedCellId = null;
  els.tilePopover?.classList.add("hidden");
  els.boardGrid?.querySelectorAll(".board-cell.is-selected").forEach((cell) => {
    cell.classList.remove("is-selected");
  });
  renderSelectedMap();
  renderClaimStatus();
}

export {
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
};
