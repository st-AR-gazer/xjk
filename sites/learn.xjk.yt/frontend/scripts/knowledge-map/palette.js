const CLUSTER_COLORS = {
  "speed-momentum": "250,204,21",
  "grip-contact": "74,222,128",
  inputs: "56,189,248",
  surfaces: "232,162,0",
  vehicles: "239,68,68",
  "block-geometry": "168,85,247",
  "special-forces": "34,211,238",
  techniques: "244,114,182",
  contexts: "154,236,53",
  "practice-analysis": "216,216,216",
  underwater: "56,189,248",
  "desert-car": "232,162,0",
  snowcar: "216,216,216",
  recovery: "74,222,128",
  advanced: "168,85,247",
  style: "244,114,182",
};

function clusterColor(clusterId) {
  return CLUSTER_COLORS[clusterId] || "230,230,230";
}

export { clusterColor };
