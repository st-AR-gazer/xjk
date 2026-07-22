import { resolveSiteHref } from "../xjk-core/site-runtime.js";

export function resolveXjkHomeHref() {
  return resolveSiteHref("xjk");
}

export function applyXjkHomeHref(link) {
  if (!link) {
    return null;
  }

  link.href = resolveXjkHomeHref();
  return link;
}

export function createWorkspaceSidebar({
  buttons,
  panels,
  defaultTarget = "record",
  activeClass = "is-active",
  onChange,
} = {}) {
  const buttonList = Array.from(buttons || []);
  const panelList = Array.from(panels || []);
  let activeTarget = defaultTarget;

  function activate(nextTarget) {
    const safeTarget =
      buttonList.find((button) => button.dataset.workspaceTarget === nextTarget)?.dataset.workspaceTarget ||
      defaultTarget;

    activeTarget = safeTarget;

    buttonList.forEach((button) => {
      const isActive = button.dataset.workspaceTarget === safeTarget;
      button.classList.toggle(activeClass, isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    panelList.forEach((panel) => {
      panel.classList.toggle(activeClass, panel.dataset.workspacePanel === safeTarget);
    });

    if (typeof onChange === "function") {
      onChange(safeTarget);
    }

    return safeTarget;
  }

  buttonList.forEach((button) => {
    button.addEventListener("click", () => {
      activate(button.dataset.workspaceTarget || defaultTarget);
    });
  });

  activate(defaultTarget);

  return {
    activate,
    getActive() {
      return activeTarget;
    },
  };
}
