import { toInteger, toNullableIso, toTextOrFallback, utcNowIso } from "../../shared/valueUtils.js";

function dateFromParts({ year, month, monthDay, startTimestamp }, now = Date.now) {
  const validParts =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(monthDay) &&
    year > 2000 &&
    month >= 1 &&
    month <= 12 &&
    monthDay >= 1 &&
    monthDay <= 31;
  if (validParts) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(monthDay).padStart(2, "0")}`;
  }
  return (toNullableIso(startTimestamp) || utcNowIso(now)).slice(0, 10);
}

function dayIdFor({ cotdDate, mapUid }) {
  return `${cotdDate}:${mapUid}`;
}

function normalizeTotdDay(input = {}, { now = Date.now } = {}) {
  const year = toInteger(input.year);
  const month = toInteger(input.month);
  const monthDay = toInteger(input.monthDay ?? input.month_day);
  const startTimestamp = toInteger(input.startTimestamp ?? input.start_timestamp);
  const endTimestamp = toInteger(input.endTimestamp ?? input.end_timestamp);
  const mapUid = toTextOrFallback(input.mapUid ?? input.map_uid);
  const cotdDate = toTextOrFallback(
    input.cotdDate ?? input.cotd_date,
    dateFromParts({ year, month, monthDay, startTimestamp }, now)
  );

  return {
    id: toTextOrFallback(input.id, dayIdFor({ cotdDate, mapUid })),
    cotdDate,
    year,
    month,
    day: toInteger(input.day),
    monthDay,
    campaignId: toInteger(input.campaignId ?? input.campaign_id),
    mapUid,
    seasonUid: toTextOrFallback(input.seasonUid ?? input.season_uid) || null,
    leaderboardGroup: toTextOrFallback(input.leaderboardGroup ?? input.leaderboard_group) || null,
    startTimestamp,
    endTimestamp,
    startAt: toTextOrFallback(input.startAt ?? input.start_at) || toNullableIso(startTimestamp),
    endAt: toTextOrFallback(input.endAt ?? input.end_at) || toNullableIso(endTimestamp),
    raw: input.raw || input,
  };
}

function flattenTotdMonths(payload = {}, options) {
  const monthList = Array.isArray(payload.monthList) ? payload.monthList : [];
  return monthList.flatMap((monthEntry) => {
    const days = Array.isArray(monthEntry?.days) ? monthEntry.days : [];
    return days
      .map((day) =>
        normalizeTotdDay(
          {
            ...day,
            year: monthEntry.year,
            month: monthEntry.month,
            raw: day,
          },
          options
        )
      )
      .filter((day) => day.mapUid);
  });
}

export { dateFromParts, dayIdFor, flattenTotdMonths, normalizeTotdDay };
