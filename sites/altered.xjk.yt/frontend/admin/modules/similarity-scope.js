import { notifySimilarityUiChanged } from "./admin-events.js?v=2";
import { api } from "./api.js?v=2";
import {
  CAMPAIGN_LABEL_COLLATOR,
  NAMING_SIMILARITY_FALLBACK_CAMPAIGNS,
  NAMING_SIMILARITY_MONTH_OPTIONS,
  NAMING_SIMILARITY_SOURCE_OPTIONS,
  NAMING_SIMILARITY_TOTD_START_UTC,
  NAMING_SIMILARITY_WEEKLY_EPOCH_UTC,
  NAMING_SIMILARITY_WEEKLY_GRANDS_MIN_WEEK,
  SIMILARITY_RUNNING_GRACE_MS,
} from "./constants.js?v=2";
import { isNotFoundError } from "./request-errors.js?v=2";
import { state } from "./state.js?v=2";

function seasonOrdinal(season = "") {
  const normalized = String(season || "")
    .trim()
    .toLowerCase();
  if (normalized === "training") return 0;
  if (normalized === "winter") return 1;
  if (normalized === "spring") return 2;
  if (normalized === "summer") return 3;
  if (normalized === "fall" || normalized === "autumn") return 4;
  return 5;
}

function parseSeasonLabel(label = "") {
  const match = String(label || "")
    .trim()
    .match(/^(training|winter|spring|summer|fall|autumn)(?:\s+(\d{4}))?$/i);
  if (!match) return null;
  return {
    season: match[1],
    year: Number(match[2] || 0) || 0,
  };
}

function compareSeasonLabels(a = "", b = "") {
  const left = parseSeasonLabel(a);
  const right = parseSeasonLabel(b);
  if (left && right) {
    if (left.year !== right.year) return left.year - right.year;
    const seasonDiff = seasonOrdinal(left.season) - seasonOrdinal(right.season);
    if (seasonDiff !== 0) return seasonDiff;
  } else if (left || right) {
    return left ? -1 : 1;
  }
  return CAMPAIGN_LABEL_COLLATOR.compare(String(a || ""), String(b || ""));
}

function resolveCampaignGroupLabel(campaign = {}, sourceKey = "") {
  const normalizedSourceKey = String(sourceKey || "")
    .trim()
    .toLowerCase();
  if (!normalizedSourceKey) return "";

  if (normalizedSourceKey === "official-seasonal-v2") {
    return String(campaign?.season_label || campaign?.display_name || campaign?.name || "").trim();
  }

  if (normalizedSourceKey === "official-discovery") {
    return String(campaign?.season_label || campaign?.name || "").trim();
  }

  if (normalizedSourceKey === "official-competition") {
    return String(campaign?.name || campaign?.display_name || campaign?.season_label || "").trim();
  }

  return String(campaign?.name || campaign?.display_name || campaign?.season_label || "").trim();
}

export function getCampaignOptionsForSource(sourceKey = "") {
  const normalizedSourceKey = String(sourceKey || "")
    .trim()
    .toLowerCase();
  if (!normalizedSourceKey) return [["", "All Containers"]];

  const groupedOptions = new Map();
  const catalog = Array.isArray(state.campaignCatalog) ? state.campaignCatalog : [];

  catalog.forEach((campaign) => {
    const campaignSourceKey = String(
      campaign?.source_classification || campaign?.source_key || campaign?.sourceKey || ""
    )
      .trim()
      .toLowerCase();
    if (!campaignSourceKey || campaignSourceKey !== normalizedSourceKey) return;

    const label = resolveCampaignGroupLabel(campaign, normalizedSourceKey);
    if (!label) return;

    const groupKey = label.toLowerCase();
    const sortTimestampMs = Number(campaign?.sort_timestamp_ms || campaign?.sortTimestampMs || 0) || 0;
    const existing = groupedOptions.get(groupKey);
    if (!existing) {
      groupedOptions.set(groupKey, {
        value: label,
        label,
        sortTimestampMs,
      });
      return;
    }

    existing.sortTimestampMs =
      existing.sortTimestampMs > 0 && sortTimestampMs > 0
        ? Math.min(existing.sortTimestampMs, sortTimestampMs)
        : Math.max(existing.sortTimestampMs, sortTimestampMs);
    if (CAMPAIGN_LABEL_COLLATOR.compare(label, existing.label) < 0) {
      existing.value = label;
      existing.label = label;
    }
  });

  const options = [...groupedOptions.values()].sort((a, b) => {
    if (normalizedSourceKey === "official-seasonal-v2" || normalizedSourceKey === "official-legacy") {
      return compareSeasonLabels(a.label, b.label);
    }
    if (normalizedSourceKey === "official-discovery" || normalizedSourceKey === "official-competition") {
      const timestampDiff = Number(a.sortTimestampMs || 0) - Number(b.sortTimestampMs || 0);
      if (timestampDiff !== 0) return timestampDiff;
    }
    return CAMPAIGN_LABEL_COLLATOR.compare(a.label, b.label);
  });

  const fallbackOptions = Array.isArray(NAMING_SIMILARITY_FALLBACK_CAMPAIGNS[normalizedSourceKey])
    ? NAMING_SIMILARITY_FALLBACK_CAMPAIGNS[normalizedSourceKey]
    : [];
  if (!options.length && fallbackOptions.length) {
    return [["", "All Containers"], ...fallbackOptions.map((label) => [label, label])];
  }

  if (fallbackOptions.length) {
    const existingKeys = new Set(options.map((option) => String(option.value || "").toLowerCase()));
    const mergedOptions = [
      ...options,
      ...fallbackOptions
        .filter((label) => !existingKeys.has(String(label || "").toLowerCase()))
        .map((label) => ({ value: label, label })),
    ];
    return [["", "All Containers"], ...mergedOptions.map((option) => [option.value, option.label])];
  }

  return [["", "All Containers"], ...options.map((option) => [option.value, option.label])];
}

function getSimilarityCatalogRowsForSource(sourceKey = "") {
  const normalizedSourceKey = String(sourceKey || "")
    .trim()
    .toLowerCase();
  if (!normalizedSourceKey || !Array.isArray(state.campaignCatalog)) return [];
  return state.campaignCatalog.filter((campaign) => {
    const campaignSourceKey = String(
      campaign?.source_classification || campaign?.source_key || campaign?.sourceKey || ""
    )
      .trim()
      .toLowerCase();
    return campaignSourceKey === normalizedSourceKey;
  });
}

function parseTotdCatalogEntry(campaign = {}) {
  const name = String(campaign?.name || "").trim();
  let match = name.match(/^TOTD\s+(?<year>\d{4})-(?<month>\d{1,2})$/i);
  if (match?.groups) {
    return {
      year: Number(match.groups.year || 0) || 0,
      month: Number(match.groups.month || 0) || 0,
      day: 0,
      label: name,
    };
  }

  match = name.match(/^(?<day>\d{1,2})\/(?<month>\d{1,2})\/(?<year>\d{4})(?:\s+.+)?$/i);
  if (match?.groups) {
    return {
      year: Number(match.groups.year || 0) || 0,
      month: Number(match.groups.month || 0) || 0,
      day: Number(match.groups.day || 0) || 0,
      label: name,
    };
  }

  return null;
}

function getTotdParsedEntries() {
  return getSimilarityCatalogRowsForSource("official-totd")
    .map((campaign) => parseTotdCatalogEntry(campaign))
    .filter((entry) => entry && entry.year && entry.month);
}

function getNamingSimilarityCurrentUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getTotdStartDateUtc() {
  return new Date(NAMING_SIMILARITY_TOTD_START_UTC);
}

function getDaysInUtcMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getWeeklyMaxWeek() {
  const today = getNamingSimilarityCurrentUtcDate();
  const diffDays = Math.floor((today.getTime() - NAMING_SIMILARITY_WEEKLY_EPOCH_UTC) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 0;
}

function getWeeklyEntriesForSource(sourceKey = "") {
  const normalizedSourceKey = String(sourceKey || "")
    .trim()
    .toLowerCase();
  const minWeek = normalizedSourceKey === "weekly-grands" ? NAMING_SIMILARITY_WEEKLY_GRANDS_MIN_WEEK : 1;
  const maxWeek = getWeeklyMaxWeek();
  const entries = [];
  for (let week = minWeek; week <= maxWeek; week += 1) {
    const startUtcMs = NAMING_SIMILARITY_WEEKLY_EPOCH_UTC + (week - 1) * 7 * 24 * 60 * 60 * 1000;
    const startDate = new Date(startUtcMs);
    entries.push({
      week,
      year: startDate.getUTCFullYear(),
      startDate,
    });
  }
  return entries;
}

export function getSeasonalYearOptions() {
  const endYear = Math.max(2020, getNamingSimilarityCurrentUtcDate().getUTCFullYear());
  const years = [];
  for (let year = 2020; year <= endYear; year += 1) {
    years.push([String(year), String(year)]);
  }
  return [["", "All Years"], ...years];
}

export function getTotdYearOptions() {
  const startYear = getTotdStartDateUtc().getUTCFullYear();
  const endYear = Math.max(startYear, getNamingSimilarityCurrentUtcDate().getUTCFullYear());
  const years = [];
  for (let year = startYear; year <= endYear; year += 1) {
    years.push([String(year), String(year)]);
  }
  return [["", "All Years"], ...years];
}

export function getTotdMonthOptions(yearValue = "") {
  const year = Number(yearValue || 0) || 0;
  if (!year) return NAMING_SIMILARITY_MONTH_OPTIONS;
  const startDate = getTotdStartDateUtc();
  const today = getNamingSimilarityCurrentUtcDate();
  if (year < startDate.getUTCFullYear() || year > today.getUTCFullYear()) {
    return [["", "All Months"]];
  }
  const startMonth = year === startDate.getUTCFullYear() ? startDate.getUTCMonth() + 1 : 1;
  const endMonth = year === today.getUTCFullYear() ? today.getUTCMonth() + 1 : 12;
  const months = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    const monthKey = String(month).padStart(2, "0");
    months.push([monthKey, NAMING_SIMILARITY_MONTH_OPTIONS.find(([value]) => value === monthKey)?.[1] || monthKey]);
  }
  return [["", "All Months"], ...months];
}

export function getTotdDayOptions(yearValue = "", monthValue = "") {
  const year = Number(yearValue || 0) || 0;
  const month = Number(monthValue || 0) || 0;
  if (!year || !month) return [["", "All Days"]];
  const startDate = getTotdStartDateUtc();
  const today = getNamingSimilarityCurrentUtcDate();
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month - 1, getDaysInUtcMonth(year, month)));
  if (monthEnd < startDate || monthStart > today) {
    return [["", "All Days"]];
  }
  const startDay =
    year === startDate.getUTCFullYear() && month === startDate.getUTCMonth() + 1 ? startDate.getUTCDate() : 1;
  const endDay =
    year === today.getUTCFullYear() && month === today.getUTCMonth() + 1
      ? today.getUTCDate()
      : getDaysInUtcMonth(year, month);
  const days = [];
  for (let day = startDay; day <= endDay; day += 1) {
    const dayKey = String(day).padStart(2, "0");
    days.push([dayKey, dayKey]);
  }
  return [["", "All Days"], ...days];
}

export function getWeeklyYearOptions(sourceKey = "") {
  const years = [...new Set(getWeeklyEntriesForSource(sourceKey).map((entry) => entry.year))].sort((a, b) => a - b);
  return [["", "All Years"], ...years.map((year) => [String(year), String(year)])];
}

export function getWeeklyWeekOptions(sourceKey = "", yearValue = "") {
  const year = Number(yearValue || 0) || 0;
  const weeks = getWeeklyEntriesForSource(sourceKey)
    .filter((entry) => !year || entry.year === year)
    .map((entry) => entry.week);
  return [["", "All Weeks"], ...weeks.map((week) => [String(week), `Week ${String(week).padStart(2, "0")}`])];
}

export function isWeeklySourceKey(sourceKey = "") {
  const normalizedSourceKey = String(sourceKey || "")
    .trim()
    .toLowerCase();
  return normalizedSourceKey === "weekly-shorts" || normalizedSourceKey === "weekly-grands";
}

export function optionListHasValue(options = [], value = "") {
  return !String(value || "").trim() || options.some(([optionValue]) => String(optionValue) === String(value));
}

export function getNamingSimilarityScopeError() {
  const sourceKey = String(state.namingSimilaritySourceKey || "")
    .trim()
    .toLowerCase();
  if (isWeeklySourceKey(sourceKey)) {
    const weekValue = String(state.namingSimilarityWeek || "").trim();
    if (!weekValue) return "";
    const validWeekOptions = getWeeklyWeekOptions(sourceKey, state.namingSimilarityYear || "");
    if (!optionListHasValue(validWeekOptions, weekValue)) {
      const label =
        NAMING_SIMILARITY_SOURCE_OPTIONS.find(([value]) => value === sourceKey)?.[1] || "the selected source";
      return `Week ${weekValue} is not valid for ${label}.`;
    }
  }
  return "";
}

export function resetNamingSimilarityScopedSelections() {
  state.namingSimilaritySeason = "";
  state.namingSimilarityYear = "";
  state.namingSimilarityMonth = "";
  state.namingSimilarityDay = "";
  state.namingSimilarityWeek = "";
}

export function deriveNamingSimilarityCampaignName() {
  const sourceKey = String(state.namingSimilaritySourceKey || "")
    .trim()
    .toLowerCase();

  if (sourceKey === "official-seasonal-v2") {
    const season = String(state.namingSimilaritySeason || "").trim();
    const year = String(state.namingSimilarityYear || "").trim();
    if (season.toLowerCase() === "winter" && year === "2020") {
      state.namingSimilaritySourceKey = "official-legacy";
      resetNamingSimilarityScopedSelections();
      state.namingSimilarityCampaignName = "Training";
      return state.namingSimilarityCampaignName;
    }
    state.namingSimilarityCampaignName = season && year ? `${season} ${year}` : season || year || "";
    return state.namingSimilarityCampaignName;
  }

  if (sourceKey === "official-totd") {
    const year = String(state.namingSimilarityYear || "").trim();
    const month = String(state.namingSimilarityMonth || "").trim();
    const day = String(state.namingSimilarityDay || "").trim();
    if (!year) {
      state.namingSimilarityCampaignName = "";
      return state.namingSimilarityCampaignName;
    }
    if (month && day) {
      state.namingSimilarityCampaignName = `${day}/${month}/${year}`;
      return state.namingSimilarityCampaignName;
    }
    if (month) {
      const hasDayEntries = getTotdParsedEntries().some(
        (entry) => entry.day && String(entry.year) === year && String(entry.month).padStart(2, "0") === month
      );
      const hasMonthEntries = getTotdParsedEntries().some(
        (entry) => !entry.day && String(entry.year) === year && String(entry.month).padStart(2, "0") === month
      );
      state.namingSimilarityCampaignName =
        hasMonthEntries || !hasDayEntries ? `TOTD ${year}-${month}` : `/${month}/${year}`;
      return state.namingSimilarityCampaignName;
    }
    state.namingSimilarityCampaignName = year;
    return state.namingSimilarityCampaignName;
  }

  if (sourceKey === "weekly-shorts" || sourceKey === "weekly-grands") {
    const year = String(state.namingSimilarityYear || "").trim();
    const week = String(state.namingSimilarityWeek || "").trim();
    if (week) {
      state.namingSimilarityCampaignName = sourceKey === "weekly-grands" ? `Week Grand ${week}` : `Week ${week}`;
      return state.namingSimilarityCampaignName;
    }
    state.namingSimilarityCampaignName = year || "";
    return state.namingSimilarityCampaignName;
  }

  return state.namingSimilarityCampaignName;
}

export function syncNamingSimilarityCampaignSelects() {
  const options = getCampaignOptionsForSource(state.namingSimilaritySourceKey || "");
  const normalizedSourceKey = String(state.namingSimilaritySourceKey || "")
    .trim()
    .toLowerCase();
  const usesStructuredScope =
    normalizedSourceKey === "official-seasonal-v2" ||
    normalizedSourceKey === "official-totd" ||
    normalizedSourceKey === "weekly-shorts" ||
    normalizedSourceKey === "weekly-grands";
  const selectedCampaignName = usesStructuredScope
    ? String(state.namingSimilarityCampaignName || "")
    : options.some(([value]) => String(value) === String(state.namingSimilarityCampaignName || ""))
      ? String(state.namingSimilarityCampaignName || "")
      : "";
  state.namingSimilarityCampaignName = selectedCampaignName;
  notifySimilarityUiChanged({ source: "scope-controls" });
}

function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isSimilarityBackfillEffectivelyRunning(status = state.similarityBackfill) {
  if (state.busy.has("naming-similarity")) return true;
  if (!status) return false;
  if (status.running) return true;

  const progress = status.progress || {};
  const progressState = String(progress.status || "")
    .trim()
    .toLowerCase();
  const recentUpdateMs = parseTimestampMs(progress.updatedAt || status.lastStartedAt);
  const hasRecentRunningProgress =
    progressState === "running" && recentUpdateMs > 0 && Date.now() - recentUpdateMs <= SIMILARITY_RUNNING_GRACE_MS;

  return hasRecentRunningProgress;
}

function mergeSimilarityBackfillStatus(previousStatus, nextStatus) {
  if (!nextStatus || typeof nextStatus !== "object") return previousStatus || nextStatus;
  if (!previousStatus || typeof previousStatus !== "object") return nextStatus;

  const nextProgress = nextStatus.progress || {};
  const nextProgressState = String(nextProgress.status || "")
    .trim()
    .toLowerCase();
  const nextTerminal =
    nextProgress.complete === true ||
    nextProgressState === "ok" ||
    nextProgressState === "error" ||
    Boolean(nextStatus.lastFinishedAt) ||
    Boolean(nextStatus.lastSummary) ||
    Boolean(nextStatus.lastError);
  if (nextTerminal) return nextStatus;

  const nextRunning = isSimilarityBackfillEffectivelyRunning(nextStatus);
  if (nextRunning) return nextStatus;

  const previousRunning = isSimilarityBackfillEffectivelyRunning(previousStatus);
  if (!previousRunning) return nextStatus;

  const mergedProgress = {
    ...(previousStatus.progress || {}),
    ...(nextStatus.progress || {}),
    counters: {
      ...((previousStatus.progress && previousStatus.progress.counters) || {}),
      ...((nextStatus.progress && nextStatus.progress.counters) || {}),
    },
  };

  return {
    ...previousStatus,
    ...nextStatus,
    running: true,
    currentRunId: nextStatus.currentRunId || previousStatus.currentRunId || null,
    currentReason: nextStatus.currentReason || previousStatus.currentReason || null,
    progress: mergedProgress,
    lastStartedAt: nextStatus.lastStartedAt || previousStatus.lastStartedAt || null,
    lastFinishedAt: nextStatus.lastFinishedAt || previousStatus.lastFinishedAt || null,
    lastSummary: nextStatus.lastSummary || previousStatus.lastSummary || null,
    lastError: nextStatus.lastError || previousStatus.lastError || null,
  };
}

export async function loadNamingSimilarityBackfillStatus() {
  if (state.similarityBackfillStatusPromise) return state.similarityBackfillStatusPromise;
  const requestPromise = (async () => {
    try {
      const nextStatus = await api("/api/v1/admin/naming/similarity/backfill/status");
      state.similarityBackfill = mergeSimilarityBackfillStatus(state.similarityBackfill, nextStatus);
      state.similarityBackfillStatusSupported = true;
      notifySimilarityUiChanged({ source: "status-load" });
      return state.similarityBackfill;
    } catch (error) {
      if (isNotFoundError(error)) {
        state.similarityBackfillStatusSupported = false;
        return state.similarityBackfill;
      }
      throw error;
    }
  })();
  state.similarityBackfillStatusPromise = requestPromise;
  try {
    return await requestPromise;
  } finally {
    if (state.similarityBackfillStatusPromise === requestPromise) {
      state.similarityBackfillStatusPromise = null;
    }
  }
}
