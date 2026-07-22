import { copyText } from "../utils.js";
import { createDrawerController } from "./drawer-controller.js";
import { createFindController } from "./find-controller.js";
import { createNavigationController } from "./navigation-controller.js";
import { createNotesController } from "./notes-controller.js";
import { createReaderPanelRegistry } from "./panel-registry.js";
import { createProgressController } from "./progress-controller.js";
import { createSuggestionController } from "./suggestion-controller.js";

function createBrowserDependencies() {
  return {
    copyText,
    document: globalThis.document,
    navigator: globalThis.navigator,
    nodeFilter: globalThis.NodeFilter,
    requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
    setHtml: (element, html) => globalThis.XjkSafeHtml.set(element, html),
    window: globalThis.window,
  };
}

function createReaderToolsController(
  { root, page = {}, ast = [], store = null, showToast, route, state = {}, onSaveNote, onSubmitSuggestion } = {},
  injectedDependencies = {}
) {
  const dependencies = { ...createBrowserDependencies(), ...injectedDependencies };
  const panel = root?.querySelector?.(".learn-lesson-panel");
  if (!panel) return () => {};

  const drawer = panel.querySelector("[data-reader-drawer]");
  const progress = panel.querySelector("[data-reader-progress]");
  const status = panel.querySelector("[data-reader-status]");
  const getDrawer = () => drawer;
  const toast = (message) => {
    if (typeof showToast === "function") showToast(message);
    if (status) status.textContent = message;
  };

  const findController = createFindController({
    panel,
    getDrawer,
    documentRef: dependencies.document,
    nodeFilter: dependencies.nodeFilter,
  });
  const registry = createReaderPanelRegistry({ page, ast, store, state });
  const drawerController = createDrawerController({
    drawer,
    findController,
    page,
    registry,
    store,
    setHtml: dependencies.setHtml,
  });
  const navigationController = createNavigationController({
    panel,
    page,
    toast,
    windowRef: dependencies.window,
    navigatorRef: dependencies.navigator,
    copyTextImpl: dependencies.copyText,
    getPinsImpl: dependencies.getPins,
    savePinImpl: dependencies.savePin,
    now: dependencies.now,
  });
  const notesController = createNotesController({ getDrawer, page, state, toast, onSaveNote });
  const suggestionController = createSuggestionController({
    getDrawer,
    navigationController,
    page,
    state,
    toast,
    onSubmitSuggestion,
  });
  const progressController = createProgressController({ panel, progress });

  const readerActions = {
    "pin-section": () => navigationController.pinCurrentSection(),
    "go-pin": () => navigationController.goToPin(),
    "copy-section-link": () => navigationController.copySectionLink(),
    share: () => navigationController.shareLesson(),
    "copy-section": () => navigationController.copyCurrentSection(),
    "copy-embed": (action) =>
      dependencies.copyText(action.dataset.embedSyntax || "").then(() => toast("Embed syntax copied")),
    "save-note": () => notesController.save(),
    "submit-suggestion": () => suggestionController.submit(),
  };

  function handleClick(event) {
    const close = event.target.closest("[data-reader-close]");
    if (close) {
      drawerController.close();
      return;
    }

    const panelButton = event.target.closest("[data-reader-panel-trigger]");
    if (panelButton) {
      drawerController.open(panelButton.dataset.readerPanelTrigger);
      return;
    }

    const action = event.target.closest("[data-reader-action]");
    if (action) {
      readerActions[action.dataset.readerAction]?.(action);
      return;
    }

    const jump = event.target.closest("[data-reader-jump]");
    if (jump) {
      navigationController.jumpTo(jump.dataset.readerJump);
      return;
    }

    const findButton = event.target.closest("[data-reader-find-action]");
    if (findButton) {
      findController.move(findButton.dataset.readerFindAction === "next" ? 1 : -1);
    }
  }

  function handleInput(event) {
    const input = event.target.closest("[data-reader-find-input]");
    if (input) findController.run(input.value);
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && drawerController.isOpen()) drawerController.close();
  }

  panel.addEventListener("click", handleClick);
  panel.addEventListener("input", handleInput);
  panel.addEventListener("keydown", handleKeydown);
  panel.addEventListener("scroll", progressController.update, { passive: true });
  progressController.update();

  const section = route?.query?.get("section");
  if (section) dependencies.requestAnimationFrame(() => navigationController.jumpTo(section));

  return () => {
    drawerController.destroy();
    findController.clear();
    panel.removeEventListener("click", handleClick);
    panel.removeEventListener("input", handleInput);
    panel.removeEventListener("keydown", handleKeydown);
    panel.removeEventListener("scroll", progressController.update);
  };
}

export { createReaderToolsController };
