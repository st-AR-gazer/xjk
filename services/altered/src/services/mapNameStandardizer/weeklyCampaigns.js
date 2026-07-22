import { normalizeAliasValue, normalizeWhitespace, toText } from "./baseText.js";
import {
  CANONICAL_WEEKLY_SHORTS_WEEKS,
  WEEKLY_SHORTS_BY_TITLE,
  WEEKLY_SHORTS_BY_WEEK_AND_POSITION,
} from "./standardizerData.js";
import { normalizeMapNumber, sanitizeMapName } from "./normalization.js";

function extractWeeklyShortsWeek(value) {
  const text = normalizeWhitespace(toText(value));
  if (!text) return null;
  const match = text.match(/\bweek\s*0*(?<week>\d{1,3})\b/i);
  if (!match?.groups?.week) return null;
  return normalizeMapNumber(match.groups.week);
}

function resolveWeeklyShortsWeek({ campaignName = "", campaignPayload = null, mapPayload = null } = {}) {
  const payloads = [
    campaignPayload && typeof campaignPayload === "object" ? campaignPayload : null,
    mapPayload && typeof mapPayload === "object" ? mapPayload : null,
  ].filter(Boolean);

  for (const payload of payloads) {
    const direct = normalizeMapNumber(
      payload?.week ??
        payload?.campaign?.week ??
        payload?.campaignMetadata?.week ??
        payload?.weeklyShorts?.week ??
        payload?.weekly_shorts?.week
    );
    if (direct) return direct;
  }

  return extractWeeklyShortsWeek(campaignName);
}

function resolveCanonicalWeeklyShortsWeek(week) {
  const normalizedWeek = normalizeMapNumber(week);
  if (!normalizedWeek) return null;
  return CANONICAL_WEEKLY_SHORTS_WEEKS.get(normalizedWeek) || null;
}

function extractWeeklyGrandWeek(value) {
  const text = normalizeWhitespace(toText(value));
  if (!text) return null;
  const match = text.match(/\bweek\s*grand(?:s)?\s*0*(?<week>\d{1,3})\b/i);
  if (!match?.groups?.week) return null;
  return normalizeMapNumber(match.groups.week);
}

function resolveWeeklyGrandWeek({ campaignName = "", campaignPayload = null, mapPayload = null } = {}) {
  const payloads = [
    campaignPayload && typeof campaignPayload === "object" ? campaignPayload : null,
    mapPayload && typeof mapPayload === "object" ? mapPayload : null,
  ].filter(Boolean);

  for (const payload of payloads) {
    const direct = normalizeMapNumber(
      payload?.week ??
        payload?.campaign?.week ??
        payload?.campaignMetadata?.week ??
        payload?.weeklyGrand?.week ??
        payload?.weekly_grand?.week
    );
    if (direct) return direct;
  }

  return extractWeeklyGrandWeek(campaignName);
}

function normalizeWeeklyShortsTitle(value = "") {
  return normalizeAliasValue(sanitizeMapName(toText(value).replace(/\.map\.gbx$/i, "")));
}

function resolveWeeklyShortsEntry({
  campaignName = "",
  campaignPayload = null,
  mapPayload = null,
  slot = null,
  mapName = "",
  filename = "",
} = {}) {
  const week = resolveWeeklyShortsWeek({ campaignName, campaignPayload, mapPayload });
  const canonicalWeek = resolveCanonicalWeeklyShortsWeek(week);
  const normalizedSlot = normalizeMapNumber(slot);
  if (week && !canonicalWeek) {
    return null;
  }
  if (week && normalizedSlot) {
    const bySlot = WEEKLY_SHORTS_BY_WEEK_AND_POSITION.get(`${week}:${normalizedSlot}`);
    if (bySlot) {
      return {
        ...bySlot,
        canonicalWeek,
        source: "weekly-shorts-slot",
      };
    }
  }

  const titleCandidates = [mapName, filename].map((value) => normalizeWeeklyShortsTitle(value)).filter(Boolean);
  for (const candidate of titleCandidates) {
    const byTitle = WEEKLY_SHORTS_BY_TITLE.get(candidate);
    if (week && byTitle && Number(byTitle.week || 0) !== Number(week || 0)) {
      continue;
    }
    if (byTitle) {
      return {
        ...byTitle,
        canonicalWeek: resolveCanonicalWeeklyShortsWeek(byTitle.week),
        source: "weekly-shorts-title",
      };
    }
  }

  return null;
}

export {
  normalizeWeeklyShortsTitle,
  resolveCanonicalWeeklyShortsWeek,
  resolveWeeklyGrandWeek,
  resolveWeeklyShortsEntry,
  resolveWeeklyShortsWeek,
};
