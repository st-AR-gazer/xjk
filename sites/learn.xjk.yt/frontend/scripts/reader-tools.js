import "../../../shared/xjk-core/safe-html.js?v=2";
import { createReaderToolsController } from "./reader-tools/controller.js";
import { renderReaderTools as renderReaderToolsMarkup } from "./reader-tools/panel-registry.js";

export function renderReaderTools(options = {}) {
  return renderReaderToolsMarkup(options);
}

export function hydrateReaderTools(options = {}) {
  return createReaderToolsController(options);
}
