function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 1 && parsed <= 100) return Math.max(0, Math.min(1, parsed / 100));
  return Math.max(0, Math.min(1, parsed));
}

function confidenceLabel(score) {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  if (score > 0) return "low";
  return "unknown";
}

function normalizeRankedStyle(item, index) {
  if (typeof item === "string") {
    return {
      rank: index + 1,
      style: item,
      score: index === 0 ? 0.4 : 0.2,
    };
  }

  const style = String(item?.style ?? item?.name ?? item?.label ?? "unknown").trim() || "unknown";
  return {
    rank: Number.isInteger(item?.rank) ? item.rank : index + 1,
    style,
    score: clampScore(item?.score ?? item?.confidence ?? 0),
    evidence: Array.isArray(item?.evidence) ? item.evidence.filter(Boolean).slice(0, 8) : undefined,
  };
}

function normalizeRankedStyles(styles = []) {
  return (Array.isArray(styles) ? styles : [])
    .map(normalizeRankedStyle)
    .filter((item) => item.style)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.rank - right.rank;
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function normalizeConfidence(rawConfidence, rankedStyles = []) {
  if (typeof rawConfidence === "number") {
    const score = clampScore(rawConfidence);
    return { score, label: confidenceLabel(score) };
  }

  const score = clampScore(rawConfidence?.score ?? rawConfidence?.value ?? rankedStyles[0]?.score ?? 0);
  const label = String(rawConfidence?.label ?? rawConfidence?.status ?? "").trim();
  return {
    score,
    label: label || confidenceLabel(score),
  };
}

export { clampScore, confidenceLabel, normalizeConfidence, normalizeRankedStyles };
