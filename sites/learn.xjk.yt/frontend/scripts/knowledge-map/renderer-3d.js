import { clamp } from "../utils.js";
import { advance3dCamera, projectPoint3d, sphereRadius } from "./camera.js";
import { clusterColor } from "./palette.js";
import { drawNodeLabel, isActiveEdge } from "./renderer-shared.js";

function drawGraticule(state) {
  const { ctx } = state;
  const radius = sphereRadius(state);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(state.width / 2, state.height / 2, radius * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  for (let axis = 0; axis < 3; axis += 1) {
    ctx.beginPath();
    for (let step = 0; step <= 72; step += 1) {
      const angle = (step / 72) * Math.PI * 2;
      let vector;
      if (axis === 0) vector = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
      else if (axis === 1) vector = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      else vector = { x: 0, y: Math.cos(angle), z: Math.sin(angle) };
      const point = projectPoint3d(state, vector);
      if (step === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = axis === 1 ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.045)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawEdge(state, edge, active) {
  const { ctx } = state;
  const start = projectPoint3d(state, edge.source.p3);
  const end = projectPoint3d(state, edge.target.p3);
  const depth = (start.z + end.z) / 2;
  const color = clusterColor(edge.source.cluster);
  const alpha = active ? 0.66 * state.intensity : (0.05 + Math.max(0, depth + 0.42) * 0.13) * state.intensity;
  ctx.save();
  if (active) {
    ctx.shadowBlur = 14 * state.intensity;
    ctx.shadowColor = `rgba(${color}, .5)`;
  }
  ctx.strokeStyle = `rgba(${color}, ${clamp(alpha, 0, 0.85)})`;
  ctx.lineWidth = active ? 1.8 : 1;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function drawNode(state, node) {
  const { ctx } = state;
  const point = projectPoint3d(state, node.p3);
  const active = node.slug === state.activeSlug;
  const hovered = state.hover?.slug === node.slug;
  const depth = (point.z + 1) / 2;
  const color = clusterColor(node.cluster);
  const pulse = state.reducedMotion ? 0 : Math.sin(state.runtime.performance.now() * 0.003 + node.pulse) * 0.5 + 0.5;
  const radius = (active ? node.r + 3.5 : node.r * 0.9) * point.s;
  const alpha = active || hovered ? 0.96 : 0.16 + depth * 0.68;

  ctx.save();
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${color}, ${alpha})`;
  if (active || hovered) {
    ctx.shadowBlur = 22;
    ctx.shadowColor = `rgba(${color}, .8)`;
  } else if (depth > 0.6) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(${color}, .3)`;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = active ? "rgba(0,0,0,.85)" : `rgba(255,255,255,${0.1 + depth * 0.3})`;
  ctx.lineWidth = active ? 2 : 1;
  ctx.stroke();
  if (active || hovered) {
    ctx.globalAlpha = active ? 0.4 : 0.22;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 9 + pulse * 5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${color}, .9)`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();

  const front = point.z > 0.34;
  if (state.labels && front && (active || node.weight > 0.78) && !hovered) {
    drawNodeLabel(state, node, point, active);
  }
  if (hovered) drawNodeLabel(state, node, point, true);
}

function drawClusterLabels(state) {
  state.clusters3d.forEach((cluster) => {
    const point = projectPoint3d(state, cluster.dir);
    if (point.z < 0.18) return;
    const alpha = 0.28 + (point.z - 0.18) * 0.6;
    const color = clusterColor(cluster.id);
    state.ctx.save();
    state.ctx.font = "600 11px ui-monospace, SFMono-Regular, monospace";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = `rgba(${color}, ${clamp(alpha, 0, 0.85)})`;
    state.ctx.fillText(cluster.title.toUpperCase(), point.x, point.y - 14 * point.s - sphereRadius(state) * 0.052);
    state.ctx.restore();
  });
}

function renderKnowledgeMap3d(state) {
  advance3dCamera(state);
  state.ctx.clearRect(0, 0, state.width, state.height);
  drawGraticule(state);

  const activeEdges = [];
  state.edges.forEach((edge) => {
    if (isActiveEdge(state, edge)) activeEdges.push(edge);
    else drawEdge(state, edge, false);
  });
  activeEdges.forEach((edge) => drawEdge(state, edge, true));

  const nodesByDepth = [...state.nodes].sort((a, b) => projectPoint3d(state, a.p3).z - projectPoint3d(state, b.p3).z);
  nodesByDepth.forEach((node) => drawNode(state, node));
  drawClusterLabels(state);
}

export { renderKnowledgeMap3d };
