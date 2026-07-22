import { bindOverviewElements, setCardStatus, setOverviewStatus } from "./overview-view.js?v=2";
import {
  OVERVIEW_REFRESH_MS,
  fetchRuntimeStatuses,
  formatRuntimeOverview,
  summarizeReachability,
} from "./service-status.js?v=2";

function createOverviewController({
  root,
  context,
  fetchJsonImpl,
  setIntervalImpl,
  clearIntervalImpl,
  refreshMs = OVERVIEW_REFRESH_MS,
}) {
  const elements = bindOverviewElements(root);
  let disposed = false;
  let timerId = 0;

  async function refresh() {
    const statuses = await fetchRuntimeStatuses(context.basePrefix, fetchJsonImpl);
    if (disposed) return;

    let reachable = 0;
    statuses.forEach(({ key, result }) => {
      if (result.status === "fulfilled") {
        reachable += 1;
        const formatted = formatRuntimeOverview(key, result.value);
        setCardStatus(elements.cards[key], formatted.label, formatted.meta, formatted.tone);
      } else {
        setCardStatus(elements.cards[key], "Offline", "Could not reach this runtime right now.", "bad");
      }
    });

    const summary = summarizeReachability(reachable, statuses.length);
    setOverviewStatus(elements.stats.active, summary.active.state, summary.active.copy, summary.active.tone);
    setOverviewStatus(elements.stats.health, summary.health.state, summary.health.copy, summary.health.tone);
    setOverviewStatus(elements.stats.network, summary.network.state, summary.network.copy, summary.network.tone);
  }

  function showInitialFailure() {
    if (disposed) return;
    setOverviewStatus(elements.stats.active, "0", "Unable to load tracker runtime status.", "bad");
    setOverviewStatus(elements.stats.health, "Offline", "Tracker services did not respond.", "bad");
    setOverviewStatus(elements.stats.network, "0/4", "Shared runtime network is unavailable.", "bad");
    Object.values(elements.cards).forEach((card) => {
      setCardStatus(card, "Offline", "Could not reach this runtime right now.", "bad");
    });
  }

  function start() {
    refresh().catch(showInitialFailure);
    timerId = setIntervalImpl(() => {
      refresh().catch(() => {
        if (disposed) return;
        setOverviewStatus(elements.stats.health, "Partial", "Refresh failed for one or more runtimes.", "warn");
      });
    }, refreshMs);
  }

  function stop() {
    disposed = true;
    if (timerId) clearIntervalImpl(timerId);
  }

  return { refresh, start, stop };
}

function mountOverview(root, context, dependencies) {
  const controller = createOverviewController({ root, context, ...dependencies });
  controller.start();
  return controller.stop;
}

export { createOverviewController, mountOverview };
