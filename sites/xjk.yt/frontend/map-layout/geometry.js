function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function snap(value, cellSize) {
  return Math.round(value / cellSize) * cellSize;
}

function toGridPoint(point, cellSize) {
  return [Number((point.x / cellSize).toFixed(3)), Number((point.y / cellSize).toFixed(3))];
}

function gridPointOnSegment(point, start, end) {
  const pointX = Number(point?.[0]);
  const pointY = Number(point?.[1]);
  const startX = Number(start?.[0]);
  const startY = Number(start?.[1]);
  const endX = Number(end?.[0]);
  const endY = Number(end?.[1]);
  if (![pointX, pointY, startX, startY, endX, endY].every(Number.isFinite)) return false;

  const cross = (pointX - startX) * (endY - startY) - (pointY - startY) * (endX - startX);
  if (Math.abs(cross) > 0.0001) return false;

  return (
    pointX >= Math.min(startX, endX) &&
    pointX <= Math.max(startX, endX) &&
    pointY >= Math.min(startY, endY) &&
    pointY <= Math.max(startY, endY)
  );
}

function gridPointOnRoutes(point, routes) {
  return routes.some((route) =>
    route.points.some(
      (segmentEnd, index) => index > 0 && gridPointOnSegment(point, route.points[index - 1], segmentEnd)
    )
  );
}

function toGridBox(box, cellSize) {
  return [box.left, box.top, box.right, box.bottom].map((value) => Number((value / cellSize).toFixed(3)));
}

function simplifyPath(points) {
  const deduplicated = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
  );
  const simplified = [];

  deduplicated.forEach((point) => {
    while (simplified.length >= 2) {
      const before = simplified[simplified.length - 2];
      const previous = simplified[simplified.length - 1];
      const cross = (previous.x - before.x) * (point.y - previous.y) - (previous.y - before.y) * (point.x - previous.x);
      if (Math.abs(cross) > 0.001) break;
      simplified.pop();
    }
    simplified.push(point);
  });

  return simplified;
}

function octilinearPath(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  const points = [start];

  if (Math.abs(absoluteX - absoluteY) > 0.001) {
    if (absoluteX > absoluteY) {
      points.push({
        x: start.x + Math.sign(deltaX) * (absoluteX - absoluteY),
        y: start.y,
      });
    } else {
      points.push({
        x: start.x,
        y: start.y + Math.sign(deltaY) * (absoluteY - absoluteX),
      });
    }
  }

  points.push(end);
  return simplifyPath(points);
}

function angularDistance(left, right) {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

function pixelPointsEqual(left, right) {
  return Math.abs(left.x - right.x) <= 0.001 && Math.abs(left.y - right.y) <= 0.001;
}

function pixelPointOnSegment(point, start, end) {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  return (
    Math.abs(cross) <= 0.001 &&
    point.x >= Math.min(start.x, end.x) - 0.001 &&
    point.x <= Math.max(start.x, end.x) + 0.001 &&
    point.y >= Math.min(start.y, end.y) - 0.001 &&
    point.y <= Math.max(start.y, end.y) + 0.001
  );
}

function pixelSegmentIntersection(leftStart, leftEnd, rightStart, rightEnd) {
  const leftVector = { x: leftEnd.x - leftStart.x, y: leftEnd.y - leftStart.y };
  const rightVector = { x: rightEnd.x - rightStart.x, y: rightEnd.y - rightStart.y };
  const offset = { x: rightStart.x - leftStart.x, y: rightStart.y - leftStart.y };
  const denominator = leftVector.x * rightVector.y - leftVector.y * rightVector.x;

  if (Math.abs(denominator) <= 0.001) {
    const collinear = Math.abs(offset.x * leftVector.y - offset.y * leftVector.x) <= 0.001;
    if (!collinear) return null;
    const sharedPoints = [leftStart, leftEnd, rightStart, rightEnd].filter(
      (point, index, points) =>
        pixelPointOnSegment(point, leftStart, leftEnd) &&
        pixelPointOnSegment(point, rightStart, rightEnd) &&
        points.findIndex((candidate) => pixelPointsEqual(candidate, point)) === index
    );
    if (sharedPoints.length === 0) return null;
    return {
      type: sharedPoints.length > 1 ? "overlap" : "point",
      point: sharedPoints[0],
    };
  }

  const leftRatio = (offset.x * rightVector.y - offset.y * rightVector.x) / denominator;
  const rightRatio = (offset.x * leftVector.y - offset.y * leftVector.x) / denominator;
  if (leftRatio < -0.001 || leftRatio > 1.001 || rightRatio < -0.001 || rightRatio > 1.001) return null;

  return {
    type: "point",
    point: {
      x: leftStart.x + leftRatio * leftVector.x,
      y: leftStart.y + leftRatio * leftVector.y,
    },
  };
}

function pointToSegmentDistance(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * deltaX), point.y - (start.y + ratio * deltaY));
}

function heapPush(heap, value) {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].priority <= value.priority) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap) {
  if (heap.length === 0) return null;
  const first = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].priority < heap[left].priority ? right : left;
    if (heap[child].priority >= last.priority) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return first;
}

export {
  angularDistance,
  deepFreeze,
  gridPointOnRoutes,
  gridPointOnSegment,
  heapPop,
  heapPush,
  octilinearPath,
  pixelPointsEqual,
  pixelSegmentIntersection,
  pointToSegmentDistance,
  simplifyPath,
  snap,
  toGridBox,
  toGridPoint,
};
