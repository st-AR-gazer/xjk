import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildKnowledgeMapLayout } from "../sites/learn.xjk.yt/frontend/scripts/knowledge-map-layout.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "sites/learn.xjk.yt/frontend/content/index.json");
const layoutModulePath = path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/knowledge-map-layout.js");
const knowledgeMapPath = path.join(repoRoot, "sites/learn.xjk.yt/frontend/scripts/knowledge-map.js");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const layoutModuleSource = fs.readFileSync(layoutModulePath, "utf8");
const knowledgeMapSource = fs.readFileSync(knowledgeMapPath, "utf8");
assert.doesNotMatch(
  layoutModuleSource,
  /\b(?:canvas|document|performance|requestAnimationFrame|window)\b/,
  "Learn map layout helper must remain independent from browser and canvas state"
);
assert.match(
  knowledgeMapSource,
  /import \{ buildKnowledgeMapLayout \} from "\.\/knowledge-map-layout\.js";/,
  "Learn map renderer must import the pure layout helper"
);
assert.match(
  knowledgeMapSource,
  /buildKnowledgeMapLayout\(manifest, \{ width, height \}\)/,
  "Learn map renderer must delegate graph construction to the pure layout helper"
);
assert.doesNotMatch(
  knowledgeMapSource,
  /\b(?:fibDirection|tangentBasis)\b/,
  "Learn map renderer must not retain deterministic geometry construction"
);
const viewport = { width: 1180, height: 720 };
const compact = (layout) => ({
  clusters: layout.clusters.map(({ id, px, py, dir }) => ({ id, px, py, dir })),
  nodes: layout.nodes.map(({ slug, cluster, x, y, p3, weight, r, pulse }) => ({
    slug,
    cluster,
    x,
    y,
    p3,
    weight,
    r,
    pulse,
  })),
  edges: layout.edges.map(({ source, target, kind, weight }) => ({
    source: source.slug,
    target: target.slug,
    kind,
    weight,
  })),
});
const approximatelyEqual = (actual, expected, epsilon = 1e-10) => Math.abs(actual - expected) <= epsilon;

const manifestBefore = JSON.stringify(manifest);
const first = buildKnowledgeMapLayout(manifest, viewport);
const second = buildKnowledgeMapLayout(manifest, viewport);
assert.deepEqual(compact(first), compact(second), "Learn map layout must be deterministic for the same input");
assert.equal(JSON.stringify(manifest), manifestBefore, "Learn map layout must not mutate its manifest");

assert.equal(first.nodes.length, manifest.pages.length, "Learn map must create one node per manifest page");
assert.equal(first.clusters.length, manifest.clusters.length, "Learn map must preserve every manifest cluster");
assert.deepEqual(
  first.nodes.map((node) => node.slug),
  manifest.pages.map((page) => page.slug),
  "Learn map node IDs must preserve manifest order"
);
assert.deepEqual(
  first.clusters.map((cluster) => cluster.id),
  manifest.clusters.map((cluster) => cluster.id),
  "Learn map cluster IDs must preserve manifest order"
);
assert.equal(
  new Set(first.nodes.map((node) => node.slug)).size,
  first.nodes.length,
  "Learn map node IDs must be unique"
);
assert.equal(
  new Set(first.clusters.map((cluster) => cluster.id)).size,
  first.clusters.length,
  "Learn map cluster IDs must be unique"
);

for (const cluster of first.clusters) {
  for (const value of [cluster.px, cluster.py, cluster.dir.x, cluster.dir.y, cluster.dir.z]) {
    assert.ok(Number.isFinite(value), `Learn map cluster ${cluster.id} has a non-finite coordinate`);
  }
  assert.ok(
    approximatelyEqual(Math.hypot(cluster.dir.x, cluster.dir.y, cluster.dir.z), 1),
    `Learn map cluster ${cluster.id} must lie on the 3D unit sphere`
  );
}

for (const node of first.nodes) {
  for (const value of [node.x, node.y, node.p3.x, node.p3.y, node.p3.z, node.r, node.weight, node.pulse]) {
    assert.ok(Number.isFinite(value), `Learn map node ${node.slug} has a non-finite coordinate or metric`);
  }
  assert.ok(
    approximatelyEqual(Math.hypot(node.p3.x, node.p3.y, node.p3.z), 1),
    `Learn map node ${node.slug} must lie on the 3D unit sphere`
  );
}

const nodesBySlug = new Map(first.nodes.map((node) => [node.slug, node]));
const edgeKeys = new Set();
for (const edge of first.edges) {
  assert.equal(
    edge.source,
    nodesBySlug.get(edge.source.slug),
    "Learn map edge source must reference its canonical node"
  );
  assert.equal(
    edge.target,
    nodesBySlug.get(edge.target.slug),
    "Learn map edge target must reference its canonical node"
  );
  assert.notEqual(edge.source, edge.target, "Learn map must not create self edges");
  const key = [edge.source.slug, edge.target.slug].sort().join("|");
  assert.equal(edgeKeys.has(key), false, `Learn map contains duplicate edge ${key}`);
  edgeKeys.add(key);
}
assert.ok(first.edges.length > 0, "Learn map fixture must exercise edge construction");

const alternateViewport = { width: 760, height: 980 };
const alternate = buildKnowledgeMapLayout(manifest, alternateViewport);
assert.deepEqual(
  alternate.nodes.map((node) => node.slug),
  first.nodes.map((node) => node.slug),
  "Viewport changes must not reorder Learn map nodes"
);
assert.deepEqual(
  alternate.edges.map((edge) => [edge.source.slug, edge.target.slug]),
  first.edges.map((edge) => [edge.source.slug, edge.target.slug]),
  "Viewport changes must not alter Learn map edge endpoints"
);
assert.deepEqual(
  alternate.nodes.map((node) => node.p3),
  first.nodes.map((node) => node.p3),
  "3D node positions must be viewport independent"
);
assert.deepEqual(
  alternate.clusters.map((cluster) => cluster.dir),
  first.clusters.map((cluster) => cluster.dir),
  "3D cluster anchors must be viewport independent"
);
assert.ok(
  alternate.nodes.some((node, index) => node.x !== first.nodes[index].x || node.y !== first.nodes[index].y),
  "2D node positions must respond to viewport changes"
);
for (const [index, cluster] of first.clusters.entries()) {
  const source = manifest.clusters[index];
  assert.ok(
    approximatelyEqual(cluster.px, source.x * viewport.width),
    `Cluster ${cluster.id} has the wrong 2D x anchor`
  );
  assert.ok(
    approximatelyEqual(cluster.py, source.y * viewport.height),
    `Cluster ${cluster.id} has the wrong 2D y anchor`
  );
}

const representativePage = manifest.pages.find((page) => {
  const clusterIds = page.graph?.secondaryClusters || page.secondaryClusters || [];
  return manifest.clusters.some((cluster) => cluster.id === clusterIds[0]);
});
assert.ok(representativePage, "Learn map fixture must include a node with a valid secondary cluster");
const primaryId = representativePage.graph?.primaryCluster || representativePage.cluster;
const secondaryId = (representativePage.graph?.secondaryClusters || representativePage.secondaryClusters)[0];
const primaryCluster = manifest.clusters.find((cluster) => cluster.id === primaryId);
const secondaryCluster = manifest.clusters.find((cluster) => cluster.id === secondaryId);
const firstRepresentative = first.nodes.find((node) => node.slug === representativePage.slug);
const alternateRepresentative = alternate.nodes.find((node) => node.slug === representativePage.slug);
assert.ok(primaryCluster && secondaryCluster, "Representative Learn node must resolve both cluster anchors");
assert.ok(firstRepresentative && alternateRepresentative, "Representative Learn node must exist in both layouts");
const primaryPull = 0.78;
const secondaryPull = 0.22;
assert.ok(
  approximatelyEqual(
    alternateRepresentative.x - firstRepresentative.x,
    (primaryCluster.x * primaryPull + secondaryCluster.x * secondaryPull) * (alternateViewport.width - viewport.width)
  ),
  "Learn map 2D x geometry must preserve its primary/secondary cluster pull"
);
assert.ok(
  approximatelyEqual(
    alternateRepresentative.y - firstRepresentative.y,
    (primaryCluster.y * primaryPull + secondaryCluster.y * secondaryPull) * (alternateViewport.height - viewport.height)
  ),
  "Learn map 2D y geometry must preserve its primary/secondary cluster pull"
);

console.log(
  `Learn map layout ok: ${first.nodes.length} nodes, ${first.edges.length} edges, ${first.clusters.length} clusters, deterministic 2D/3D geometry`
);
