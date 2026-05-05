import fsSync from "node:fs";

const BRACKET_TRANSLATION = {
  "\u300e": "[",
  "\u300f": "]",
  "\u300c": "[",
  "\u300d": "]",
  "\u3010": "[",
  "\u3011": "]",
  "\u3014": "[",
  "\u3015": "]",
};

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function uniqueBy(items = [], getKey = (value) => value) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(getKey(item) ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function translateSpecialBrackets(value) {
  let out = "";
  for (const char of String(value || "")) {
    out += BRACKET_TRANSLATION[char] || char;
  }
  return out;
}

function normalizeAlterationGroupingKey(value) {
  const normalized = translateSpecialBrackets(toText(value))
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const withSpacedBrackets = normalized.replace(/\]\[/g, "] [");
  const slug = withSpacedBrackets
    .replace(/[^a-z0-9\[\]\- ]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\[-+/g, "[")
    .replace(/-+\]/g, "]")
    .replace(/^-+|-+$/g, "");
  return slug;
}

function compactAlterationGroupingKey(value) {
  return normalizeAlterationGroupingKey(value).replace(/[^a-z0-9]+/g, "");
}

function extractCategoryList(document = {}) {
  if (Array.isArray(document?.categories)) return document.categories;
  if (document?.grouping && typeof document.grouping === "object") {
    return Object.entries(document.grouping).map(([name, items]) => ({ name, items }));
  }
  return [];
}

function normalizeAlterationGroupingDocument(document = {}) {
  const categories = extractCategoryList(document)
    .map((category, index) => {
      const name = toText(category?.name || category?.label || category?.category, `Category ${index + 1}`);
      const rawItems = Array.isArray(category?.items) ? category.items : [];
      const items = uniqueBy(
        rawItems
          .map((item) => {
            const label = toText(item);
            const key = normalizeAlterationGroupingKey(label);
            return key ? { label, key } : null;
          })
          .filter(Boolean),
        (item) => item.key
      );
      if (!name || !items.length) return null;
      return {
        name,
        items: items.map((item) => item.label),
      };
    })
    .filter(Boolean);

  const aliasesSource = document?.aliases && typeof document.aliases === "object" ? document.aliases : {};
  const aliases = Object.entries(aliasesSource)
    .map(([rawAlias, rawTarget]) => {
      const alias = normalizeAlterationGroupingKey(rawAlias);
      const target = normalizeAlterationGroupingKey(rawTarget);
      if (!alias || !target) return null;
      return [alias, target];
    })
    .filter(Boolean);

  return {
    categories,
    aliases: Object.fromEntries(aliases),
  };
}

function buildAlterationGroupingSnapshot(document = {}, { filePath = "", loaded = false, error = null } = {}) {
  const normalized = normalizeAlterationGroupingDocument(document);
  const categories = normalized.categories.map((category, categoryOrder) => ({
    name: category.name,
    key: normalizeAlterationGroupingKey(category.name) || `category-${categoryOrder + 1}`,
    order: categoryOrder,
    items: uniqueBy(
      category.items
        .map((label, itemOrder) => {
          const key = normalizeAlterationGroupingKey(label);
          if (!key) return null;
          return {
            key,
            label: toText(label),
            order: itemOrder,
          };
        })
        .filter(Boolean),
      (item) => item.key
    ),
  }));

  const itemMap = new Map();
  const compactCandidates = new Map();
  for (const category of categories) {
    for (const item of category.items) {
      const entry = {
        categoryName: category.name,
        categoryKey: category.key,
        categoryOrder: category.order,
        itemKey: item.key,
        itemLabel: item.label,
        itemOrder: item.order,
      };
      itemMap.set(item.key, entry);
      const compactKey = compactAlterationGroupingKey(item.key);
      if (compactKey) {
        const bucket = compactCandidates.get(compactKey) || [];
        bucket.push(entry);
        compactCandidates.set(compactKey, bucket);
      }
    }
  }

  const compactItemMap = new Map();
  for (const [compactKey, entries] of compactCandidates.entries()) {
    if (entries.length !== 1) continue;
    compactItemMap.set(compactKey, entries[0]);
  }

  const aliasMap = new Map();
  for (const [aliasKey, targetKey] of Object.entries(normalized.aliases)) {
    if (!itemMap.has(targetKey)) continue;
    aliasMap.set(aliasKey, targetKey);
  }

  return {
    loaded: Boolean(loaded && categories.length),
    error: error ? String(error) : null,
    filePath: toText(filePath) || null,
    categories,
    aliasCount: aliasMap.size,
    itemMap,
    aliasMap,
    compactItemMap,
  };
}

function createAlterationGroupingStore({ filePath = "", logger = console } = {}) {
  const groupingPath = toText(filePath);
  let cacheSignature = "";
  let cacheSnapshot = buildAlterationGroupingSnapshot({}, { filePath: groupingPath, loaded: false });

  function readSnapshot() {
    if (!groupingPath) {
      cacheSignature = "empty";
      cacheSnapshot = buildAlterationGroupingSnapshot({}, { filePath: groupingPath, loaded: false });
      return cacheSnapshot;
    }

    let stat = null;
    try {
      stat = fsSync.statSync(groupingPath);
    } catch {
      cacheSignature = `missing:${groupingPath}`;
      cacheSnapshot = buildAlterationGroupingSnapshot({}, { filePath: groupingPath, loaded: false });
      return cacheSnapshot;
    }

    const signature = `${groupingPath}:${Number(stat.mtimeMs || 0)}:${Number(stat.size || 0)}`;
    if (signature === cacheSignature) return cacheSnapshot;

    try {
      const parsed = JSON.parse(fsSync.readFileSync(groupingPath, "utf8"));
      cacheSignature = signature;
      cacheSnapshot = buildAlterationGroupingSnapshot(parsed, {
        filePath: groupingPath,
        loaded: true,
      });
      return cacheSnapshot;
    } catch (error) {
      cacheSignature = `error:${signature}`;
      cacheSnapshot = buildAlterationGroupingSnapshot({}, {
        filePath: groupingPath,
        loaded: false,
        error: error?.message || String(error || "Invalid alteration grouping JSON."),
      });
      logger?.warn?.(`[alteration-grouping] failed to parse ${groupingPath}: ${cacheSnapshot.error}`);
      return cacheSnapshot;
    }
  }

  return {
    filePath: groupingPath,
    getSnapshot: readSnapshot,
  };
}

function resolveAlterationGroupingMatch(row = {}, snapshot = null) {
  const grouping =
    snapshot && typeof snapshot === "object"
      ? snapshot
      : buildAlterationGroupingSnapshot({}, { loaded: false });
  const itemMap = grouping.itemMap instanceof Map ? grouping.itemMap : new Map();
  const aliasMap = grouping.aliasMap instanceof Map ? grouping.aliasMap : new Map();
  const compactItemMap =
    grouping.compactItemMap instanceof Map ? grouping.compactItemMap : new Map();
  const candidates = uniqueBy(
    [
      normalizeAlterationGroupingKey(row?.slug),
      normalizeAlterationGroupingKey(row?.name),
    ].filter(Boolean),
    (value) => value
  );

  for (const key of candidates) {
    if (itemMap.has(key)) {
      return {
        match: itemMap.get(key),
        source: "direct",
        sourceKey: key,
      };
    }
  }

  for (const key of candidates) {
    const targetKey = aliasMap.get(key);
    if (!targetKey || !itemMap.has(targetKey)) continue;
    return {
      match: itemMap.get(targetKey),
      source: "alias",
      sourceKey: key,
    };
  }

  for (const key of candidates) {
    const compactKey = compactAlterationGroupingKey(key);
    if (!compactKey || !compactItemMap.has(compactKey)) continue;
    return {
      match: compactItemMap.get(compactKey),
      source: "compact",
      sourceKey: key,
    };
  }

  return {
    match: null,
    source: null,
    sourceKey: null,
  };
}

function applyAlterationGrouping(alterations = [], snapshot = null) {
  const grouping =
    snapshot && typeof snapshot === "object"
      ? snapshot
      : buildAlterationGroupingSnapshot({}, { loaded: false });
  const groupCounts = new Map();
  const enriched = (Array.isArray(alterations) ? alterations : []).map((row, originalIndex) => {
    const resolved = resolveAlterationGroupingMatch(row, grouping);
    const match = resolved.match;
    if (match?.categoryKey) {
      groupCounts.set(match.categoryKey, Number(groupCounts.get(match.categoryKey) || 0) + 1);
    }
    return {
      ...row,
      category: match?.categoryName || null,
      category_key: match?.categoryKey || null,
      category_order: Number.isFinite(Number(match?.categoryOrder)) ? Number(match.categoryOrder) : null,
      category_item_key: match?.itemKey || null,
      category_item_order: Number.isFinite(Number(match?.itemOrder)) ? Number(match.itemOrder) : null,
      category_match_source: resolved.source || null,
      category_match_key: resolved.sourceKey || null,
      _grouping_original_index: originalIndex,
    };
  });

  enriched.sort((left, right) => {
    const labelDiff = toText(left?.name).localeCompare(toText(right?.name), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (labelDiff !== 0) return labelDiff;

    return Number(left?._grouping_original_index || 0) - Number(right?._grouping_original_index || 0);
  });

  const groups = grouping.categories.map((category) => ({
    name: category.name,
    key: category.key,
    order: category.order,
    item_count: category.items.length,
    matched_count: Number(groupCounts.get(category.key) || 0),
  }));

  const publicAlterations = enriched.map(({ _grouping_original_index, ...row }) => row);
  return {
    loaded: Boolean(grouping.loaded),
    error: grouping.error || null,
    categories: groups,
    alias_count: Number(grouping.aliasCount || 0),
    alterations: publicAlterations,
  };
}

export {
  applyAlterationGrouping,
  createAlterationGroupingStore,
  normalizeAlterationGroupingDocument,
  normalizeAlterationGroupingKey,
};
