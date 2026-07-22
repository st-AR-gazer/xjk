import { readJson, writeJson } from "../utils.js";

const PIN_KEY = "xjk.learn.sectionPins";

function getPins() {
  return readJson(PIN_KEY, {});
}

function savePin(slug, pin) {
  const pins = getPins();
  pins[slug] = pin;
  writeJson(PIN_KEY, pins);
}

export { getPins, savePin };
