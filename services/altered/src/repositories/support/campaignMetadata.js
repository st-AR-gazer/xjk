import { clampInt, parseJsonSafe, toNullableIso, toText, uniqueBy } from "../../../../shared/valueUtils.js";
import { slugifyText, splitGroupedValues, uniqueTexts } from "../../domain/inputNormalization.js";
import { parseCampaignStandardizedFields } from "../../services/mapNameStandardizer.js";
import { firstTimestamp } from "./timeBuckets.js";

const ALTERATION_VALUE_SEPARATOR = "\u001f";

function extractRowAlterations(row = {}) {
  const preset = Array.isArray(row?.alterations) ? row.alterations : [];
  if (preset.length) {
    return uniqueBy(
      preset
        .map((item) => ({
          id: Number(item?.id || item?.alterationId || 0) || null,
          name: toText(item?.name),
          slug: slugifyText(item?.slug || item?.name, item?.name),
        }))
        .filter((item) => item.name),
      (item) => item.slug
    );
  }

  const ids = String(
    row?.alterationIdsCsv || row?.alteration_ids_csv || row?.alterationIds || row?.alteration_ids || ""
  )
    .split(",")
    .map((item) => clampInt(item, { min: 1, max: 2147483647, fallback: 0 }) || null);
  const names = splitGroupedValues(
    row?.alterationNamesCsv || row?.alteration_names_csv || row?.alterationNames || "",
    ALTERATION_VALUE_SEPARATOR
  );
  const slugs = splitGroupedValues(
    row?.alterationSlugsCsv || row?.alteration_slugs_csv || row?.alterationSlugs || "",
    ALTERATION_VALUE_SEPARATOR
  );
  const total = Math.max(ids.length, names.length, slugs.length);
  const out = [];
  for (let index = 0; index < total; index += 1) {
    const name = toText(names[index]);
    if (!name) continue;
    out.push({ id: ids[index] || null, name, slug: slugifyText(slugs[index] || name, name) });
  }
  return uniqueBy(out, (item) => item.slug);
}

function normalizeCampaignStorageName(name, externalCampaignId = null) {
  const base = String(name || "").trim();
  if (!base) return "";
  const suffixId = clampInt(externalCampaignId, { min: 1, max: 2147483647, fallback: 0 });
  if (!suffixId) return base;
  const suffix = ` [${suffixId}]`;
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function inferSeasonFromName(value) {
  const name = String(value || "").toLowerCase();
  if (name.includes("winter")) return "Winter";
  if (name.includes("spring")) return "Spring";
  if (name.includes("summer")) return "Summer";
  if (name.includes("fall") || name.includes("autumn")) return "Fall";
  return "Other";
}

function inferSeasonWindowFromTimestamp(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  const date = new Date(epochMs);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  let season = "Fall";
  if (month <= 2) season = "Winter";
  else if (month <= 5) season = "Spring";
  else if (month <= 8) season = "Summer";
  return { season, year, label: `${season} ${year}`, key: `${season.toLowerCase()}-${year}` };
}

function deriveCampaignOrdering(row) {
  const payload = parseJsonSafe(row?.payloadJson, {}) || {};
  const campaignPayload = payload?.campaign && typeof payload.campaign === "object" ? payload.campaign : {};
  const sortTimestampMs = firstTimestamp([
    campaignPayload?.publicationTimestamp,
    payload?.publicationTimestamp,
    campaignPayload?.startTimestamp,
    payload?.startTimestamp,
    campaignPayload?.creationTimestamp,
    payload?.creationTimestamp,
    row?.startTimestamp,
    row?.createdAt,
    row?.updatedAt,
  ]);
  const seasonInfo = inferSeasonWindowFromTimestamp(sortTimestampMs);
  return {
    sortTimestampMs,
    addedAt:
      (sortTimestampMs ? new Date(sortTimestampMs).toISOString() : null) ||
      toNullableIso(row?.createdAt) ||
      toNullableIso(row?.updatedAt) ||
      null,
    seasonInfo,
  };
}

function mapTrackingStatus({ tracked, status }) {
  if (tracked && String(status || "").toLowerCase() === "live") return "active";
  if (String(status || "").toLowerCase() === "paused") return "paused";
  if (tracked) return "active";
  return "idle";
}

function buildCampaignCatalogMetadata(row = {}) {
  const campaignName = toText(row?.campaignName || row?.campaign_name || row?.name);
  const parsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: row?.startTimestamp || row?.start_timestamp || null,
  });
  const linkedAlterations = extractRowAlterations(row);
  const parsedAlterations =
    Array.isArray(parsed?.alterations) && parsed.alterations.length
      ? parsed.alterations
      : Array.isArray(parsed?.alterationMix) && parsed.alterationMix.length
        ? parsed.alterationMix
        : [parsed?.alteration || ""];
  const alterationNames = uniqueTexts([...linkedAlterations.map((item) => item?.name), ...parsedAlterations]);
  const alterations = uniqueBy(
    alterationNames.map((name, index) => {
      const existing = linkedAlterations.find((item) => String(item?.name || "").toLowerCase() === name.toLowerCase());
      return {
        id: existing?.id || null,
        name: existing?.name || name,
        slug: slugifyText(existing?.slug || existing?.name || name, `alteration-${index + 1}`),
      };
    }),
    (item) => item.slug
  );
  const ordering = deriveCampaignOrdering({
    payloadJson: row?.payloadJson || row?.payload_json || null,
    startTimestamp: row?.startTimestamp || row?.start_timestamp || null,
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || null,
  });

  let season = parsed?.season || null;
  let seasonYear = Number(parsed?.year || 0) || null;
  let seasonLabel = null;
  let seasonKey = null;
  if (parsed?.special) {
    seasonLabel = parsed.special;
    seasonKey = slugifyText(parsed.special, "special");
  } else if (parsed?.season && parsed?.year) {
    seasonLabel = `${parsed.season} ${parsed.year}`;
    seasonKey = `${parsed.season.toLowerCase()}-${parsed.year}`;
  } else if (parsed?.season) {
    seasonLabel = parsed.season;
    seasonKey = slugifyText(parsed.season, "season");
  } else if (ordering.seasonInfo?.label) {
    season = ordering.seasonInfo.season || null;
    seasonYear = Number(ordering.seasonInfo.year || 0) || null;
    seasonLabel = ordering.seasonInfo.label || null;
    seasonKey = ordering.seasonInfo.key || null;
  }

  return {
    parsedCampaign: parsed,
    alterations,
    primaryAlteration: alterations[0] || null,
    season: season || null,
    seasonYear,
    seasonLabel,
    seasonKey,
    environment: parsed?.environment || null,
    carType: parsed?.carType || parsed?.environment || null,
    campaignType: parsed?.type || null,
    isCatalog: Boolean(parsed?.season || parsed?.special || alterations.length),
    sortTimestampMs: Number(ordering.sortTimestampMs || 0) || 0,
    addedAt: ordering.addedAt || null,
  };
}

export {
  ALTERATION_VALUE_SEPARATOR,
  buildCampaignCatalogMetadata,
  deriveCampaignOrdering,
  extractRowAlterations,
  inferSeasonFromName,
  inferSeasonWindowFromTimestamp,
  mapTrackingStatus,
  normalizeCampaignStorageName,
};
