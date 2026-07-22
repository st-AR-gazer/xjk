import { safeNavigationHref } from "../../../../shared/xjk-core/dom-utils.js?v=2";

export function createElement(tagName, { className = "", text, title = "", attributes = {}, dataset = {} } = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text ?? "");
  if (title) element.title = String(title);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value === false || value === undefined || value === null) return;
    element.setAttribute(name, value === true ? "" : String(value));
  });
  Object.entries(dataset).forEach(([name, value]) => {
    if (value !== undefined && value !== null) element.dataset[name] = String(value);
  });
  return element;
}

export function appendElement(parent, tagName, options = {}) {
  const element = createElement(tagName, options);
  parent.appendChild(element);
  return element;
}

export function clearElement(element) {
  element?.replaceChildren();
}

export function safeImageUrl(value) {
  return safeNavigationHref(value, {
    base: globalThis.location?.href || "http://localhost/",
    fallback: "",
  });
}
