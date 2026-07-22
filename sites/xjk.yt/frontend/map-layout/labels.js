import { snap, toGridBox } from "./geometry.js";

function truncateText(value, maxCharacters) {
  const text = String(value || "").trim();
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
}

function wrapDescription(value, maxCharacters = 24, maxLines = 2) {
  const words = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim()
    .split(" ")
    .map((word) => truncateText(word, maxCharacters))
    .filter(Boolean);
  const lines = [];

  while (words.length > 0 && lines.length < maxLines) {
    let line = words.shift();
    while (words.length > 0 && `${line} ${words[0]}`.length <= maxCharacters) line += ` ${words.shift()}`;
    lines.push(line);
  }

  if (words.length > 0 && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
  }

  return lines;
}

function labelMetrics(displayLabel, description) {
  const titleWidth = String(displayLabel).length * 10.5;
  const descriptionWidth = description.reduce((width, line) => Math.max(width, line.length * 6.8), 0);
  return {
    width: Math.max(68, titleWidth, descriptionWidth, 62),
    height: 65 + description.length * 16,
  };
}

function boxForLabel(x, top, width, height, anchor) {
  const left = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  return { left, top, right: left + width, bottom: top + height };
}

function labelCandidates(station, metrics, maxGap) {
  const { width, height } = metrics;
  const candidates = [];
  const gaps = [];
  for (let gap = 30; gap <= maxGap; gap += 18) gaps.push(gap);

  gaps.forEach((gap) => {
    const diagonalGap = Math.round(gap * 0.83);
    const gapCandidates = [
      { side: "e", x: station.x + gap, top: station.y - height / 2, anchor: "start", vector: [1, 0] },
      { side: "w", x: station.x - gap, top: station.y - height / 2, anchor: "end", vector: [-1, 0] },
      {
        side: "ne",
        x: station.x + diagonalGap,
        top: station.y - height - diagonalGap,
        anchor: "start",
        vector: [0.707, -0.707],
      },
      {
        side: "nw",
        x: station.x - diagonalGap,
        top: station.y - height - diagonalGap,
        anchor: "end",
        vector: [-0.707, -0.707],
      },
      {
        side: "se",
        x: station.x + diagonalGap,
        top: station.y + diagonalGap,
        anchor: "start",
        vector: [0.707, 0.707],
      },
      {
        side: "sw",
        x: station.x - diagonalGap,
        top: station.y + diagonalGap,
        anchor: "end",
        vector: [-0.707, 0.707],
      },
      { side: "n", x: station.x, top: station.y - height - gap, anchor: "middle", vector: [0, -1] },
      { side: "s", x: station.x, top: station.y + gap, anchor: "middle", vector: [0, 1] },
    ];
    candidates.push(...gapCandidates.map((candidate) => ({ ...candidate, gap })));
  });

  return candidates.map((candidate, index) => ({
    ...candidate,
    index,
    box: boxForLabel(candidate.x, candidate.top, width, height, candidate.anchor),
  }));
}

function overlapArea(left, right) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function outsideDistance(box, mapGrid, margin) {
  return (
    Math.max(0, margin - box.left) +
    Math.max(0, margin - box.top) +
    Math.max(0, box.right - (mapGrid.width - margin)) +
    Math.max(0, box.bottom - (mapGrid.height - margin))
  );
}

function chooseLabelPosition(site, station, center, metrics, placedLabelBoxes, stationBoxes, mapGrid, options) {
  const distance = Math.hypot(station.x - center.x, station.y - center.y) || 1;
  const outward = [(station.x - center.x) / distance, (station.y - center.y) / distance];
  const scoredCandidates = labelCandidates(station, metrics, Math.max(mapGrid.width, mapGrid.height)).map(
    (candidate) => {
      const alignment = candidate.vector[0] * outward[0] + candidate.vector[1] * outward[1];
      const boundDistance = outsideDistance(candidate.box, mapGrid, options.labelMargin);
      const labelOverlap = placedLabelBoxes.reduce(
        (score, placedBox) => score + overlapArea(candidate.box, placedBox),
        0
      );
      const stationOverlap = stationBoxes.reduce((score, entry) => score + overlapArea(candidate.box, entry.box), 0);
      const verticalPenalty = candidate.side === "n" || candidate.side === "s" ? 12 : 0;
      return {
        ...candidate,
        collisionFree: boundDistance === 0 && labelOverlap === 0 && stationOverlap === 0,
        score:
          boundDistance * 2500 +
          labelOverlap * 10000 +
          stationOverlap * 10000 +
          (1 - alignment) * 95 +
          candidate.gap * 2 +
          verticalPenalty +
          candidate.index * 0.01,
      };
    }
  );
  const collisionFreeCandidates = scoredCandidates.filter((candidate) => candidate.collisionFree);
  if (collisionFreeCandidates.length === 0) {
    throw new Error(`Unable to place ${site.id} label without a collision.`);
  }
  return collisionFreeCandidates.sort((left, right) => left.score - right.score || left.index - right.index)[0];
}

function stationPositions(ringIds, internalIds, mapGrid, options, rootSiteId) {
  const center = {
    x: snap(mapGrid.width / 2, mapGrid.cellSize),
    y: snap(mapGrid.height / 2, mapGrid.cellSize),
  };
  const positions = new Map([[rootSiteId, center]]);

  ringIds.forEach((siteId, index) => {
    const angle = options.ringStartAngle + (Math.PI * 2 * index) / Math.max(1, ringIds.length);
    positions.set(siteId, {
      x: snap(center.x + Math.cos(angle) * options.ringRadiusX, mapGrid.cellSize),
      y: snap(center.y + Math.sin(angle) * options.ringRadiusY, mapGrid.cellSize),
    });
  });

  internalIds.forEach((siteId, index) => {
    const angle = options.internalStartAngle + (Math.PI * 2 * index) / Math.max(1, internalIds.length);
    positions.set(siteId, {
      x: snap(center.x + Math.cos(angle) * options.internalRadiusX, mapGrid.cellSize),
      y: snap(center.y + Math.sin(angle) * options.internalRadiusY, mapGrid.cellSize),
    });
  });

  return { center, positions };
}

export { boxForLabel, chooseLabelPosition, labelMetrics, stationPositions, toGridBox, truncateText, wrapDescription };
