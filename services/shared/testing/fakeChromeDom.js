class FakeEventElement {
  constructor(tagName = "div") {
    this.attributes = new Map();
    this.children = [];
    this.focusCalls = [];
    this.isConnected = false;
    this.listeners = new Map();
    this.style = {
      visibility: "",
      removeProperty: (name) => {
        delete this.style[name];
      },
      setProperty: (name, value) => {
        this.style[name] = value;
      },
    };
    this.tagName = String(tagName).toUpperCase();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentElement = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }

  contains(target) {
    for (let node = target; node; node = node.parentElement) {
      if (node === this) return true;
    }
    return false;
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus(options) {
    this.focusCalls.push(options);
  }

  getAttribute(name) {
    if (name === "href") return this.href || null;
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    const text = String(value);
    if (name === "href") this.href = text;
    else this.attributes.set(name, text);
  }
}

class AccountWidgetElement extends FakeEventElement {
  constructor({ slot = "" } = {}) {
    super();
    this.slot = slot;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.logoutButton = null;
    this.errorNode = null;
    if (this._innerHTML.includes("data-xjk-trigger")) {
      this.trigger = new AccountWidgetElement();
      this.trigger.parentElement = this;
      this.trigger.isConnected = true;
      this.trigger.setAttribute("aria-expanded", "false");
      this.panel = new AccountWidgetElement();
      this.panel.parentElement = this;
      this.panel.isConnected = true;
      this.panel.hidden = true;
    }
    if (this._innerHTML.includes('data-xjk-action="logout"')) {
      this.logoutButton = new AccountWidgetElement();
      this.logoutButton.parentElement = this;
      this.logoutButton.isConnected = true;
    }
    if (this._innerHTML.includes("data-xjk-account-error")) {
      this.errorNode = new AccountWidgetElement();
      this.errorNode.parentElement = this;
      this.errorNode.isConnected = true;
      this.errorNode.textContent = "";
    }
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  getAttribute(name) {
    if (name === "data-xjk-account-widget-slot") return this.slot;
    return super.getAttribute(name);
  }

  querySelector(selector) {
    if (selector === "[data-xjk-trigger]") return this.trigger || null;
    if (selector === ".xjk-account-widget__panel") return this.panel || null;
    if (selector === '[data-xjk-action="logout"]') return this.logoutButton || null;
    if (selector === "[data-xjk-account-error]") return this.errorNode || null;
    return null;
  }
}

class TopbarElement extends FakeEventElement {
  constructor(tagName) {
    super(tagName);
    this.classList = {
      values: new Set(),
      add: (...values) => values.forEach((value) => this.classList.values.add(value)),
      contains: (value) => this.classList.values.has(value),
    };
    this.dataset = {};
    if (this.tagName === "LINK") this.sheet = {};
  }

  get childNodes() {
    return this.children;
  }

  getAttribute(name) {
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return super.getAttribute(name);
  }

  matches(selector) {
    if (selector === "[data-xjk-site-link]") return this.dataset.xjkSiteLink !== undefined;
    if (selector === "[data-xjk-global-search-slot]") return this.dataset.xjkGlobalSearchSlot !== undefined;
    if (selector === "[data-xjk-topbar-actions-slot]") return this.dataset.xjkTopbarActionsSlot !== undefined;
    if (selector === '[data-xjk-account-widget-slot="topbar"]') {
      return this.dataset.xjkAccountWidgetSlot === "topbar";
    }
    if (selector === "[data-xjk-page-toolbar]") return this.dataset.xjkPageToolbar !== undefined;
    return false;
  }

  prepend(child) {
    child.parentElement = this;
    child.isConnected = true;
    this.children.unshift(child);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (node.matches?.(selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
}

function createTopbarDocument() {
  const head = new TopbarElement("head");
  const body = new TopbarElement("body");
  const documentElement = new TopbarElement("html");
  head.isConnected = true;
  body.isConnected = true;
  documentElement.isConnected = true;
  return {
    body,
    documentElement,
    head,
    createElement(tagName) {
      return new TopbarElement(tagName);
    },
    defaultView: {
      clearTimeout,
      getComputedStyle() {
        return {
          getPropertyValue() {
            return "59px";
          },
          position: "fixed",
        };
      },
      setTimeout,
    },
    querySelector(selector) {
      if (selector === "link[data-xjk-global-topbar-styles]") return head.querySelector(selector);
      return null;
    },
  };
}

export { AccountWidgetElement, TopbarElement, createTopbarDocument };
