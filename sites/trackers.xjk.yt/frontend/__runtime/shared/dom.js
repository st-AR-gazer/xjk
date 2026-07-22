export function clearElement(element) {
  element.replaceChildren();
}

export function createElement(parent, tagName, options = {}) {
  const element = parent.ownerDocument.createElement(tagName);

  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.attributes) {
    Object.entries(options.attributes).forEach(([name, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(name, String(value));
    });
  }

  parent.appendChild(element);
  return element;
}

export function appendText(parent, value) {
  parent.appendChild(parent.ownerDocument.createTextNode(String(value)));
}
