import { fetchJson } from "/shared/xjk-core/http.js";
import {
  applySiteDataLinks,
  byId,
  clearLegacyAdminTokenArtifacts,
  createTrackerRouteResolver,
  formatDurationMs,
  formatRelativeTime,
  mapMatchesQuery,
  readFeedEntry,
  renderTrackerEngine,
} from "/shared/xjk-core/tracker-runtime.js";
import { createTrackerCommands } from "./public-app/commands-events.js";
import { createTrackerBrowserConfig } from "./public-app/config.js";
import { createTrackerController } from "./public-app/controller.js";
import { createTrackerLiveStream } from "./public-app/live-stream.js";
import { collectTrackerElements, createTrackerState, createTrackerView } from "./public-app/state-rendering.js";
import { createTrackerTransport } from "./public-app/transport.js";

clearLegacyAdminTokenArtifacts();

const config = createTrackerBrowserConfig({
  configuredMode: globalThis.XjkTrackerConfig?.mode,
  createRouteResolver: createTrackerRouteResolver,
  location: window.location,
});
const state = createTrackerState(config);
const elements = collectTrackerElements(byId);
const view = createTrackerView({
  config,
  documentRef: document,
  elements,
  eventSourceAvailable: Boolean(window.EventSource),
  formatDurationMs,
  formatRelativeTime,
  historyRef: history,
  mapMatchesQuery,
  readFeedEntry,
  renderTrackerEngine,
  requestFrame: window.requestAnimationFrame.bind(window),
  state,
});
const transport = createTrackerTransport({ config, fetchJson, state });
const controller = createTrackerController({
  applySiteDataLinks,
  config,
  documentRef: document,
  state,
  transport,
  view,
  windowRef: window,
});
const commands = createTrackerCommands({
  documentRef: document,
  refreshData: controller.refreshData,
  state,
  transport,
  view,
});
const liveStream = createTrackerLiveStream({
  config,
  refreshData: controller.refreshData,
  state,
  transport,
  view,
  windowRef: window,
});

void controller.boot({ commands, liveStream });
