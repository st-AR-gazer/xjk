const MAP_VIEWER_DIFF_SCHEMA_VERSION = "map-viewer.diff/v1";

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundNumber(value, digits = 3) {
  const safe = toFiniteNumber(value, 0);
  const factor = 10 ** digits;
  return Math.round(safe * factor) / factor;
}

function normalizeKind(value) {
  const raw = toText(value);
  if (raw === "Block" || raw === "Item" || raw === "OpenArea") return raw;
  return "Item";
}

function normalizeWaypointKind(value) {
  const raw = toText(value);
  if (raw === "Start" || raw === "Finish" || raw === "Checkpoint") return raw;
  return "None";
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [toText(key), toText(entry)])
      .filter(([key]) => key)
  );
}

function normalizeVec3(value, { digits = 3 } = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    x: roundNumber(source.x, digits),
    y: roundNumber(source.y, digits),
    z: roundNumber(source.z, digits),
  };
}

function maybeInteger(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function maybeBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const raw = toText(value).toLowerCase();
  if (!raw) return undefined;
  return !["0", "false", "no", "off"].includes(raw);
}

function extractScale(element) {
  const metadata = element?.metadata || {};
  const scale = metadata.scale || metadata.itemScale || "";
  if (!scale) return 1;
  return roundNumber(scale, 3);
}

function buildModelKey(element) {
  return [
    normalizeKind(element.kind),
    toText(element.typeId, "Unknown"),
    element.variant ?? "",
    element.subVariant ?? "",
    element.isGround === undefined ? "" : element.isGround ? "1" : "0",
    element.blockVariantIndex ?? "",
    element.mobilIndex ?? "",
    element.mobilVariantIndex ?? "",
    extractScale(element),
  ].join("|");
}

function buildTransformKey(element) {
  const position = normalizeVec3(element?.transform?.position, { digits: 3 });
  const rotation = normalizeVec3(element?.transform?.pitchYawRoll, { digits: 5 });
  return [
    position.x,
    position.y,
    position.z,
    rotation.x,
    rotation.y,
    rotation.z,
    extractScale(element),
  ].join("|");
}

function buildExactKey(element) {
  return `${buildModelKey(element)}|${buildTransformKey(element)}`;
}

function angleDeltaDegrees(left, right) {
  let delta = toFiniteNumber(left, 0) - toFiniteNumber(right, 0);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs((delta * 180) / Math.PI);
}

function computePositionDistance(left, right) {
  const dx = toFiniteNumber(left?.transform?.position?.x, 0) - toFiniteNumber(right?.transform?.position?.x, 0);
  const dy = toFiniteNumber(left?.transform?.position?.y, 0) - toFiniteNumber(right?.transform?.position?.y, 0);
  const dz = toFiniteNumber(left?.transform?.position?.z, 0) - toFiniteNumber(right?.transform?.position?.z, 0);
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function computeRotationDeltaDegrees(left, right) {
  const leftRotation = left?.transform?.pitchYawRoll || {};
  const rightRotation = right?.transform?.pitchYawRoll || {};
  return roundNumber(
    angleDeltaDegrees(leftRotation.x, rightRotation.x) +
      angleDeltaDegrees(leftRotation.y, rightRotation.y) +
      angleDeltaDegrees(leftRotation.z, rightRotation.z),
    3
  );
}

function movedPairCost(left, right) {
  const positionDistance = computePositionDistance(left, right);
  const rotationDeltaDegrees = computeRotationDeltaDegrees(left, right);
  const scaleDelta = Math.abs(extractScale(left) - extractScale(right));
  return positionDistance + (rotationDeltaDegrees * 0.35) + (scaleDelta * 32);
}

function buildElement(rawElement = {}, { side, mapUid }) {
  const kind = normalizeKind(rawElement.kind);
  const sourceInstanceId = toText(rawElement.instanceId || rawElement.elementId || `${kind.toLowerCase()}:unknown`);
  const metadata = normalizeMetadata(rawElement.metadata);

  return {
    instanceId: `${side}:${sourceInstanceId}`,
    typeId: toText(rawElement.typeId, "Unknown"),
    meshVariantKey: toText(rawElement.meshVariantKey),
    variant: maybeInteger(rawElement.variant),
    subVariant: maybeInteger(rawElement.subVariant),
    isGround: maybeBoolean(rawElement.isGround),
    blockVariantIndex: maybeInteger(rawElement.blockVariantIndex),
    mobilIndex: maybeInteger(rawElement.mobilIndex),
    mobilVariantIndex: maybeInteger(rawElement.mobilVariantIndex),
    kind,
    transform: {
      position: normalizeVec3(rawElement?.transform?.position, { digits: 3 }),
      pitchYawRoll: normalizeVec3(rawElement?.transform?.pitchYawRoll, { digits: 5 }),
    },
    waypointKind: normalizeWaypointKind(rawElement.waypointKind),
    metadata,
    sourceSide: side,
    sourceMapUid: mapUid,
    sourceInstanceId,
    diffKind: "matched",
    modelKey: "",
  };
}

function applyDiffTag(element, {
  diffKind,
  renderColorKey,
  pairedInstanceId = "",
  pairId = "",
  positionDistance = undefined,
  rotationDeltaDegrees = undefined,
} = {}) {
  const metadata = {
    ...(element.metadata || {}),
    diffKind: toText(diffKind),
    diffSide: toText(element.sourceSide),
    sourceMapUid: toText(element.sourceMapUid),
    sourceInstanceId: toText(element.sourceInstanceId),
    renderColorKey: toText(renderColorKey),
    renderGroupKey: toText(renderColorKey),
    modelKey: toText(element.modelKey),
  };

  if (pairedInstanceId) metadata.pairedInstanceId = toText(pairedInstanceId);
  if (pairId) metadata.pairId = toText(pairId);
  if (positionDistance !== undefined) metadata.positionDistance = String(roundNumber(positionDistance, 3));
  if (rotationDeltaDegrees !== undefined) metadata.rotationDeltaDegrees = String(roundNumber(rotationDeltaDegrees, 3));

  return {
    ...element,
    diffKind: toText(diffKind),
    pairInstanceId: pairedInstanceId || undefined,
    metadata,
  };
}

function pairExactMatches(targetElements, referenceElements) {
  const targetBuckets = new Map();
  const referenceBuckets = new Map();

  for (const element of targetElements) {
    const key = buildExactKey(element);
    if (!targetBuckets.has(key)) targetBuckets.set(key, []);
    targetBuckets.get(key).push(element);
  }

  for (const element of referenceElements) {
    const key = buildExactKey(element);
    if (!referenceBuckets.has(key)) referenceBuckets.set(key, []);
    referenceBuckets.get(key).push(element);
  }

  const matchedPairs = [];
  const remainingTarget = [];
  const remainingReference = [];
  const keys = new Set([...targetBuckets.keys(), ...referenceBuckets.keys()]);

  for (const key of keys) {
    const targetBucket = (targetBuckets.get(key) || []).slice().sort((left, right) =>
      left.instanceId.localeCompare(right.instanceId, "en")
    );
    const referenceBucket = (referenceBuckets.get(key) || []).slice().sort((left, right) =>
      left.instanceId.localeCompare(right.instanceId, "en")
    );
    const pairCount = Math.min(targetBucket.length, referenceBucket.length);

    for (let index = 0; index < pairCount; index += 1) {
      const target = targetBucket[index];
      const reference = referenceBucket[index];
      const pairId = `${target.instanceId}<->${reference.instanceId}`;
      matchedPairs.push({
        pairId,
        targetId: target.instanceId,
        referenceId: reference.instanceId,
        modelKey: target.modelKey,
      });
    }

    remainingTarget.push(...targetBucket.slice(pairCount));
    remainingReference.push(...referenceBucket.slice(pairCount));
  }

  return {
    matchedPairs,
    remainingTarget,
    remainingReference,
  };
}

function pairMovedMatches(targetElements, referenceElements) {
  const targetByModel = new Map();
  const referenceByModel = new Map();

  for (const element of targetElements) {
    if (!targetByModel.has(element.modelKey)) targetByModel.set(element.modelKey, []);
    targetByModel.get(element.modelKey).push(element);
  }

  for (const element of referenceElements) {
    if (!referenceByModel.has(element.modelKey)) referenceByModel.set(element.modelKey, []);
    referenceByModel.get(element.modelKey).push(element);
  }

  const movedPairs = [];
  const targetOnly = [];
  const referenceOnly = [];
  const modelKeys = new Set([...targetByModel.keys(), ...referenceByModel.keys()]);

  for (const modelKey of modelKeys) {
    const targets = targetByModel.get(modelKey) || [];
    const references = referenceByModel.get(modelKey) || [];

    if (!targets.length) {
      referenceOnly.push(...references);
      continue;
    }
    if (!references.length) {
      targetOnly.push(...targets);
      continue;
    }

    const candidatePairs = [];
    for (const target of targets) {
      for (const reference of references) {
        candidatePairs.push({
          target,
          reference,
          cost: movedPairCost(target, reference),
          positionDistance: computePositionDistance(target, reference),
          rotationDeltaDegrees: computeRotationDeltaDegrees(target, reference),
        });
      }
    }

    candidatePairs.sort((left, right) => {
      if (left.cost !== right.cost) return left.cost - right.cost;
      if (left.target.instanceId !== right.target.instanceId) {
        return left.target.instanceId.localeCompare(right.target.instanceId, "en");
      }
      return left.reference.instanceId.localeCompare(right.reference.instanceId, "en");
    });

    const usedTargetIds = new Set();
    const usedReferenceIds = new Set();
    for (const candidate of candidatePairs) {
      if (usedTargetIds.has(candidate.target.instanceId)) continue;
      if (usedReferenceIds.has(candidate.reference.instanceId)) continue;
      usedTargetIds.add(candidate.target.instanceId);
      usedReferenceIds.add(candidate.reference.instanceId);
      movedPairs.push({
        pairId: `${candidate.target.instanceId}<->${candidate.reference.instanceId}`,
        targetId: candidate.target.instanceId,
        referenceId: candidate.reference.instanceId,
        modelKey,
        positionDistance: roundNumber(candidate.positionDistance, 3),
        rotationDeltaDegrees: roundNumber(candidate.rotationDeltaDegrees, 3),
      });
    }

    targetOnly.push(...targets.filter((element) => !usedTargetIds.has(element.instanceId)));
    referenceOnly.push(...references.filter((element) => !usedReferenceIds.has(element.instanceId)));
  }

  return {
    movedPairs,
    targetOnly,
    referenceOnly,
  };
}

function buildMapInfo(map = {}, localFile = {}, parsedMap = {}) {
  return {
    mapUid: toText(map.mapUid || map.uid),
    name: toText(map.name || parsedMap.mapName || map.mapUid || map.uid, "Unknown map"),
    campaign: toText(map.campaign, "Unassigned") || "Unassigned",
    slot: Number(map.slot || 0) || null,
    localFile: {
      status: toText(localFile.status, "missing") || "missing",
      relativePath: toText(localFile.relativePath) || null,
      absolutePath: toText(localFile.absolutePath) || null,
      fileSizeBytes: Number(localFile.fileSizeBytes || 0) || null,
    },
  };
}

function normalizeLayoutElements(elements = [], options = {}) {
  return (Array.isArray(elements) ? elements : [])
    .map((element) => buildElement(element, options))
    .map((element) => ({
      ...element,
      modelKey: buildModelKey(element),
    }));
}

function buildMapViewerDiffPayload({
  targetMap = {},
  referenceMap = {},
  targetLocalFile = {},
  referenceLocalFile = {},
  targetLayout = {},
  referenceLayout = {},
} = {}) {
  const targetElements = normalizeLayoutElements(targetLayout?.elements, {
    side: "target",
    mapUid: toText(targetMap.mapUid || targetMap.uid),
  });
  const referenceElements = normalizeLayoutElements(referenceLayout?.elements, {
    side: "reference",
    mapUid: toText(referenceMap.mapUid || referenceMap.uid),
  });

  const exact = pairExactMatches(targetElements, referenceElements);
  const moved = pairMovedMatches(exact.remainingTarget, exact.remainingReference);

  const matchedTargetIds = new Set(exact.matchedPairs.map((pair) => pair.targetId));
  const matchedReferenceIds = new Set(exact.matchedPairs.map((pair) => pair.referenceId));
  const movedByTargetId = new Map(moved.movedPairs.map((pair) => [pair.targetId, pair]));
  const movedByReferenceId = new Map(moved.movedPairs.map((pair) => [pair.referenceId, pair]));
  const targetOnlyIds = new Set(moved.targetOnly.map((element) => element.instanceId));
  const referenceOnlyIds = new Set(moved.referenceOnly.map((element) => element.instanceId));

  const taggedTargetElements = targetElements.map((element) => {
    if (targetOnlyIds.has(element.instanceId)) {
      return applyDiffTag(element, {
        diffKind: "targetOnly",
        renderColorKey: "diff-target-only",
      });
    }

    const movedPair = movedByTargetId.get(element.instanceId);
    if (movedPair) {
      return applyDiffTag(element, {
        diffKind: "moved",
        renderColorKey: "diff-moved-target",
        pairedInstanceId: movedPair.referenceId,
        pairId: movedPair.pairId,
        positionDistance: movedPair.positionDistance,
        rotationDeltaDegrees: movedPair.rotationDeltaDegrees,
      });
    }

    if (matchedTargetIds.has(element.instanceId)) {
      const matchedPair = exact.matchedPairs.find((pair) => pair.targetId === element.instanceId) || null;
      return applyDiffTag(element, {
        diffKind: "matched",
        renderColorKey: "diff-matched",
        pairedInstanceId: matchedPair?.referenceId || "",
        pairId: matchedPair?.pairId || "",
      });
    }

    return applyDiffTag(element, {
      diffKind: "targetOnly",
      renderColorKey: "diff-target-only",
    });
  });

  const taggedReferenceElements = referenceElements.map((element) => {
    if (referenceOnlyIds.has(element.instanceId)) {
      return applyDiffTag(element, {
        diffKind: "referenceOnly",
        renderColorKey: "diff-reference-only",
      });
    }

    const movedPair = movedByReferenceId.get(element.instanceId);
    if (movedPair) {
      return applyDiffTag(element, {
        diffKind: "moved",
        renderColorKey: "diff-moved-reference",
        pairedInstanceId: movedPair.targetId,
        pairId: movedPair.pairId,
        positionDistance: movedPair.positionDistance,
        rotationDeltaDegrees: movedPair.rotationDeltaDegrees,
      });
    }

    if (matchedReferenceIds.has(element.instanceId)) {
      const matchedPair = exact.matchedPairs.find((pair) => pair.referenceId === element.instanceId) || null;
      return applyDiffTag(element, {
        diffKind: "matched",
        renderColorKey: "diff-matched",
        pairedInstanceId: matchedPair?.targetId || "",
        pairId: matchedPair?.pairId || "",
      });
    }

    return applyDiffTag(element, {
      diffKind: "referenceOnly",
      renderColorKey: "diff-reference-only",
    });
  });

  return {
    ok: true,
    schemaVersion: MAP_VIEWER_DIFF_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      key: "altered",
      label: "Altered",
    },
    targetMap: buildMapInfo(targetMap, targetLocalFile, targetLayout),
    referenceMap: buildMapInfo(referenceMap, referenceLocalFile, referenceLayout),
    elements: {
      target: taggedTargetElements,
      reference: taggedReferenceElements,
    },
    diff: {
      targetOnly: [...targetOnlyIds],
      referenceOnly: [...referenceOnlyIds],
      moved: moved.movedPairs,
      matched: exact.matchedPairs,
    },
    summary: {
      targetCount: targetElements.length,
      referenceCount: referenceElements.length,
      targetOnlyCount: targetOnlyIds.size,
      referenceOnlyCount: referenceOnlyIds.size,
      movedPairCount: moved.movedPairs.length,
      matchedPairCount: exact.matchedPairs.length,
    },
  };
}

export {
  MAP_VIEWER_DIFF_SCHEMA_VERSION,
  buildMapViewerDiffPayload,
};
