import { lerp } from "./utils.js";

const CLUSTER_CAP = 0.42;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function fibDirection(index, count) {
  const y = 1 - (2 * (index + 0.5)) / Math.max(1, count);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * index;
  return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };
}

function normalize3(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function tangentBasis(normal) {
  const reference = Math.abs(normal.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = normalize3(cross3(reference, normal));
  const v = cross3(normal, u);
  return [u, v];
}

export function buildKnowledgeMapLayout(manifest = {}, viewport = {}) {
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const clusterList = manifest.clusters || [];
  const pages = manifest.pages || [];
  const clusters = clusterList.map((cluster, index) => ({
    ...cluster,
    px: cluster.x * width,
    py: cluster.y * height,
    dir: fibDirection(index, clusterList.length),
  }));
  const clusterMap = Object.fromEntries(clusters.map((cluster) => [cluster.id, cluster]));
  const anchor3d = Object.fromEntries(clusters.map((cluster) => [cluster.id, cluster.dir]));

  const grouped = new Map();
  pages.forEach((page) => {
    const clusterId = page.graph?.primaryCluster || page.cluster;
    if (!grouped.has(clusterId)) grouped.set(clusterId, []);
    grouped.get(clusterId).push(page);
  });

  const nodes = pages.map((page, index) => {
    const clusterId = page.graph?.primaryCluster || page.cluster;
    const primary = clusterMap[clusterId] || { px: width / 2, py: height / 2 };
    const secondary = (page.graph?.secondaryClusters || page.secondaryClusters || [])
      .map((id) => clusterMap[id])
      .filter(Boolean)[0];
    const orbit = page.graph?.orbit ?? (index * 0.61803398875) % 1;
    const angle = orbit * Math.PI * 2;
    const weight = page.graph?.weight || 0.6;
    const radius = 54 + (index % 4) * 20 + weight * 44;
    let x = primary.px + Math.cos(angle) * radius;
    let y = primary.py + Math.sin(angle) * radius * 0.74;
    if (secondary) {
      const pull = 0.22;
      x = lerp(x, secondary.px, pull);
      y = lerp(y, secondary.py, pull);
    }

    const siblings = grouped.get(clusterId) || [page];
    const memberIndex = siblings.indexOf(page);
    const anchor = anchor3d[clusterId] || { x: 0, y: 1, z: 0 };
    const [u, v] = tangentBasis(anchor);
    const spread = CLUSTER_CAP * Math.sqrt((memberIndex + 0.68) / Math.max(1, siblings.length));
    let p3 = normalize3({
      x: anchor.x * Math.cos(spread) + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * Math.sin(spread),
      y: anchor.y * Math.cos(spread) + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * Math.sin(spread),
      z: anchor.z * Math.cos(spread) + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * Math.sin(spread),
    });
    const secondaryId = (page.graph?.secondaryClusters || page.secondaryClusters || [])[0];
    const secondaryAnchor = secondaryId ? anchor3d[secondaryId] : null;
    if (secondaryAnchor) {
      p3 = normalize3({
        x: lerp(p3.x, secondaryAnchor.x, 0.16),
        y: lerp(p3.y, secondaryAnchor.y, 0.16),
        z: lerp(p3.z, secondaryAnchor.z, 0.16),
      });
    }

    return {
      page,
      slug: page.slug,
      title: page.title,
      cluster: clusterId,
      x,
      y,
      p3,
      weight,
      r: 5 + weight * 7,
      pulse: index * 1.7,
    };
  });

  const bySlug = new Map(nodes.map((node) => [node.slug, node]));
  const edgeMap = new Map();
  pages.forEach((page) => {
    const source = bySlug.get(page.slug);
    if (!source) return;
    const links = [
      ...(page.links || []),
      ...(page.related || []).map((slug) => ({ slug, kind: "related", weight: 0.72 })),
    ];
    links.forEach((link) => {
      const target = bySlug.get(link.slug);
      if (!target || target === source) return;
      const key = [source.slug, target.slug].sort().join("|");
      if (!edgeMap.has(key)) edgeMap.set(key, { source, target, kind: link.kind, weight: link.weight || 0.7 });
    });
  });

  return { nodes, edges: [...edgeMap.values()], clusters };
}
