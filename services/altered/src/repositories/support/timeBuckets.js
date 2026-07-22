import { toEpochMs } from "../../../../shared/valueUtils.js";

function firstTimestamp(values = []) {
  for (const value of values) {
    const parsed = toEpochMs(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function startOfUtcBucket(epochMs, bucket) {
  const date = new Date(epochMs);
  if (bucket === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
  if (bucket === "week") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const mondayOffset = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    return start.getTime();
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
}

function formatBucketLabel(epochMs, bucket) {
  const iso = new Date(epochMs).toISOString();
  if (bucket === "month") return iso.slice(0, 7);
  if (bucket === "week") return `Wk of ${iso.slice(0, 10)}`;
  return iso.slice(0, 10);
}

export { firstTimestamp, formatBucketLabel, startOfUtcBucket };
