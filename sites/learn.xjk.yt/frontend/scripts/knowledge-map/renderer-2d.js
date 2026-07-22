import { advance2dCamera, transformNode } from "./camera.js";
import { clusterColor } from "./palette.js";
import { cubicPoint, drawNodeLabel, isActiveEdge } from "./renderer-shared.js";

function edgePath(state, edge) {
  const start = transformNode(state, edge.source);
  const end = transformNode(state, edge.target);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const normalX = -deltaY / distance;
  const normalY = deltaX / distance;
  const bend = Math.min(120, distance * 0.38);
  const sign = edge.source.slug < edge.target.slug ? 1 : -1;
  return {
    start,
    end,
    control1: {
      x: start.x + deltaX * 0.3 + normalX * bend * sign,
      y: start.y + deltaY * 0.3 + normalY * bend * sign,
    },
    control2: {
      x: start.x + deltaX * 0.7 + normalX * bend * sign,
      y: start.y + deltaY * 0.7 + normalY * bend * sign,
    },
  };
}

function drawBackground(state) {
  const { ctx } = state;
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  ctx.lineWidth = 1;
  for (let index = 0; index < 15; index += 1) {
    const x = state.width * 0.48 + Math.sin(index * 0.9) * state.width * 0.09 + state.panX * 0.12;
    const y = state.height * 0.52 + Math.cos(index * 1.2) * state.height * 0.14 + state.panY * 0.12;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      state.width * (0.22 + index * 0.012),
      state.height * (0.07 + index * 0.005),
      index * 0.35,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawCluster(state, cluster) {
  const { ctx } = state;
  const x = cluster.x * state.width * state.zoom + state.panX;
  const y = cluster.y * state.height * state.zoom + state.panY;
  const color = clusterColor(cluster.id);
  ctx.save();
  ctx.strokeStyle = `rgba(${color}, .3)`;
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 82 * state.zoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(${color}, .8)`;
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText(cluster.title, x + 16, y + 4);
  ctx.restore();
}

function drawTendril(state, edge, active) {
  const { ctx } = state;
  const { start, end, control1, control2 } = edgePath(state, edge);
  const color = clusterColor(edge.source.cluster);
  const alpha = active ? 0.46 * state.intensity : 0.13 * state.intensity;
  ctx.save();
  ctx.shadowBlur = active ? 24 * state.intensity : 9 * state.intensity;
  ctx.shadowColor = `rgba(${color}, ${active ? 0.72 : 0.22})`;
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = active ? 2.2 : 1.1;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, end.x, end.y);
  ctx.stroke();

  if (active && !state.reducedMotion) {
    for (let index = 0; index < 2; index += 1) {
      const progress = (state.runtime.performance.now() * 0.00022 + index * 0.42 + edge.weight) % 1;
      const point = cubicPoint(start, control1, control2, end, progress);
      ctx.fillStyle = `rgba(${color}, .86)`;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2 + index, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNode(state, node) {
  const { ctx } = state;
  const point = transformNode(state, node);
  const active = node.slug === state.activeSlug;
  const nearby =
    active ||
    state.edges.some(
      (edge) => isActiveEdge(state, edge) && (edge.source.slug === node.slug || edge.target.slug === node.slug)
    );
  const color = clusterColor(node.cluster);
  const pulse = state.reducedMotion ? 0 : Math.sin(state.runtime.performance.now() * 0.003 + node.pulse) * 0.5 + 0.5;
  const radius = active ? node.r + 5 : nearby ? node.r + 1 : node.r * 0.85;
  ctx.save();
  ctx.globalAlpha = nearby ? 1 : 0.56;
  ctx.shadowColor = `rgba(${color}, ${active ? 0.92 : 0.4})`;
  ctx.shadowBlur = active ? 30 + pulse * 14 : nearby ? 16 : 6;
  ctx.fillStyle = `rgba(${color}, ${active ? 0.96 : nearby ? 0.74 : 0.42})`;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = active ? "rgba(0,0,0,.9)" : "rgba(255,255,255,.42)";
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();
  if (active || nearby) {
    ctx.globalAlpha = active ? 0.34 : 0.16;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 12 + pulse * 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.65)";
    ctx.stroke();
  }
  ctx.restore();
  if (state.labels && (active || nearby || node.r > 8)) drawNodeLabel(state, node, point, active);
}

function renderKnowledgeMap2d(state) {
  advance2dCamera(state);
  state.ctx.clearRect(0, 0, state.width, state.height);
  drawBackground(state);
  (state.manifest.clusters || []).forEach((cluster) => drawCluster(state, cluster));

  const activeEdges = [];
  state.edges.forEach((edge) => {
    if (isActiveEdge(state, edge)) activeEdges.push(edge);
    else drawTendril(state, edge, false);
  });
  activeEdges.forEach((edge) => drawTendril(state, edge, true));
  state.nodes.forEach((node) => drawNode(state, node));
}

export { renderKnowledgeMap2d };
