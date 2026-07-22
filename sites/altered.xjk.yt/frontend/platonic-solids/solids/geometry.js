const PHI = (1 + Math.sqrt(5)) / 2;
const TAU = Math.PI * 2;

const RAW_GEOMETRIES = {
  tetrahedron: {
    vertices: [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
  },
  cube: {
    vertices: [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, -1],
      [-1, 1, 1],
      [1, -1, -1],
      [1, -1, 1],
      [1, 1, -1],
      [1, 1, 1],
    ],
    faces: [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ],
  },
  octahedron: {
    vertices: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [0, 5, 2],
      [2, 5, 1],
      [1, 5, 3],
      [3, 5, 0],
    ],
  },
  dodecahedron: {
    vertices: [
      [1, 1, 1],
      [1, 1, -1],
      [1, -1, 1],
      [1, -1, -1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, 1],
      [-1, -1, -1],
      [0, 1 / PHI, PHI],
      [0, 1 / PHI, -PHI],
      [0, -1 / PHI, PHI],
      [0, -1 / PHI, -PHI],
      [1 / PHI, PHI, 0],
      [1 / PHI, -PHI, 0],
      [-1 / PHI, PHI, 0],
      [-1 / PHI, -PHI, 0],
      [PHI, 0, 1 / PHI],
      [PHI, 0, -1 / PHI],
      [-PHI, 0, 1 / PHI],
      [-PHI, 0, -1 / PHI],
    ],
    faces: [
      [0, 8, 10, 2, 16],
      [0, 16, 17, 1, 12],
      [0, 12, 14, 4, 8],
      [8, 4, 18, 6, 10],
      [16, 2, 13, 3, 17],
      [12, 1, 9, 5, 14],
      [4, 14, 5, 19, 18],
      [2, 10, 6, 15, 13],
      [1, 17, 3, 11, 9],
      [5, 9, 11, 7, 19],
      [6, 18, 19, 7, 15],
      [3, 13, 15, 7, 11],
    ],
  },
  icosahedron: {
    vertices: [
      [-1, PHI, 0],
      [1, PHI, 0],
      [-1, -PHI, 0],
      [1, -PHI, 0],
      [0, -1, PHI],
      [0, 1, PHI],
      [0, -1, -PHI],
      [0, 1, -PHI],
      [PHI, 0, -1],
      [PHI, 0, 1],
      [-PHI, 0, -1],
      [-PHI, 0, 1],
    ],
    faces: [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ],
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeGeometry(vertices) {
  const maxLength = vertices.reduce((max, vertex) => {
    const length = Math.hypot(vertex[0], vertex[1], vertex[2]);
    return Math.max(max, length);
  }, 1);
  return vertices.map((vertex) => vertex.map((component) => component / maxLength));
}

function buildEdgeSet(faces) {
  const edgeSet = new Set();
  faces.forEach((face) => {
    for (let index = 0; index < face.length; index += 1) {
      const first = face[index];
      const second = face[(index + 1) % face.length];
      edgeSet.add(`${Math.min(first, second)}:${Math.max(first, second)}`);
    }
  });
  return [...edgeSet].map((edge) => edge.split(":").map(Number));
}

const GEOMETRIES = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_GEOMETRIES).map(([key, geometry]) => [
      key,
      Object.freeze({
        vertices: normalizeGeometry(geometry.vertices),
        faces: geometry.faces,
        edges: buildEdgeSet(geometry.faces),
      }),
    ])
  )
);

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;
  const integer = Number.parseInt(value, 16);
  return {
    r: (integer >> 16) & 255,
    g: (integer >> 8) & 255,
    b: integer & 255,
  };
}

function blendColor(hexA, hexB, amount, alpha = 1) {
  const colorA = hexToRgb(hexA);
  const colorB = hexToRgb(hexB);
  const mix = clamp(amount, 0, 1);
  const red = Math.round(colorA.r + (colorB.r - colorA.r) * mix);
  const green = Math.round(colorA.g + (colorB.g - colorA.g) * mix);
  const blue = Math.round(colorA.b + (colorB.b - colorA.b) * mix);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function rotateVertex(vertex, rx, ry, rz) {
  let [x, y, z] = vertex;

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  let rotatedY = y * cosX - z * sinX;
  let rotatedZ = y * sinX + z * cosX;
  y = rotatedY;
  z = rotatedZ;

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  let rotatedX = x * cosY + z * sinY;
  rotatedZ = -x * sinY + z * cosY;
  x = rotatedX;
  z = rotatedZ;

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  rotatedX = x * cosZ - y * sinZ;
  rotatedY = x * sinZ + y * cosZ;
  return [rotatedX, rotatedY, z];
}

function vectorSubtract(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorCross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function vectorDot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function normalizeSpinAxis(x, y, z) {
  const length = Math.hypot(x, y, z);
  if (length < 0.00001) return [0, 1, 0];
  return [x / length, y / length, z / length];
}

function rotateAroundAxis(vertex, axis, angle) {
  const [ux, uy, uz] = axis;
  const [x, y, z] = vertex;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = ux * x + uy * y + uz * z;
  const crossX = uy * z - uz * y;
  const crossY = uz * x - ux * z;
  const crossZ = ux * y - uy * x;

  return [
    x * cosine + crossX * sine + ux * dot * (1 - cosine),
    y * cosine + crossY * sine + uy * dot * (1 - cosine),
    z * cosine + crossZ * sine + uz * dot * (1 - cosine),
  ];
}

function projectVertex(vertex, width, height, scale, perspective) {
  const depth = Math.max(0.2, perspective - vertex[2]);
  const projectedScale = scale / depth;
  return {
    x: width * 0.5 + vertex[0] * projectedScale,
    y: height * 0.5 - vertex[1] * projectedScale,
    depth,
  };
}

export {
  GEOMETRIES,
  TAU,
  blendColor,
  buildEdgeSet,
  clamp,
  hexToRgb,
  normalizeGeometry,
  normalizeSpinAxis,
  normalizeVector,
  projectVertex,
  rotateAroundAxis,
  rotateVertex,
  vectorCross,
  vectorDot,
  vectorSubtract,
};
