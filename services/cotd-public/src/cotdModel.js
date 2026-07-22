import { normalizeConfidence, normalizeRankedStyles } from "./classificationNormalization.js";
import { utcNowIso } from "../../shared/valueUtils.js";

function todayDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function asTrimmedString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asNullableString(value) {
  const text = asTrimmedString(value);
  return text || null;
}

function asDateString(value, fallback = todayDateIso()) {
  const text = asTrimmedString(value);
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString().slice(0, 10);
}

function normalizeWarnings(...sets) {
  const out = [];
  for (const set of sets) {
    if (!Array.isArray(set)) continue;
    for (const item of set) {
      const text = asTrimmedString(item);
      if (text && !out.includes(text)) {
        out.push(text);
      }
    }
  }
  return out;
}

function normalizeCotdMetadata(input = {}) {
  const source = input.cotd || input.currentCotd || input.map || input;
  const author =
    source.author && typeof source.author === "object"
      ? source.author
      : source.mapper && typeof source.mapper === "object"
        ? source.mapper
        : {};
  const startedAt = source.startedAt ?? source.started_at ?? source.startDate ?? source.start_date ?? source.releasedAt;
  return {
    cotdDate: asDateString(
      source.cotdDate ??
        source.cotd_date ??
        source.totdDate ??
        source.totd_date ??
        source.trackOfTheDayDate ??
        source.track_of_the_day_date ??
        source.date ??
        startedAt
    ),
    competitionId: asNullableString(source.competitionId ?? source.competition_id),
    mapUid: asNullableString(source.mapUid ?? source.mapUID ?? source.map_uid ?? source.uid),
    mapName: asTrimmedString(
      source.mapName ?? source.map_name ?? source.trackName ?? source.track_name ?? source.name,
      "Demo COTD map"
    ),
    authorName: asTrimmedString(
      source.authorName ??
        source.author_name ??
        source.mapperName ??
        source.mapper_name ??
        author.name ??
        author.displayName ??
        author.display_name ??
        (typeof source.author === "string" ? source.author : "") ??
        (typeof source.mapper === "string" ? source.mapper : ""),
      "Unknown mapper"
    ),
    authorAccountId: asNullableString(
      source.authorAccountId ?? source.author_account_id ?? author.accountId ?? author.account_id
    ),
    thumbnailUrl: asNullableString(
      source.thumbnailUrl ??
        source.thumbnail_url ??
        source.imageUrl ??
        source.image_url ??
        source.thumbnail ??
        source.image
    ),
    trackId: asNullableString(source.trackId ?? source.track_id),
    startedAt: asNullableString(startedAt),
    endedAt: asNullableString(source.endedAt ?? source.ended_at),
  };
}

function normalizeRecord(record, index) {
  return {
    rank: Number.isInteger(record?.rank) ? record.rank : index + 1,
    playerName: asTrimmedString(record?.playerName ?? record?.player_name ?? record?.name, "Unknown player"),
    accountId: asNullableString(record?.accountId ?? record?.account_id),
    timeMs: Number.isFinite(Number(record?.timeMs ?? record?.time_ms))
      ? Number(record?.timeMs ?? record?.time_ms)
      : null,
    replayUrl: asNullableString(record?.replayUrl ?? record?.replay_url),
    evidenceUrl: asNullableString(record?.evidenceUrl ?? record?.evidence_url),
    verified: Boolean(record?.verified),
  };
}

function normalizeRecords(input = {}) {
  const rawRecords = input.records || input.topRecords || input.top_records || input.evidence?.records || [];
  return (Array.isArray(rawRecords) ? rawRecords : []).map(normalizeRecord).slice(0, 10);
}

function summarizeEvidence(input = {}, records = []) {
  const evidence = input.evidenceSummary || input.evidence_summary || input.evidence || {};
  const replayCount = Number.isFinite(Number(evidence.replayCount ?? evidence.replay_count))
    ? Number(evidence.replayCount ?? evidence.replay_count)
    : records.filter((record) => record.replayUrl || record.evidenceUrl).length;
  const recordCount = Number.isFinite(Number(evidence.recordCount ?? evidence.record_count))
    ? Number(evidence.recordCount ?? evidence.record_count)
    : records.length;

  return {
    source: asTrimmedString(evidence.source, input.source === "demo" ? "demo" : "manual"),
    recordCount,
    replayCount,
    signals: Array.isArray(evidence.signals)
      ? evidence.signals
          .map((signal) => {
            const rawWeight = signal?.weight;
            const hasWeight = rawWeight !== null && rawWeight !== undefined && String(rawWeight).trim() !== "";
            return {
              label: asTrimmedString(signal?.label ?? signal?.name),
              value: asTrimmedString(signal?.value ?? signal?.description),
              weight: hasWeight && Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : null,
            };
          })
          .filter((signal) => signal.label || signal.value)
          .slice(0, 12)
      : [],
    notes: Array.isArray(evidence.notes) ? evidence.notes.map(asTrimmedString).filter(Boolean).slice(0, 12) : [],
  };
}

function normalizeClassifier(input = {}, classification = {}) {
  const classifier = input.classifier || classification.classifier || {};
  return {
    mode: asTrimmedString(classifier.mode, input.source === "demo" ? "stub" : "manual"),
    provider: asTrimmedString(classifier.provider, "trackmania-map-classifier"),
    model: asTrimmedString(classifier.model, "generalized-map-style"),
    version: asNullableString(classifier.version),
    generatedAt: asTrimmedString(
      classifier.generatedAt ?? classifier.generated_at,
      classification.generatedAt || utcNowIso()
    ),
    baseUrlConfigured: Boolean(classifier.baseUrlConfigured ?? classifier.base_url_configured),
  };
}

function createSnapshotId(cotd) {
  const date = asTrimmedString(cotd.cotdDate, todayDateIso());
  const mapUid = asTrimmedString(cotd.mapUid, "unknown-map").replace(/[^A-Za-z0-9_-]/g, "-");
  return `${date}:${mapUid}`;
}

function normalizeSnapshot(input = {}, { classification = null, source = "manual" } = {}) {
  const nowIso = utcNowIso();
  const cotd = normalizeCotdMetadata(input);
  const records = normalizeRecords(input);
  const stylesFromInput = input.rankedStyles || input.ranked_styles || input.classification?.rankedStyles || [];
  const rankedStyles = normalizeRankedStyles(
    stylesFromInput.length ? stylesFromInput : classification?.rankedStyles || []
  );
  const normalizedRankedStyles = rankedStyles.length
    ? rankedStyles
    : normalizeRankedStyles([{ style: "unknown", score: 0 }]);
  const confidence = normalizeConfidence(
    input.confidence || input.classification?.confidence || classification?.confidence,
    normalizedRankedStyles
  );
  const evidenceSummary = summarizeEvidence({ ...input, source }, records);
  const classifier = normalizeClassifier({ ...input, source }, classification || {});
  const statusFallback = source === "demo" ? "demo" : classification ? "classified" : "pending_classifier";
  const status = asTrimmedString(
    input.status || input.classification?.status || classification?.status,
    statusFallback
  );
  const generatedAt = asTrimmedString(
    input.generatedAt ?? input.generated_at ?? classification?.classifier?.generatedAt,
    nowIso
  );
  const updatedAt = asTrimmedString(input.updatedAt ?? input.updated_at, nowIso);

  return {
    id: asTrimmedString(input.id, createSnapshotId(cotd)),
    apiVersion: "v1",
    source,
    status,
    cotd,
    rankedStyles: normalizedRankedStyles,
    confidence,
    evidenceSummary,
    classifier,
    records,
    generatedAt,
    updatedAt,
    warnings: normalizeWarnings(
      input.warnings,
      classification?.warnings,
      source === "demo"
        ? ["Demo payload. Replace through /api/v1/admin/ingest when real COTD evidence is available."]
        : []
    ),
    raw: input.raw || input.debug || input.classification?.raw || classification?.raw || null,
  };
}

function buildDemoSnapshot(classification = null) {
  return normalizeSnapshot(
    {
      id: `demo:${todayDateIso()}`,
      source: "demo",
      status: "demo",
      cotd: {
        cotdDate: todayDateIso(),
        mapUid: "demo-cotd-map",
        mapName: "Demo Cup of the Day",
        authorName: "COTD service stub",
      },
      evidenceSummary: {
        source: "demo",
        recordCount: 0,
        replayCount: 0,
        signals: [
          {
            label: "Ingest",
            value: "Waiting for COTD map, top records, replays, and classifier evidence.",
            weight: null,
          },
        ],
        notes: ["No live Nadeo/Openplanet/classifier integration is configured in this skeleton."],
      },
    },
    {
      classification,
      source: "demo",
    }
  );
}

function buildPendingTotdSnapshot(input = {}, { warnings = [] } = {}) {
  return normalizeSnapshot(
    {
      ...input,
      status: input.status || "pending_classifier",
      warnings: normalizeWarnings(input.warnings, warnings, [
        "TOTD map metadata is stored, but classifier output has not been attached yet.",
      ]),
    },
    {
      source: "totd-fetch",
    }
  );
}

function sanitizeSnapshot(snapshot, { includeRaw = false } = {}) {
  if (!snapshot) return null;
  const publicSnapshot = JSON.parse(JSON.stringify(snapshot));
  if (!includeRaw) {
    delete publicSnapshot.raw;
  }
  return publicSnapshot;
}

export { buildDemoSnapshot, buildPendingTotdSnapshot, normalizeSnapshot, sanitizeSnapshot };
