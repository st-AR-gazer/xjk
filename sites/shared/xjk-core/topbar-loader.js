import { getChromeConfig } from "./chrome-config.js";
import { mountChromeVisibility } from "./chrome-visibility.js?v=2";
import { loadAccountWidgetScript, loadGlobalSearch } from "./site-runtime.js";
import { mountTopbar } from "./topbar.js?v=2";

if (globalThis.self === globalThis.top) {
  const tag = document.querySelector("script[src*='/shared/xjk-core/topbar-loader.js']");
  const config = getChromeConfig({
    document,
    site: tag?.dataset.xjkTopbar,
    page: tag?.dataset.xjkPage,
  });
  mountChromeVisibility({ document, config });
  mountTopbar({ document, config });
  loadAccountWidgetScript();
  loadGlobalSearch();
}
