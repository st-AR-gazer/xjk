/* Independent shared sidenav bootstrap. Page/site behavior is declarative in
   chrome-config.js; this file only resolves context and mounts the renderer. */

import { getChromeConfig } from "./chrome-config.js";
import { mountChromeVisibility } from "./chrome-visibility.js?v=2";
import { mountSidenav } from "./sidenav.js?v=2";

if (globalThis.self === globalThis.top) {
  const tag = document.querySelector("script[data-xjk-sidenav]");
  const config = getChromeConfig({
    document,
    site: tag?.dataset.xjkSidenav,
    page: tag?.dataset.xjkPage,
  });

  mountChromeVisibility({ document, config });
  mountSidenav({
    site: config.siteId,
    accent: config.accent,
    ...config.sidenav,
  });
}
