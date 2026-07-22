import { splitRouteKey } from "./formatters.js?v=2";
import { setTextById, waitForNextPaint } from "../../../shared/xjk-core/dom-utils.js?v=2";

export { waitForNextPaint };

export function setStatus(text) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = text;
}

export const setText = setTextById;

export function stampStatus(prefix = "Updated") {
  setStatus(String(prefix) + " " + new Date().toLocaleTimeString());
}

export function clearElement(element) {
  element?.replaceChildren();
}

export function appendTextCell(row, value, { className = "", title = "", colSpan = 0 } = {}) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (title) cell.title = String(title);
  if (colSpan > 0) cell.colSpan = colSpan;
  cell.textContent = String(value ?? "");
  row.appendChild(cell);
  return cell;
}

export function appendTableMessage(body, message, colSpan, className = "muted") {
  const row = document.createElement("tr");
  appendTextCell(row, message, { className, colSpan });
  body.replaceChildren(row);
}

export function appendRouteKey(cell, key, { prefix = "" } = {}) {
  const parsed = splitRouteKey(key);
  [prefix, parsed.host].filter(Boolean).forEach((host) => {
    const hostElement = document.createElement("span");
    hostElement.className = "cell-key-host";
    hostElement.textContent = String(host);
    cell.appendChild(hostElement);
  });

  const pathElement = document.createElement("span");
  pathElement.className = "cell-key-path";
  pathElement.textContent = parsed.path;
  cell.appendChild(pathElement);
  return cell;
}

export function appendOption(select, value, label, selected = false) {
  const option = document.createElement("option");
  option.value = String(value ?? "");
  option.textContent = String(label ?? "");
  option.selected = Boolean(selected);
  select.appendChild(option);
  return option;
}

export function createSvgElement(tagName, attributes = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  });
  if (text !== "") element.textContent = String(text);
  return element;
}
