import { openNotification } from "./actions.js?v=2";
import { BINGO_RUN_NOTIFICATION_DURATION_MS, MAP_SWITCH_STEPS, els, state } from "./core.js?v=2";
import {
  activeMatchConfig,
  activeRoomConfig,
  activeRoomSummary,
  activeTargetMedal,
  boolText,
  currentUserIsRoomHost,
  escapeHtml,
  formatTime,
  matchPhaseLabel,
  teamColorForId,
  teamStyleAttribute,
  teamVisualFromTeam,
} from "./domain.js?v=2";

function mapSwitchStepIndex(stepKey) {
  return Math.max(
    0,
    MAP_SWITCH_STEPS.findIndex((step) => step.key === stepKey)
  );
}

function currentMapSwitchStep() {
  return MAP_SWITCH_STEPS[mapSwitchStepIndex(state.mapSwitchProgress.step)] || MAP_SWITCH_STEPS[0];
}

function clearMapSwitchFallbackTimers() {
  for (const timer of state.mapSwitchFallbackTimers) {
    window.clearTimeout(timer);
  }
  state.mapSwitchFallbackTimers = [];
}

function renderMapSwitchProgress() {
  if (!els.mapSwitchOverlay) return;
  const progress = state.mapSwitchProgress;
  els.mapSwitchOverlay.classList.toggle("hidden", !progress.visible);
  if (!progress.visible) return;

  const currentStep = currentMapSwitchStep();
  const currentIndex = mapSwitchStepIndex(currentStep.key);
  const isDone = progress.state === "done";
  const isFailed = progress.state === "failed";

  els.mapSwitchOverlay.classList.toggle("is-done", isDone);
  els.mapSwitchOverlay.classList.toggle("is-failed", isFailed);
  if (els.mapSwitchTitle) {
    els.mapSwitchTitle.textContent = isFailed ? "Map couldn't be updated" : isDone ? "Moved to map" : currentStep.title;
  }
  if (els.mapSwitchBody) {
    els.mapSwitchBody.textContent = progress.detail || currentStep.detail;
  }
  if (els.mapSwitchSteps) {
    globalThis.XjkSafeHtml.set(
      els.mapSwitchSteps,
      MAP_SWITCH_STEPS.map((step, index) => {
        const classes = ["map-switch-step"];
        if (isFailed && index === currentIndex) {
          classes.push("is-failed");
        } else if (isDone || index < currentIndex) {
          classes.push("is-complete");
        } else if (index === currentIndex) {
          classes.push("is-active");
        } else {
          classes.push("is-pending");
        }
        return (
          `<li class="${classes.join(" ")}">` +
          `<span class="map-switch-step__icon" aria-hidden="true"></span>` +
          `<span class="map-switch-step__copy">` +
          `<strong>${escapeHtml(step.title)}</strong>` +
          `<small>${escapeHtml(step.detail)}</small>` +
          `</span>` +
          `</li>`
        );
      }).join("")
    );
  }
  els.mapSwitchCloseButton?.classList.toggle("hidden", !isDone && !isFailed);
}

function updateMapSwitchProgress({ step = "finding-map", state: progressState = "running", detail = "" } = {}) {
  state.mapSwitchProgress = {
    visible: true,
    step: MAP_SWITCH_STEPS.some((entry) => entry.key === step) ? step : "finding-map",
    state: progressState,
    detail,
  };
  if (progressState === "done" || progressState === "failed") {
    clearMapSwitchFallbackTimers();
  }
  renderMapSwitchProgress();
}

function startMapSwitchFallbackTimers() {
  clearMapSwitchFallbackTimers();
  const fallback = [
    ["requesting-nadeo", 900],
    ["sending-map", 2100],
  ];
  state.mapSwitchFallbackTimers = fallback.map(([step, delay]) =>
    window.setTimeout(() => {
      if (!state.mapSwitchProgress.visible || state.mapSwitchProgress.state !== "running") return;
      if (mapSwitchStepIndex(state.mapSwitchProgress.step) >= mapSwitchStepIndex(step)) return;
      updateMapSwitchProgress({ step });
    }, delay)
  );
}

function startMapSwitchProgress() {
  updateMapSwitchProgress({ step: "finding-map", state: "running" });
  startMapSwitchFallbackTimers();
}

function finishMapSwitchProgress(detail = "Your generated console room has been updated with this map.") {
  updateMapSwitchProgress({
    step: "sending-map",
    state: "done",
    detail,
  });
}

function failMapSwitchProgress(detail = "The bridge could not update your console room.") {
  updateMapSwitchProgress({
    step: state.mapSwitchProgress.step || "finding-map",
    state: "failed",
    detail,
  });
}

function hideMapSwitchProgress() {
  clearMapSwitchFallbackTimers();
  state.mapSwitchProgress = {
    visible: false,
    step: "finding-map",
    state: "idle",
    detail: "",
  };
  renderMapSwitchProgress();
}

function bingoNotificationId(notification) {
  const explicit = String(notification?.id || "").trim();
  if (explicit) return explicit;
  return [
    "run",
    notification?.cellId ?? "cell",
    notification?.teamId ?? "team",
    notification?.time ?? Date.now(),
    Math.random().toString(16).slice(2),
  ].join(":");
}

function bingoNotificationTeamVisual(notification) {
  const teamId = Number(notification?.teamId ?? -1);
  const currentVisual = teamColorForId(teamId);
  if (currentVisual) return currentVisual;
  const color = Array.isArray(notification?.teamColor) ? notification.teamColor : undefined;
  return teamVisualFromTeam(
    {
      base: {
        id: teamId,
        name: notification?.teamName || "Team",
        color,
      },
    },
    0
  );
}

function bingoNotificationToneLabel(variant) {
  if (variant === "improve") return "Time";
  if (variant === "reclaim") return "Retake";
  return "Claim";
}

function bingoNotificationVariant(variant) {
  return ["claim", "improve", "reclaim"].includes(variant) ? variant : "claim";
}

function possessiveTeamName(teamName) {
  const value = String(teamName || "team").trim();
  return value.endsWith("s") ? `${value}'` : `${value}'s`;
}

function bingoNotificationBody(notification) {
  const playerName = notification?.playerName || "A player";
  const mapName = notification?.mapName || "a map";
  const teamName = notification?.teamName || "their team";
  if (notification?.variant === "reclaim") {
    return `${playerName} reclaimed ${mapName} for ${teamName}.`;
  }
  if (notification?.variant === "improve") {
    return `${playerName} improved ${possessiveTeamName(teamName)} time on ${mapName}.`;
  }
  return `${playerName} claimed ${mapName} for ${teamName}.`;
}

function bingoNotificationRecordLine(notification) {
  if (notification?.showRecordDetails === false) return "";
  const time = formatTime(notification?.time);
  if (time === "-") return "";
  const delta = Number(notification?.deltaMs);
  if (notification?.variant !== "claim" && Number.isFinite(delta)) {
    return `${time} (-${formatTime(delta)})`;
  }
  return time;
}

function dismissBingoNotification(notificationId) {
  const id = String(notificationId || "");
  const timer = state.bingoNotificationTimers.get(id);
  if (timer) window.clearTimeout(timer);
  state.bingoNotificationTimers.delete(id);
  state.bingoNotifications = state.bingoNotifications.filter((entry) => entry.id !== id);
  renderBingoNotifications();
}

function handleBingoNotificationOpen(notificationId) {
  const notification = state.bingoNotifications.find((entry) => entry.id === notificationId);
  if (notification) openNotification(notification);
}

function renderBingoNotifications() {
  if (!els.bingoNotifications) return;
  globalThis.XjkSafeHtml.set(
    els.bingoNotifications,
    state.bingoNotifications
      .map((notification) => {
        const visual = bingoNotificationTeamVisual(notification);
        const variant = bingoNotificationVariant(notification.variant);
        const recordLine = bingoNotificationRecordLine(notification);
        const tileLabel = Number.isFinite(Number(notification.cellId))
          ? `Tile ${Number(notification.cellId) + 1}`
          : "Bingo tile";
        return (
          `<article class="bingo-notification is-${variant}" ` +
          `data-notification-id="${escapeHtml(notification.id)}" role="button" tabindex="0" ` +
          `style="${teamStyleAttribute(visual)}">` +
          `<span class="bingo-notification__icon" aria-hidden="true">${escapeHtml(bingoNotificationToneLabel(notification.variant))}</span>` +
          `<div class="bingo-notification__copy">` +
          `<p>${escapeHtml(notification.title || "Map Claimed")}</p>` +
          `<strong>${escapeHtml(bingoNotificationBody(notification))}</strong>` +
          `<small>${escapeHtml([tileLabel, recordLine].filter(Boolean).join(" - "))}</small>` +
          `</div>` +
          `<button class="bingo-notification__close" type="button" aria-label="Dismiss notification">&times;</button>` +
          `</article>`
        );
      })
      .join("")
  );

  for (const card of els.bingoNotifications.querySelectorAll(".bingo-notification")) {
    const notificationId = card.getAttribute("data-notification-id") || "";
    const closeButton = card.querySelector(".bingo-notification__close");
    closeButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      dismissBingoNotification(notificationId);
    });
    card.addEventListener("click", () => handleBingoNotificationOpen(notificationId));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleBingoNotificationOpen(notificationId);
      }
    });
  }
}

function showBingoNotification(notification) {
  if (!notification || notification.event !== "RunSubmitted") return;
  const id = bingoNotificationId(notification);
  const existingTimer = state.bingoNotificationTimers.get(id);
  if (existingTimer) window.clearTimeout(existingTimer);
  const entry = {
    ...notification,
    id,
    createdAt: Number(notification.createdAt || Date.now()),
  };
  state.bingoNotifications = [entry, ...state.bingoNotifications.filter((item) => item.id !== id)].slice(0, 4);
  const timer = window.setTimeout(() => {
    dismissBingoNotification(id);
  }, BINGO_RUN_NOTIFICATION_DURATION_MS);
  state.bingoNotificationTimers.set(id, timer);
  renderBingoNotifications();
}

function renderTabState() {
  const hasMatch = Boolean(state.activeMatch);
  const hasBoard = Boolean(state.activeMatch?.matchState?.cells?.length);
  const activeTab = hasMatch ? (state.activeTab === "room" && !hasBoard ? "lobby" : state.activeTab) : "games";
  state.activeTab = activeTab;

  const tabs = [
    { key: "games", button: els.tabGamesButton, panel: els.gamesPanel, disabled: false },
    { key: "lobby", button: els.tabLobbyButton, panel: els.lobbyPanel, disabled: !hasMatch },
    { key: "room", button: els.tabRoomButton, panel: els.roomPanel, disabled: !hasBoard },
  ];

  for (const tab of tabs) {
    const isActive = tab.key === activeTab;
    tab.button.disabled = tab.disabled;
    tab.button.classList.toggle("is-active", isActive);
    tab.button.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.panel.classList.toggle("hidden", !isActive);
  }
}

function renderLobbySubtabs() {
  const joinActive = state.lobbySubtab !== "players";
  els.lobbyJoinTabButton?.classList.toggle("is-active", joinActive);
  els.lobbyJoinTabButton?.setAttribute("aria-selected", joinActive ? "true" : "false");
  els.lobbyPlayersTabButton?.classList.toggle("is-active", !joinActive);
  els.lobbyPlayersTabButton?.setAttribute("aria-selected", joinActive ? "false" : "true");
  els.lobbyJoinPanel?.classList.toggle("hidden", !joinActive);
  els.lobbyPlayersPanel?.classList.toggle("hidden", joinActive);
}

function roomSettingField({ label, value = "", hint = "", wide = false }) {
  return (
    `<label class="room-setting is-disabled${wide ? " room-setting--wide" : ""}">` +
    `<span class="room-setting__label">${escapeHtml(label)}</span>` +
    `<input type="text" value="${escapeHtml(value || "-")}" disabled>` +
    (hint ? `<span class="room-setting__hint">${escapeHtml(hint)}</span>` : "") +
    `</label>`
  );
}

function roomSettingCheckbox({ label, checked = false, hint = "", wide = false }) {
  return (
    `<label class="room-setting is-disabled${wide ? " room-setting--wide" : ""}">` +
    `<span class="room-setting__control">` +
    `<span>` +
    `<span class="room-setting__label">${escapeHtml(label)}</span>` +
    (hint ? `<span class="room-setting__hint">${escapeHtml(hint)}</span>` : "") +
    `</span>` +
    `<input type="checkbox" ${checked ? "checked" : ""} disabled>` +
    `</span>` +
    `</label>`
  );
}

function roomSettingSelect({ label, value = "", options = [], hint = "", wide = false }) {
  const safeValue = String(value ?? "");
  return (
    `<label class="room-setting is-disabled${wide ? " room-setting--wide" : ""}">` +
    `<span class="room-setting__label">${escapeHtml(label)}</span>` +
    `<select disabled>` +
    options
      .map(([optionValue, optionLabel]) => {
        const selected = String(optionValue) === safeValue ? " selected" : "";
        return `<option value="${escapeHtml(optionValue)}"${selected}>${escapeHtml(optionLabel)}</option>`;
      })
      .join("") +
    `</select>` +
    (hint ? `<span class="room-setting__hint">${escapeHtml(hint)}</span>` : "") +
    `</label>`
  );
}

function renderRoomSettings() {
  const match = state.activeMatch;
  els.roomSettingsButton?.classList.toggle("hidden", !match);
  if (!match) {
    els.roomSettingsGrid && els.roomSettingsGrid.replaceChildren();
    return;
  }

  const room = activeRoomSummary(match);
  const roomConfig = activeRoomConfig(match);
  const matchConfig = activeMatchConfig(match);
  const targetMedal = activeTargetMedal(match);
  const isHost = currentUserIsRoomHost(match);
  const canChooseTeam = Boolean(match.teamChoiceAllowed ?? (!room.hostControl && !room.randomize));
  const clubPath = Array.isArray(match.roomBinding?.clubPath) ? match.roomBinding.clubPath : [];

  if (els.roomSettingsTitle) {
    els.roomSettingsTitle.textContent = room.name || `Match ${match.matchUid || ""}`.trim() || "Current room";
  }
  if (els.roomSettingsHostNote) {
    els.roomSettingsHostNote.textContent = isHost ? "Host view" : "Read-only";
    els.roomSettingsHostNote.classList.toggle("is-host", isHost);
  }
  if (!els.roomSettingsGrid) return;

  globalThis.XjkSafeHtml.set(
    els.roomSettingsGrid,
    [
      roomSettingField({ label: "Room name", value: room.name || roomConfig.name || "Bingo Room" }),
      roomSettingField({ label: "Join code", value: room.joinCode || "Private" }),
      roomSettingField({ label: "Host", value: room.hostName || "Unknown" }),
      roomSettingField({ label: "State", value: matchPhaseLabel(match) }),
      roomSettingField({ label: "Players", value: String(room.playerCount ?? 0) }),
      roomSettingSelect({
        label: "Map source",
        value: String(Number(matchConfig.selection ?? room.selection ?? 0)),
        options: [
          ["0", "Random Maps"],
          ["1", "Tags"],
          ["2", "Mappack"],
          ["3", "Campaign"],
        ],
      }),
      roomSettingField({
        label: "Grid size",
        value: Number(matchConfig.grid_size ?? room.gridSize ?? 0)
          ? `${Number(matchConfig.grid_size ?? room.gridSize)}x${Number(matchConfig.grid_size ?? room.gridSize)}`
          : "-",
      }),
      roomSettingSelect({
        label: "Target medal",
        value: String(targetMedal),
        options: [
          ["0", "World Record"],
          ["1", "Author"],
          ["2", "Gold"],
          ["3", "Silver"],
          ["4", "Bronze"],
          ["5", "None"],
        ],
        hint: "This controls which medal time the board treats as the target.",
      }),
      roomSettingCheckbox({
        label: "Public room",
        checked: Boolean(room.public ?? roomConfig.public),
        hint: boolText(Boolean(room.public ?? roomConfig.public)),
      }),
      roomSettingCheckbox({
        label: "Late join",
        checked: Boolean(matchConfig.late_join ?? room.lateJoin ?? true),
        hint: boolText(Boolean(matchConfig.late_join ?? room.lateJoin ?? true)),
      }),
      roomSettingCheckbox({
        label: "Randomized teams",
        checked: Boolean(room.randomize ?? roomConfig.randomize),
        hint: boolText(Boolean(room.randomize ?? roomConfig.randomize)),
      }),
      roomSettingCheckbox({
        label: "Host controls teams",
        checked: Boolean(room.hostControl ?? roomConfig.host_control),
        hint: canChooseTeam ? "Players can choose teams." : "Teams are assigned by the room.",
      }),
      roomSettingField({
        label: "Console room path",
        value: clubPath.length ? clubPath.join(" > ") : "Created after joining",
        wide: true,
      }),
      roomSettingField({
        label: "Editing",
        value: isHost ? "Host detected" : "Only the host can edit",
        hint: isHost
          ? "This panel is wired as a live settings viewer for now. Web editing can be added safely once the backend exposes a save endpoint."
          : "You can view the room settings, but changing them belongs to the host.",
        wide: true,
      }),
    ].join("")
  );
}

function openRoomSettings() {
  renderRoomSettings();
  els.roomSettingsModal?.classList.remove("hidden");
}

function closeRoomSettings() {
  els.roomSettingsModal?.classList.add("hidden");
}

export {
  closeRoomSettings,
  failMapSwitchProgress,
  finishMapSwitchProgress,
  hideMapSwitchProgress,
  openRoomSettings,
  renderLobbySubtabs,
  renderRoomSettings,
  renderTabState,
  showBingoNotification,
  startMapSwitchProgress,
  updateMapSwitchProgress,
};
