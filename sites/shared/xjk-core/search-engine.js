const SEARCH_KIND_PRIORITY = Object.freeze({
  intent: 80,
  action: 70,
  local: 60,
  site: 50,
  destination: 45,
  tool: 40,
  guide: 35,
  plugin: 30,
  archive: 25,
});

function normalizeSearchText(value = "") {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSearchDocument(item = {}) {
  const title = normalizeSearchText(item.title);
  const subtitle = normalizeSearchText(item.subtitle);
  const description = normalizeSearchText(item.description);
  const site = normalizeSearchText(item.siteLabel || item.siteId);
  const section = normalizeSearchText(item.section);
  const keywords = normalizeSearchText(Array.isArray(item.keywords) ? item.keywords.join(" ") : item.keywords);
  const aliases = normalizeSearchText(Array.isArray(item.aliases) ? item.aliases.join(" ") : item.aliases);

  return {
    title,
    subtitle,
    description,
    site,
    section,
    keywords,
    aliases,
    all: [title, subtitle, description, site, section, keywords, aliases].filter(Boolean).join(" "),
  };
}

function scoreSubsequence(haystack, needle) {
  if (!haystack || !needle || needle.length < 3 || needle.length > haystack.length) return 0;

  let cursor = 0;
  let first = -1;
  let last = -1;
  let streak = 0;
  let longestStreak = 0;

  for (let index = 0; index < haystack.length && cursor < needle.length; index += 1) {
    if (haystack[index] === needle[cursor]) {
      if (first < 0) first = index;
      streak = last === index - 1 ? streak + 1 : 1;
      longestStreak = Math.max(longestStreak, streak);
      last = index;
      cursor += 1;
    }
  }

  if (cursor !== needle.length) return 0;
  const span = Math.max(1, last - first + 1);
  const compactness = needle.length / span;
  return 18 + compactness * 18 + longestStreak * 2 - first * 0.15;
}

function scoreField(field, query, weights) {
  if (!field || !query) return 0;
  if (field === query) return weights.exact;
  if (field.startsWith(query)) return weights.starts;
  if (field.includes(` ${query}`)) return weights.word;
  if (field.includes(query)) return weights.contains;
  return scoreSubsequence(field, query) * weights.fuzzy;
}

function scoreSearchItem(item = {}, rawQuery = "") {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return Number(item.priority || 0) + (SEARCH_KIND_PRIORITY[item.kind] || 0);
  }

  const document = getSearchDocument(item);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  let score = scoreField(document.title, query, {
    exact: 1000,
    starts: 720,
    word: 590,
    contains: 520,
    fuzzy: 2.8,
  });
  score = Math.max(
    score,
    scoreField(document.aliases, query, {
      exact: 880,
      starts: 650,
      word: 560,
      contains: 490,
      fuzzy: 2.4,
    })
  );

  let matchedTokens = 0;
  for (const token of tokens) {
    const tokenScore = Math.max(
      scoreField(document.title, token, {
        exact: 300,
        starts: 250,
        word: 215,
        contains: 180,
        fuzzy: 1.8,
      }),
      scoreField(document.keywords, token, {
        exact: 210,
        starts: 175,
        word: 165,
        contains: 135,
        fuzzy: 0,
      }),
      scoreField(document.site, token, {
        exact: 175,
        starts: 145,
        word: 130,
        contains: 105,
        fuzzy: 0,
      }),
      scoreField(`${document.subtitle} ${document.description} ${document.section}`, token, {
        exact: 120,
        starts: 105,
        word: 95,
        contains: 76,
        fuzzy: 0,
      })
    );

    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    }
  }

  if (matchedTokens !== tokens.length) return 0;
  score += matchedTokens * 24;
  score += Number(item.priority || 0) * 0.1;
  score += (SEARCH_KIND_PRIORITY[item.kind] || 0) * 0.05;
  return score;
}

function rankSearchItems(items = [], rawQuery = "", options = {}) {
  const limit = Math.max(1, Number(options.limit || 50));
  const kinds = options.kinds ? new Set(options.kinds) : null;

  return items
    .filter((item) => item && (!kinds || kinds.has(item.kind)))
    .map((item, index) => ({
      item,
      index,
      score: scoreSearchItem(item, rawQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftPriority = Number(left.item.priority || 0);
      const rightPriority = Number(right.item.priority || 0);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      const titleOrder = String(left.item.title || "").localeCompare(String(right.item.title || ""));
      return titleOrder || left.index - right.index;
    })
    .slice(0, limit)
    .map((entry) => ({ ...entry.item, score: entry.score }));
}

export { SEARCH_KIND_PRIORITY, getSearchDocument, normalizeSearchText, rankSearchItems, scoreSearchItem };
