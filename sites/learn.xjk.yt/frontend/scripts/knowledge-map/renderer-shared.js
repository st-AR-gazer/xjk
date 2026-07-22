function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function cubicPoint(a, b, c, d, progress) {
  const remainder = 1 - progress;
  return {
    x:
      remainder ** 3 * a.x +
      3 * remainder ** 2 * progress * b.x +
      3 * remainder * progress ** 2 * c.x +
      progress ** 3 * d.x,
    y:
      remainder ** 3 * a.y +
      3 * remainder ** 2 * progress * b.y +
      3 * remainder * progress ** 2 * c.y +
      progress ** 3 * d.y,
  };
}

function isActiveEdge(state, edge) {
  return (
    edge.source.slug === state.activeSlug ||
    edge.target.slug === state.activeSlug ||
    edge.source.slug === state.hover?.slug ||
    edge.target.slug === state.hover?.slug
  );
}

function drawNodeLabel(state, node, point, active) {
  const { ctx } = state;
  const label = node.title.length > 28 ? `${node.title.slice(0, 26)}...` : node.title;
  ctx.save();
  ctx.font = active ? "700 13px system-ui, sans-serif" : "500 12px system-ui, sans-serif";
  const width = Math.min(214, ctx.measureText(label).width + 20);
  const height = active ? 30 : 26;
  const x = point.x + 13;
  const y = point.y - height / 2;
  roundRect(ctx, x, y, width, height, 7);
  ctx.fillStyle = active ? "rgba(0,0,0,.88)" : "rgba(0,0,0,.68)";
  ctx.strokeStyle = active ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? "#fff" : "rgba(238,238,238,.82)";
  ctx.fillText(label, x + 10, y + (active ? 20 : 18));
  ctx.restore();
}

export { cubicPoint, drawNodeLabel, isActiveEdge };
