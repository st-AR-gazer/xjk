import { buildKnowledgeMapLayout } from "./knowledge-map-layout.js";
import { createKnowledgeMapController } from "./knowledge-map/controller.js";

export { clusterColor } from "./knowledge-map/palette.js";

function layoutKnowledgeMap(manifest, { width, height }) {
  return buildKnowledgeMapLayout(manifest, { width, height });
}

export function createKnowledgeMap(canvas, options = {}) {
  return createKnowledgeMapController(canvas, options, { buildLayout: layoutKnowledgeMap });
}
