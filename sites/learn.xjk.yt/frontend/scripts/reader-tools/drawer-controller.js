import { drawerHead } from "./panel-registry.js";

function createDrawerController({ drawer, findController, page, registry, store, setHtml } = {}) {
  let activePanel = "";
  let destroyed = false;

  function setDrawer(name, html) {
    if (!drawer) return;
    activePanel = name;
    drawer.hidden = false;
    drawer.dataset.readerPanel = name;
    setHtml(drawer, `${drawerHead(name)}${html}`);
    if (name === "find") drawer.querySelector("[data-reader-find-input]")?.focus();
  }

  function close() {
    activePanel = "";
    findController.clear();
    if (!drawer) return;
    drawer.hidden = true;
    drawer.replaceChildren();
  }

  function open(name) {
    if (activePanel === name) {
      close();
      return;
    }

    const html = registry.render(name);
    if (html !== undefined) setDrawer(name, html);
    if (name !== "source") return;

    store
      ?.loadMarkdown?.(page.slug)
      .then((markdown) => {
        if (!destroyed && activePanel === "source") setDrawer(name, registry.renderSource(markdown));
      })
      .catch((error) => {
        if (!destroyed && activePanel === "source") setDrawer(name, registry.renderSourceError(error));
      });
  }

  function destroy() {
    destroyed = true;
  }

  return {
    close,
    destroy,
    isOpen: () => Boolean(activePanel),
    open,
  };
}

export { createDrawerController };
