const handlers = {
  chooseTeam: unavailableAction("chooseTeam"),
  joinMatch: unavailableAction("joinMatch"),
  openNotification: unavailableAction("openNotification"),
  switchMapCell: unavailableAction("switchMapCell"),
};

function unavailableAction(name) {
  return () => {
    throw new Error(`Bingo action is not configured: ${name}`);
  };
}

function configureBingoActions(nextHandlers) {
  for (const name of Object.keys(handlers)) {
    if (typeof nextHandlers?.[name] !== "function") {
      throw new TypeError(`Bingo action must be a function: ${name}`);
    }
  }
  Object.assign(handlers, nextHandlers);
}

function chooseTeam(...args) {
  return handlers.chooseTeam(...args);
}

function joinMatch(...args) {
  return handlers.joinMatch(...args);
}

function openNotification(...args) {
  return handlers.openNotification(...args);
}

function switchMapCell(...args) {
  return handlers.switchMapCell(...args);
}

export { chooseTeam, configureBingoActions, joinMatch, openNotification, switchMapCell };
