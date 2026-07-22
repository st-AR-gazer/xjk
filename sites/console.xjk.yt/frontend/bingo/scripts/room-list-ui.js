import { joinMatch } from "./actions.js?v=2";
import { els, state } from "./core.js?v=2";
import {
  escapeHtml,
  getSelectedMap,
  mapModeName,
  medalName,
  normalizedJoinCode,
  roomJoinDisabled,
} from "./domain.js?v=2";

function renderSession() {
  const session = state.session?.session || null;
  const readiness = state.session?.readiness || state.readiness || {};
  return {
    authenticated: Boolean(session?.user),
    readiness,
  };
}

function isJoiningRoom(joinCode) {
  return state.joiningRoomCodes.has(normalizedJoinCode(joinCode));
}

function roomSummaryIsLive(room = {}) {
  return Boolean(room.isLive || Number(room.started || 0) > 0);
}

function setRoomJoinButtonState(button, room) {
  const locked = roomJoinDisabled(room);
  const joining = isJoiningRoom(room?.joinCode);
  button.disabled = locked || joining;
  button.classList.toggle("is-loading", joining);
  button.setAttribute("aria-busy", joining ? "true" : "false");
  if (joining) {
    globalThis.XjkSafeHtml.set(button, `<span class="button-spinner" aria-hidden="true"></span><span>Joining</span>`);
    return;
  }
  button.textContent = locked ? "Locked" : "Join";
}

function setLeaveButtonState() {
  if (!els.leaveMatchButton) return;
  els.leaveMatchButton.disabled = state.leavingMatch;
  els.leaveMatchButton.classList.toggle("is-loading", state.leavingMatch);
  els.leaveMatchButton.setAttribute("aria-busy", state.leavingMatch ? "true" : "false");
  if (state.leavingMatch) {
    globalThis.XjkSafeHtml.set(
      els.leaveMatchButton,
      `<span class="button-spinner" aria-hidden="true"></span><span>Leaving</span>`
    );
    return;
  }
  els.leaveMatchButton.textContent = "Leave";
}

function setRegenerateRoomButtonState() {
  if (!els.regenerateRoomButton) return;
  const hasStartedBoard = Boolean(
    state.activeMatch?.matchUid &&
      Array.isArray(state.activeMatch?.matchState?.cells) &&
      state.activeMatch.matchState.cells.length
  );
  const regenerating = Boolean(state.regeneratingRoom);
  els.regenerateRoomButton.disabled = !hasStartedBoard || regenerating;
  els.regenerateRoomButton.classList.toggle("is-loading", regenerating);
  els.regenerateRoomButton.setAttribute("aria-busy", regenerating ? "true" : "false");
  if (regenerating) {
    globalThis.XjkSafeHtml.set(
      els.regenerateRoomButton,
      `<span class="button-spinner" aria-hidden="true"></span><span>Regenerating</span>`
    );
    return;
  }
  els.regenerateRoomButton.textContent = state.activeMatch?.roomBinding ? "Regenerate Room" : "Create Room";
}

function setManualCheckButtonState() {
  const canCheck = Boolean(
    state.activeMatch?.matchUid &&
      state.activeMatch?.roomBinding?.selectedMapUid &&
      Array.isArray(state.activeMatch?.matchState?.cells) &&
      state.activeMatch.matchState.cells.length
  );
  const checking = Boolean(state.checkingCurrentMap);
  const selectedMap = typeof getSelectedMap === "function" ? getSelectedMap() : null;
  const canModalCheck = canCheck && Boolean(selectedMap) && selectedMap.type === "TMX";
  const label = checking
    ? `<span class="button-spinner" aria-hidden="true"></span><span>Checking record</span>`
    : "I set a new record";
  for (const button of [els.manualRecordButton, els.checkMapButton]) {
    if (!button) continue;
    const enabled = button === els.checkMapButton ? canModalCheck : canCheck;
    button.disabled = !enabled || checking;
    button.classList.toggle("is-loading", checking);
    button.setAttribute("aria-busy", checking ? "true" : "false");
    if (button === els.manualRecordButton) {
      globalThis.XjkSafeHtml.set(button, label);
    } else {
      globalThis.XjkSafeHtml.set(
        button,
        checking ? `<span class="button-spinner" aria-hidden="true"></span><span>Checking</span>` : "Check Now"
      );
    }
  }
  if (els.manualRecordStatus) {
    if (!state.activeMatch) {
      els.manualRecordStatus.textContent = "Join a room first.";
    } else if (!canCheck) {
      els.manualRecordStatus.textContent = "Pick a playable room map first.";
    } else if (checking) {
      els.manualRecordStatus.textContent = "Checking Nadeo and updating Bingo if needed...";
    } else {
      els.manualRecordStatus.textContent = "Auto-checks once a minute. Manual limit: 10/min.";
    }
  }
}

function renderJoinSurfaces() {
  renderRooms();
  if (state.currentLookupRoom) {
    renderLookupResult(state.currentLookupRoom, "");
  }
}

function renderRooms() {
  els.publicRooms.replaceChildren();
  if (!state.rooms.length) {
    globalThis.XjkSafeHtml.set(els.publicRooms, `<p class="panel__intro">No public rooms right now.</p>`);
    return;
  }

  for (const room of state.rooms) {
    const fragment = els.roomCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".room-card");
    const eyebrow = fragment.querySelector(".room-card__eyebrow");
    const title = fragment.querySelector("h3");
    const phase = fragment.querySelector(".room-card__phase");
    const stats = fragment.querySelector(".room-card__stats");
    const detail = fragment.querySelector(".room-card__detail");
    const action = fragment.querySelector(".room-card__action");

    eyebrow.textContent = room.joinCode || "Room";
    title.textContent = room.name;
    const isLive = roomSummaryIsLive(room);
    phase.textContent = isLive ? (room.lateJoin ? "Live" : "Locked") : "Pregame";
    globalThis.XjkSafeHtml.set(
      stats,
      [
        ["Players", `${room.playerCount}`],
        ["Grid", room.gridSize ? `${room.gridSize}x${room.gridSize}` : "-"],
        ["Mode", mapModeName(room.selection)],
        ["Target", medalName(room.targetMedal)],
      ]
        .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join("")
    );
    detail.textContent = room.hostName
      ? isLive && !room.lateJoin
        ? `${room.hostName} • late join off`
        : `${room.hostName}`
      : isLive && !room.lateJoin
        ? "Late join off"
        : "";
    setRoomJoinButtonState(action, room);
    action.addEventListener("click", () => joinMatch(room.joinCode));
    card.dataset.joinCode = room.joinCode;
    els.publicRooms.appendChild(fragment);
  }
}

function renderLookupResult(room, error = "") {
  els.privateLookupResult.replaceChildren();
  if (error) {
    globalThis.XjkSafeHtml.set(els.privateLookupResult, `<p class="state-bad">${escapeHtml(error)}</p>`);
    return;
  }
  if (!room) return;

  const fragment = els.roomCardTemplate.content.cloneNode(true);
  fragment.querySelector(".room-card__eyebrow").textContent = room.joinCode || "Private room";
  fragment.querySelector("h3").textContent = room.name;
  const isLive = roomSummaryIsLive(room);
  fragment.querySelector(".room-card__phase").textContent = isLive ? "Live" : "Pregame";
  globalThis.XjkSafeHtml.set(
    fragment.querySelector(".room-card__stats"),
    [
      ["Players", `${room.playerCount}`],
      ["Grid", room.gridSize ? `${room.gridSize}x${room.gridSize}` : "-"],
      ["Mode", mapModeName(room.selection)],
      ["Target", medalName(room.targetMedal)],
    ]
      .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
      .join("")
  );
  fragment.querySelector(".room-card__detail").textContent = isLive ? "Ready to join." : "Join the lobby.";
  const action = fragment.querySelector(".room-card__action");
  setRoomJoinButtonState(action, room);
  action.addEventListener("click", () => joinMatch(room.joinCode));
  els.privateLookupResult.appendChild(fragment);
}

export {
  renderJoinSurfaces,
  renderLookupResult,
  renderRooms,
  renderSession,
  setLeaveButtonState,
  setManualCheckButtonState,
  setRegenerateRoomButtonState,
};
