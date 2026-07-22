import assert from "node:assert/strict";
import test from "node:test";

import { esc } from "./modules/formatters.js";
import { buildNamingDetailContext, renderNamingDetailMarkup } from "./modules/naming-detail-renderer.js";
import { renderSimilarityBackfillStatusMarkup } from "./modules/similarity-status-renderer.js";

const namingDependencies = {
  buildSimilarityMatchSearchText: (match) => String(match.mapName || "").toLowerCase(),
  renderKv: (label, value) => `<div>${esc(label)}:${esc(value)}</div>`,
  renderMapViewerAction: (target, reference) =>
    `<button data-target="${esc(target)}" data-reference="${esc(reference)}">View</button>`,
  renderSimilarityWeightScopeCard: ({ title }) => `<div data-weight-card>${esc(title)}</div>`,
};

function namingContext(payload) {
  return buildNamingDetailContext(payload, {
    defaultWeightProfile: {},
    buildWeightProfile: (value, fallback = {}) => ({ ...fallback, ...(value || {}) }),
    formatWeightSummary: () => "balanced",
    similaritySearch: '" onfocus="alert(1)',
  });
}

test("naming detail renderer covers empty, loading, and error states without executable markup", () => {
  const empty = renderNamingDetailMarkup(namingContext({ map: { mapUid: "uid" } }), namingDependencies);
  assert.match(empty, /No stored similarity matches/);
  assert.match(empty, /No signature summary stored/);

  const loading = renderNamingDetailMarkup(namingContext({ loading: true }), namingDependencies);
  assert.match(loading, /Loading the latest naming diagnostics/);

  const failed = renderNamingDetailMarkup(
    namingContext({ loadError: '<img src=x onerror="alert(1)">' }),
    namingDependencies
  );
  assert.match(failed, /&lt;img/);
  assert.doesNotMatch(failed, /<img/i);
});

test("naming detail renderer preserves ranked candidates while escaping names, warnings, and search values", () => {
  const markup = renderNamingDetailMarkup(
    namingContext({
      map: { mapUid: "target", name: "<script>alert(1)</script>", campaignId: 4 },
      storedCandidate: { parserWarning: "<b>parser</b>" },
      signature: { signatureSummary: { unsafe: "<svg onload=alert(1)>" } },
      similarity: {
        details: { diagnosticWarnings: ["<img src=x onerror=alert(1)>"] },
        candidateMatches: [{ mapUid: "reference", mapName: "<script>candidate</script>", slot: 1, score: 0.9 }],
      },
    }),
    namingDependencies
  );
  assert.match(markup, /data-similarity-rank="1"/);
  assert.match(markup, /0\.900000/);
  assert.match(markup, /&lt;script&gt;candidate/);
  assert.doesNotMatch(markup, /<(?:script|img|svg)/i);
});

test("similarity status renderer covers hidden, running, complete, empty, canceled, and error states", () => {
  const render = (status, active = false) =>
    renderSimilarityBackfillStatusMarkup(status, {
      isRunning: () => active,
      now: Date.parse("2026-07-20T10:01:00Z"),
    });
  assert.equal(render(null), "");
  assert.equal(render({ progress: {} }), "");

  const running = render(
    {
      running: true,
      lastStartedAt: "2026-07-20T10:00:00Z",
      progress: { currentMapName: "Map", counters: { total: 4, processed: 1, resolved: 1 } },
    },
    true
  );
  assert.match(running, /Similarity Backfill Running/);
  assert.match(running, />25%</);
  assert.match(running, /Running 1m/);

  assert.match(render({ lastSummary: { processed: 2 } }), /Similarity Backfill Complete/);
  assert.match(render({ lastSummary: { emptySelection: true } }), /No Matching Maps/);
  assert.match(render({ lastSummary: {}, progress: { status: "canceled" } }), /Canceled/);
  assert.match(render({ lastError: "failed" }), /Similarity Backfill Failed/);
});

test("similarity status recent-map content is escaped", () => {
  const markup = renderSimilarityBackfillStatusMarkup(
    {
      lastSummary: {
        processed: 1,
        recentMaps: [{ mapName: "<img src=x onerror=alert(1)>", mapNumbers: [1] }],
      },
    },
    { isRunning: () => false }
  );
  assert.match(markup, /&lt;img/);
  assert.doesNotMatch(markup, /<img/i);
});
