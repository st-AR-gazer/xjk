const SOURCE_VERSION = "sorting-v4-campaign-aware";

const TM_STYLE_CODE_PATTERN = /\$([0-9a-fA-F]{1,3}|[iIoOnNmMwWsSzZtTgG<>]|[lLhHpP](\[[^\]]+\])?)/g;

const TRAINING_DEFAULT_YEAR = 2020;

const SEASON_BY_TOKEN = new Map([
  ["winter", "Winter"],
  ["wntr", "Winter"],
  ["wi", "Winter"],
  ["spring", "Spring"],
  ["sprng", "Spring"],
  ["sprn", "Spring"],
  ["sp", "Spring"],
  ["summer", "Summer"],
  ["smmr", "Summer"],
  ["sumr", "Summer"],
  ["su", "Summer"],
  ["fall", "Fall"],
  ["autumn", "Fall"],
  ["fa", "Fall"],
  ["training", "Training"],
  ["trng", "Training"],
  ["\u8bad\u7ec3", "Training"],
  ["\u00e8\u00ae\u00ad\u00e7\u00bb\u0192", "Training"],
  ["tmgl", "TMGL"],
  ["tmwt", "TMWT"],
]);

const TYPE_BY_TOKEN = new Map([
  ["race", "Race"],
  ["rc", "Race"],
  ["royal", "Royal"],
  ["ry", "Royal"],
  ["stunt", "Stunt"],
  ["st", "Stunt"],
  ["platform", "Platform"],
  ["plfm", "Platform"],
  ["pl", "Platform"],
]);

const COMPETITION_TYPE_BY_TOKEN = new Map([
  ["tmgl", "TMGL"],
  ["tmwt", "TMWT"],
  ["tmwc", "TMWC"],
]);

const ENVIRONMENT_BY_TOKEN = new Map([
  ["snow", "Snow"],
  ["sn", "Snow"],
  ["stadium", "Stadium"],
  ["st", "Stadium"],
  ["rally", "Rally"],
  ["rl", "Rally"],
  ["desert", "Desert"],
  ["dsrt", "Desert"],
  ["ds", "Desert"],
]);

const SPECIAL_CAMPAIGN_BY_TOKEN = new Map([
  ["training", { label: "Training", defaultYear: TRAINING_DEFAULT_YEAR }],
  ["trng", { label: "Training", defaultYear: TRAINING_DEFAULT_YEAR }],
  ["\u8bad\u7ec3", { label: "Training", defaultYear: TRAINING_DEFAULT_YEAR }],
  ["\u00e8\u00ae\u00ad\u00e7\u00bb\u0192", { label: "Training", defaultYear: TRAINING_DEFAULT_YEAR }],
  ["royal", { label: "Royal", defaultYear: null }],
  ["snow discovery", { label: "Snow Discovery", defaultYear: null }],
  ["snowdiscovery", { label: "Snow Discovery", defaultYear: null }],
  ["snowdscvry", { label: "Snow Discovery", defaultYear: null }],
  ["snowdsry", { label: "Snow Discovery", defaultYear: null }],
  ["snwd", { label: "Snow Discovery", defaultYear: null }],
  ["rally discovery", { label: "Rally Discovery", defaultYear: null }],
  ["rallydiscovery", { label: "Rally Discovery", defaultYear: null }],
  ["rallydscvry", { label: "Rally Discovery", defaultYear: null }],
  ["rallydsry", { label: "Rally Discovery", defaultYear: null }],
  ["rallyd", { label: "Rally Discovery", defaultYear: null }],
  ["rlyd", { label: "Rally Discovery", defaultYear: null }],
  ["desert discovery", { label: "Desert Discovery", defaultYear: null }],
  ["desertdiscovery", { label: "Desert Discovery", defaultYear: null }],
  ["desertdscvry", { label: "Desert Discovery", defaultYear: null }],
  ["desertdsry", { label: "Desert Discovery", defaultYear: null }],
  ["desertd", { label: "Desert Discovery", defaultYear: null }],
  ["dstd", { label: "Desert Discovery", defaultYear: null }],
  ["stunt discovery", { label: "Stunt Discovery", defaultYear: null }],
  ["stuntdiscovery", { label: "Stunt Discovery", defaultYear: null }],
  ["stuntdscvry", { label: "Stunt Discovery", defaultYear: null }],
  ["stuntdsry", { label: "Stunt Discovery", defaultYear: null }],
  ["stuntd", { label: "Stunt Discovery", defaultYear: null }],
  ["stnd", { label: "Stunt Discovery", defaultYear: null }],
  ["platform discovery", { label: "Platform Discovery", defaultYear: null }],
  ["platformdiscovery", { label: "Platform Discovery", defaultYear: null }],
  ["platformdscvry", { label: "Platform Discovery", defaultYear: null }],
  ["pltfmdscvry", { label: "Platform Discovery", defaultYear: null }],
  ["plfmdscvry", { label: "Platform Discovery", defaultYear: null }],
  ["plfmdsry", { label: "Platform Discovery", defaultYear: null }],
  ["plfmd", { label: "Platform Discovery", defaultYear: null }],
  ["plfd", { label: "Platform Discovery", defaultYear: null }],
  ["platformdsry", { label: "Platform Discovery", defaultYear: null }],
  ["weekly shorts", { label: "Weekly Shorts", defaultYear: null }],
  ["weeklyshorts", { label: "Weekly Shorts", defaultYear: null }],
  ["weekly s", { label: "Weekly Shorts", defaultYear: null }],
  ["weekly", { label: "Weekly Shorts", defaultYear: null }],
  ["week", { label: "Weekly Shorts", defaultYear: null }],
  ["weekly grand", { label: "Weekly Grands", defaultYear: null }],
  ["weekly grands", { label: "Weekly Grands", defaultYear: null }],
  ["weeklygrand", { label: "Weekly Grands", defaultYear: null }],
  ["weeklygrands", { label: "Weekly Grands", defaultYear: null }],
  ["week grand", { label: "Weekly Grands", defaultYear: null }],
  ["week grands", { label: "Weekly Grands", defaultYear: null }],
]);

const COMPETITION_CAMPAIGN_DEFINITIONS = [
  {
    type: "TMGL",
    season: "Fall",
    year: 2020,
    aliases: ["TMGL Fall 2020", "TMGL - Fall 2020", "TMGL Fa20"],
    alteration: null,
  },
  {
    type: "TMGL",
    season: "Winter",
    year: 2021,
    aliases: ["TMGL Winter 2021", "TMGL - Winter 2021", "TMGL Wi21"],
    alteration: null,
  },
  {
    type: "TMWC",
    season: null,
    year: 2021,
    aliases: ["TMWC 2021", "TMWC - 2021"],
    alteration: null,
  },
  {
    type: "TMGL",
    season: "Fall",
    year: 2021,
    aliases: ["TMGL Fall 2021", "TMGL - Fall 2021", "TMGL Fa21"],
    alteration: null,
  },
  {
    type: "TMGL",
    season: "Spring",
    year: 2022,
    aliases: ["TMGL Spring 2022", "TMGL - Spring 2022", "TMGL Sp22"],
    alteration: null,
  },
  {
    type: "TMWC",
    season: null,
    year: 2022,
    aliases: ["TMWC 2022", "TMWC - 2022"],
    alteration: null,
  },
  {
    type: "TMWT",
    season: "Spring",
    year: 2023,
    aliases: ["TMWT Spring 2023 Stage 1", "TMWT - Stage 1", "TMWT Sp23 Stage 1"],
    alteration: null,
  },
  {
    type: "TMWT",
    season: "Spring",
    year: 2023,
    aliases: ["TMWT [E] Spring 2023 Stage 1", "TMWT - Stage 1 [E]"],
    alteration: "Easy Mode",
  },
  {
    type: "TMWT",
    season: "Spring",
    year: 2023,
    aliases: ["TMWT Spring 2023 Stage 2", "TMWT - Stage 2", "TMWT Sp23 Stage 2"],
    alteration: null,
  },
  {
    type: "TMWT",
    season: "Spring",
    year: 2023,
    aliases: ["TMWT [E] Spring 2023 Stage 2", "TMWT - Stage 2 [E]"],
    alteration: "Easy Mode",
  },
  {
    type: "TMWC",
    season: "Summer",
    year: 2023,
    aliases: ["TMWC 2023", "TMWC - 2023"],
    alteration: null,
  },
];

const COMPETITION_CAMPAIGN_ALIAS_BY_NAME = new Map(
  COMPETITION_CAMPAIGN_DEFINITIONS.flatMap((entry) =>
    entry.aliases.map((alias) => [normalizeAliasValue(alias), entry])
  )
);

const WEEKLY_SHORTS_CANONICAL_MAPS = [
  { mapNumber: 1, week: 1, position: 1, title: "First" },
  { mapNumber: 2, week: 1, position: 2, title: "Curve" },
  { mapNumber: 3, week: 1, position: 3, title: "Climb" },
  { mapNumber: 4, week: 1, position: 4, title: "Boost" },
  { mapNumber: 5, week: 1, position: 5, title: "Slide" },
  { mapNumber: 6, week: 2, position: 1, title: "Hill" },
  { mapNumber: 7, week: 2, position: 2, title: "Flight" },
  { mapNumber: 8, week: 2, position: 3, title: "Pool" },
  { mapNumber: 9, week: 2, position: 4, title: "Forest" },
  { mapNumber: 10, week: 2, position: 5, title: "Ice" },
  { mapNumber: 11, week: 3, position: 1, title: "Tornado" },
  { mapNumber: 12, week: 3, position: 2, title: "Marble" },
  { mapNumber: 13, week: 3, position: 3, title: "Cascade" },
  { mapNumber: 14, week: 3, position: 4, title: "Broken" },
  { mapNumber: 15, week: 3, position: 5, title: "Angles" },
  { mapNumber: 16, week: 4, position: 1, title: "RubberLand" },
  { mapNumber: 17, week: 4, position: 2, title: "NightRace" },
  { mapNumber: 18, week: 4, position: 3, title: "IceBraker" },
  { mapNumber: 19, week: 4, position: 4, title: "AutoCross" },
  { mapNumber: 20, week: 4, position: 5, title: "Arena" },
  { mapNumber: 21, week: 29, position: 1, title: "1 - Week of Shorts" },
  { mapNumber: 22, week: 29, position: 2, title: "2 - You, from Us" },
  { mapNumber: 23, week: 29, position: 3, title: "3 - To Play" },
  { mapNumber: 24, week: 29, position: 4, title: "4 - The Celebration of" },
  { mapNumber: 25, week: 29, position: 5, title: "5 - Years of Trackmania" },
];

const WEEKLY_SHORTS_BY_WEEK_AND_POSITION = new Map(
  WEEKLY_SHORTS_CANONICAL_MAPS.map((entry) => [`${entry.week}:${entry.position}`, entry])
);

const CANONICAL_WEEKLY_SHORTS_WEEKS = new Map([
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [29, 5],
]);

const WEEKLY_SHORTS_BY_TITLE = new Map(
  WEEKLY_SHORTS_CANONICAL_MAPS.map((entry) => [
    normalizeAliasValue(entry.title),
    entry,
  ])
);

const ALTERATION_ALIASES = new Map(
  Object.entries({
    dirt: "Dirt",
    dirty: "Dirt",
    flooded: "Flooded",
    grassy: "Grassy",
    grass: "Grassy",
    ice: "Ice",
    icy: "Ice",
    magnet: "Magnet",
    fastmagnet: "Fast-Magnet",
    "fast magnet": "Fast-Magnet",
    mixed: "Mixed",
    penalty: "Penalty",
    plastic: "Plastic",
    road: "Road",
    roady: "Road",
    asphalt: "Road",
    tarmac: "Road",
    tech: "Road",
    wood: "Wood",
    bobsleigh: "Bobsleigh",
    pipe: "Pipe",
    sausage: "Sausage",
    "slot-trak": "Slot-Trak",
    "slot track": "Slot-Trak",
    surfaceless: "Surfaceless",
    underwater: "Underwater",
    uw: "Underwater",
    reverse: "Reverse",
    short: "Short",
    "no grip": "No-Grip",
    "no-grip": "No-Grip",
    nogrip: "No-Grip",
    "no brakes": "No-Brakes",
    "no-brakes": "No-Brakes",
    nobrakes: "No-Brakes",
    slowmo: "Slowmo",
    "slow mo": "Slowmo",
    slowmotion: "Slowmo",
    fragile: "Fragile",
    glider: "Glider",
    freewheel: "Freewheel",
    yeet: "YEET",
    deet: "YEET Down",
    "there and back": "There and Back",
    boomerang: "There and Back",
    checkpointless: "Checkpointless",
    cpless: "Checkpointless",
    sttf: "Straight to the Finish",
    "straight to the finish": "Straight to the Finish",
    "official nadeo map": "Unaltered Nadeo",
  })
);

const SEASONAL_PREFIX_PATTERN =
  /^(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})(?:\s+(?<tail>.+))?$/i;
const SEASONAL_SUFFIX_PATTERN =
  /^(?<tail>.+?)\s+(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})$/i;
const SPRING_2020_CODE_PATTERN = /^(?<code>[STst][0-1]\d)(?:\s*[-:]\s*|\s+)?(?<tail>.*)$/;
const CAMPAIGN_PREFIX_PATTERN =
  /^(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{4})(?:\s*-\s*|\s+)(?<tail>.+)$/i;
const MAP_NUMBER_AFTER_SEASON_PATTERN =
  /^(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s*[- ]\s*(?<map>\d{1,2})(?:\b|[\s-:])/i;
const MAP_NUMBER_AFTER_YEAR_PATTERN = /\b(?<year>\d{4})\s*-\s*(?<map>\d{1,2})(?:\b|[\s-:])/i;
const LEADING_MAP_NUMBER_PATTERN = /^(?<map>\d{1,2})(?:\b|[\s-:])/i;

const CAMPAIGN_SEASON_TOKEN = "(?:winter|spring|summer|fall|autumn|training|wi|sp|su|fa)";
const MAPNUMBER_COLOR_TOKEN = "(?:white|green|blue|red|black)";
const TRAINING_SEASON_TOKEN = "(?:training|trng|\u8bad\u7ec3|\u00e8\u00ae\u00ad\u00e7\u00bb\u0192)";
const MAPNUMBER_COLOR_RANGES = new Map([
  ["white", Array.from({ length: 5 }, (_, index) => index + 1)],
  ["green", Array.from({ length: 5 }, (_, index) => index + 6)],
  ["blue", Array.from({ length: 5 }, (_, index) => index + 11)],
  ["red", Array.from({ length: 5 }, (_, index) => index + 16)],
  ["black", Array.from({ length: 5 }, (_, index) => index + 21)],
]);

const SEASONAL_COLOR_COMBINED_PATTERN = new RegExp(
  `^(?<season>${CAMPAIGN_SEASON_TOKEN})\\s+(?<year>\\d{2,4})\\s*-\\s*(?<color>${MAPNUMBER_COLOR_TOKEN})\\s+(?<tail>combined)$`,
  "i"
);
const BOSS_SEASONAL_PATTERN_1 = new RegExp(
  `^(?<color>${MAPNUMBER_COLOR_TOKEN})\\s+(?<tail>boss)\\s*-\\s*(?<season>${CAMPAIGN_SEASON_TOKEN})['\u2019](?<year>\\d{2,4})$`,
  "i"
);
const BOSS_SEASONAL_PATTERN_2 = new RegExp(
  `^(?<tail>boss)\\s+(?<color>${MAPNUMBER_COLOR_TOKEN})\\s+of\\s+(?<season>${CAMPAIGN_SEASON_TOKEN})\\s+(?<year>\\d{2,4})$`,
  "i"
);
const BOSS_SEASONAL_PATTERN_3 = new RegExp(
  `^(?<color>${MAPNUMBER_COLOR_TOKEN})\\s+(?<tail>boss)\\s+(?<season>${CAMPAIGN_SEASON_TOKEN})\\s+(?<year>\\d{2,4})$`,
  "i"
);
const TOTD_MONTH_PATTERN = /^(?<token>totd)\s+(?<year>\d{4})-(?<month>\d{1,2})$/i;
const TOTD_DAY_PREFIX_PATTERN =
  /^(?<day>\d{1,2})\/(?<month>\d{1,2})\/(?<year>\d{4})(?:\s+(?<tail>.+))?$/i;

const TRAINING_COLOR_COMBINED_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<color>${MAPNUMBER_COLOR_TOKEN})\\s+(?<tail>combined)$`,
  "i"
);
const TRAINING_MULTI_RANGE_PATTERN = new RegExp(
  `^(?<alteration>mixed)\\s+(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})-(?<map2>\\d{1,2})$`,
  "i"
);
const TRAINING_MULTI_PAIR_PREFIX_PATTERN = new RegExp(
  `^(?<alteration>plastic)\\s+(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+&\\s+(?<map2>\\d{1,2})$`,
  "i"
);
const TRAINING_MULTI_PAIR_SUFFIX_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+&\\s+(?<map2>\\d{1,2})\\s+(?<tail>wood)$`,
  "i"
);
const TRAINING_MULTI_SURFACELESS_16171819_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+(?<map2>\\d{1,2})\\s+(?<map3>\\d{1,2})\\s+(?<map4>\\d{1,2})\\s+(?<tail>surfaceless)$`,
  "i"
);
const TRAINING_MULTI_SNOW_WOOD_PATTERN = new RegExp(
  `^(?<tail1>\\[snow\\])\\s+(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s*&\\s*(?<map2>\\d{1,2})\\s+(?<tail2>wood)$`,
  "i"
);
const TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN = new RegExp(
  `^(?<tail>wet\\s+plastic)\\s+(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+&\\s+(?<map2>\\d{1,2})$`,
  "i"
);
const TRAINING_MULTI_WET_WOOD_PAIR_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+&\\s+(?<map2>\\d{1,2})\\s+\\((?<tail>wet\\s+wood)\\)$`,
  "i"
);
const TRAINING_MULTI_WET_ICY_WOOD_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2}),\\s*(?<map2>\\d{1,2}),\\s*(?<map3>\\d{1,2})\\s*&\\s*(?<map4>\\d{1,2})\\s+\\((?<tail>(?:100%|pure)\\s+wet\\s+icy\\s+wood)\\)$`,
  "i"
);
const TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map1>\\d{1,2})\\s+&\\s+(?<map2>\\d{1,2})\\s+\\((?<tail>wet\\s+icy\\s+plastic)\\)$`,
  "i"
);

const TRAINING_PREFIX_BEFORE_SEASON_PATTERN = new RegExp(
  `^(?<tail>.+?)\\s+(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map>\\d{1,2})(?:\\s+(?<postTail>.+))?$`,
  "i"
);
const TRAINING_PREFIX_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s*-\\s*(?<map>\\d{1,2})(?:\\s+(?<tail>.+))?$`,
  "i"
);
const TRAINING_NUMBER_BEFORE_DASH_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s+(?<map>\\d{1,2})\\s+-\\s*(?<tail>.+)$`,
  "i"
);
const TRAINING_TAIL_BEFORE_DASH_PATTERN = new RegExp(
  `^(?<season>${TRAINING_SEASON_TOKEN})\\s+(?<tail>.+?)\\s*-\\s*(?<map>\\d{1,2})$`,
  "i"
);

function normalizeTrainingYear(year) {
  const text = toText(year);
  if (!text) return TRAINING_DEFAULT_YEAR;
  const normalized = normalizeYear(text);
  if (normalized) return normalized;
  return TRAINING_DEFAULT_YEAR;
}

function normalizeTrainingMapNumbers(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = normalizeMapNumber(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeColorRange(color) {
  return normalizeTrainingMapNumbers(
    MAPNUMBER_COLOR_RANGES.get(toText(color).toLowerCase()) || []
  );
}

function normalizeTrainingAlterations(parts = []) {
  const out = [];
  for (const part of parts) {
    if (!part) continue;
    out.push(...splitAlterationTail(part));
  }
  return uniqueLower(out);
}

function buildColorMappedProposedName(value = "") {
  return sanitizeMapName(value) || null;
}

function parseColorMappedFields(sanitizedName) {
  const name = normalizeWhitespace(toText(sanitizedName));
  if (!name) return null;

  const seasonalCombinedMatch = name.match(SEASONAL_COLOR_COMBINED_PATTERN);
  if (seasonalCombinedMatch?.groups) {
    const season = normalizeSeason(seasonalCombinedMatch.groups.season);
    const year = normalizeYear(seasonalCombinedMatch.groups.year);
    const mapNumbers = normalizeColorRange(seasonalCombinedMatch.groups.color);
    if (season && year && mapNumbers.length) {
      return {
        season,
        year,
        mapNumbers,
        alterationMix: normalizeTrainingAlterations([seasonalCombinedMatch.groups.tail]),
        parserPattern: "seasonal-color-combined",
        proposedName: buildColorMappedProposedName(name),
      };
    }
  }

  const bossPatterns = [
    { pattern: BOSS_SEASONAL_PATTERN_1, parserPattern: "boss-color-prefix-apostrophe-year" },
    { pattern: BOSS_SEASONAL_PATTERN_2, parserPattern: "boss-of-season-year" },
    { pattern: BOSS_SEASONAL_PATTERN_3, parserPattern: "boss-color-prefix-year" },
  ];

  for (const entry of bossPatterns) {
    const match = name.match(entry.pattern);
    if (!match?.groups) continue;
    const season = normalizeSeason(match.groups.season);
    const year = normalizeYear(match.groups.year);
    const mapNumbers = normalizeColorRange(match.groups.color);
    if (!season || !year || !mapNumbers.length) continue;
    return {
      season,
      year,
      mapNumbers,
      alterationMix: normalizeTrainingAlterations([match.groups.tail]),
      parserPattern: entry.parserPattern,
      proposedName: buildColorMappedProposedName(name),
    };
  }

  return null;
}

function parseTrainingFields(sanitizedName) {
  const name = normalizeWhitespace(toText(sanitizedName));
  if (!name) return null;

  const colorMatch = name.match(TRAINING_COLOR_COMBINED_PATTERN);
  if (colorMatch?.groups?.color) {
    const mapNumbers = normalizeColorRange(colorMatch.groups.color);
    if (mapNumbers.length) {
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        alterationMix: normalizeTrainingAlterations(["Combined"]),
        parserPattern: "training-color-combined",
        proposedName: buildColorMappedProposedName(name),
      };
    }
  }

  const multiPatterns = [
    {
      parserPattern: "training-mixed-range",
      pattern: TRAINING_MULTI_RANGE_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["alteration"],
    },
    {
      parserPattern: "training-plastic-pair-prefix",
      pattern: TRAINING_MULTI_PAIR_PREFIX_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["alteration"],
    },
    {
      parserPattern: "training-pair-wood-suffix",
      pattern: TRAINING_MULTI_PAIR_SUFFIX_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-surfaceless-16171819",
      pattern: TRAINING_MULTI_SURFACELESS_16171819_PATTERN,
      mapKeys: ["map1", "map2", "map3", "map4"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-snow-wood-pair",
      pattern: TRAINING_MULTI_SNOW_WOOD_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail1", "tail2"],
    },
    {
      parserPattern: "training-wet-plastic-pair",
      pattern: TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-wood-pair",
      pattern: TRAINING_MULTI_WET_WOOD_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-icy-wood-21222324",
      pattern: TRAINING_MULTI_WET_ICY_WOOD_PATTERN,
      mapKeys: ["map1", "map2", "map3", "map4"],
      tailKeys: ["tail"],
    },
    {
      parserPattern: "training-wet-icy-plastic-pair",
      pattern: TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN,
      mapKeys: ["map1", "map2"],
      tailKeys: ["tail"],
    },
  ];

  for (const entry of multiPatterns) {
    const match = name.match(entry.pattern);
    if (!match?.groups) continue;
    const mapNumbers = normalizeTrainingMapNumbers(entry.mapKeys.map((key) => match.groups[key]));
    if (!mapNumbers.length) continue;
    const tails = entry.tailKeys.map((key) => match.groups[key]).filter(Boolean);
    return {
      season: "Training",
      year: normalizeTrainingYear(null),
      mapNumbers,
      alterationMix: normalizeTrainingAlterations(tails),
      parserPattern: entry.parserPattern,
    };
  }

  const beforeSeasonMatch = name.match(TRAINING_PREFIX_BEFORE_SEASON_PATTERN);
  if (beforeSeasonMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([beforeSeasonMatch.groups.map]);
    if (mapNumbers.length) {
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        alterationMix: normalizeTrainingAlterations([beforeSeasonMatch.groups.tail, beforeSeasonMatch.groups.postTail]),
        parserPattern: "training-prefix-before-season",
      };
    }
  }

  const prefixMatch = name.match(TRAINING_PREFIX_PATTERN);
  if (prefixMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([prefixMatch.groups.map]);
    const tail = toText(prefixMatch.groups.tail || "").replace(/^[\s|:-]+/, "").trim();
    if (mapNumbers.length) {
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        alterationMix: normalizeTrainingAlterations([tail]),
        parserPattern: "training-prefix",
      };
    }
  }

  const numberBeforeDashMatch = name.match(TRAINING_NUMBER_BEFORE_DASH_PATTERN);
  if (numberBeforeDashMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([numberBeforeDashMatch.groups.map]);
    if (mapNumbers.length) {
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        alterationMix: normalizeTrainingAlterations([numberBeforeDashMatch.groups.tail]),
        parserPattern: "training-number-before-dash",
      };
    }
  }

  const tailBeforeDashMatch = name.match(TRAINING_TAIL_BEFORE_DASH_PATTERN);
  if (tailBeforeDashMatch?.groups?.map) {
    const mapNumbers = normalizeTrainingMapNumbers([tailBeforeDashMatch.groups.map]);
    if (mapNumbers.length) {
      return {
        season: "Training",
        year: normalizeTrainingYear(null),
        mapNumbers,
        alterationMix: normalizeTrainingAlterations([tailBeforeDashMatch.groups.tail]),
        parserPattern: "training-tail-before-dash",
      };
    }
  }

  return null;
}

function toText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeWhitespace(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function sanitizeMapName(name) {
  const cleanDashes = toText(name).replace(/[\u2013\u2014]/g, "-");
  const withoutStyle = cleanDashes.replace(TM_STYLE_CODE_PATTERN, "");
  return normalizeWhitespace(withoutStyle);
}

function normalizeSeason(token) {
  const key = toText(token).toLowerCase();
  return SEASON_BY_TOKEN.get(key) || null;
}

function normalizeCompetitionType(token) {
  const key = toText(token).toLowerCase();
  return COMPETITION_TYPE_BY_TOKEN.get(key) || null;
}

function normalizeYear(rawYear) {
  const parsed = Number(rawYear);
  if (!Number.isFinite(parsed)) return null;
  const year = Math.floor(parsed);
  if (year >= 2000 && year <= 2099) return year;
  if (year >= 0 && year <= 99) return 2000 + year;
  return null;
}

function normalizeMapNumber(rawMapNumber) {
  const parsed = Number(rawMapNumber);
  if (!Number.isFinite(parsed)) return null;
  const mapNumber = Math.floor(parsed);
  if (mapNumber < 1 || mapNumber > 999) return null;
  return mapNumber;
}

function cleanAlterationToken(token) {
  return normalizeWhitespace(
    toText(token)
      .replace(/^[([{\s]+/, "")
      .replace(/[)\]}]+$/g, "")
      .replace(/\s+\|\s+/g, " ")
  );
}

function normalizeAlterationToken(token) {
  const cleaned = cleanAlterationToken(token);
  if (!cleaned) return "";
  const lowered = cleaned.toLowerCase();
  const collapsed = lowered.replace(/\s+/g, " ");
  const noDash = collapsed.replace(/-/g, " ");
  return ALTERATION_ALIASES.get(collapsed) || ALTERATION_ALIASES.get(noDash) || cleaned;
}

function normalizeAliasValue(value) {
  return normalizeWhitespace(toText(value))
    .toLowerCase()
    .replace(/[\[\]()]/g, "")
    .replace(/[_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCampaignName(value) {
  return normalizeWhitespace(
    toText(value)
      .replace(/[[\]()]/g, " ")
      .replace(/[_]/g, " ")
  )
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchAliasFromTokens(tokens = [], aliasMap = new Map()) {
  for (let size = Math.min(tokens.length, 3); size >= 1; size -= 1) {
    const candidate = normalizeAliasValue(tokens.slice(0, size).join(" "));
    if (!candidate) continue;
    if (aliasMap.has(candidate)) {
      return {
        value: aliasMap.get(candidate),
        consumed: size,
      };
    }
  }
  return null;
}

function splitAlterationTail(tail) {
  const raw = normalizeWhitespace(toText(tail));
  if (!raw) return [];

  let normalized = raw;
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }

  normalized = normalized
    .replace(/\]\s+\(/g, "], (")
    .replace(/\)\s+\[/g, "), [")
    .replace(/\)\s+\(/g, "), (")
    .replace(/\bfeat(?:uring)?\b/gi, ",")
    .replace(/\bft\b/gi, ",")
    .replace(/\s+\+\s+/g, ",")
    .replace(/\s+&\s+/g, ",")
    .replace(/\s*\/\s*/g, ",")
    .replace(/\s*;\s*/g, ",")
    .replace(/\s+\|\s+/g, ",")
    .replace(/\s+-\s+/g, ",");
  return normalized
    .split(",")
    .map((part) => normalizeAlterationToken(part))
    .filter(Boolean);
}

function uniqueLower(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = toText(item).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(toText(item));
  }
  return out;
}

function extractWeeklyShortsWeek(value) {
  const text = normalizeWhitespace(toText(value));
  if (!text) return null;
  const match = text.match(/\bweek\s*0*(?<week>\d{1,3})\b/i);
  if (!match?.groups?.week) return null;
  return normalizeMapNumber(match.groups.week);
}

function resolveWeeklyShortsWeek({
  campaignName = "",
  campaignPayload = null,
  mapPayload = null,
} = {}) {
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

function resolveWeeklyGrandWeek({
  campaignName = "",
  campaignPayload = null,
  mapPayload = null,
} = {}) {
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
  return normalizeAliasValue(
    sanitizeMapName(toText(value).replace(/\.map\.gbx$/i, ""))
  );
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

  const titleCandidates = [mapName, filename]
    .map((value) => normalizeWeeklyShortsTitle(value))
    .filter(Boolean);
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

function calculateConfidence({
  hasSeason = false,
  hasYear = false,
  hasMapNumber = false,
  alterationMix = [],
  sanitizedName = "",
  parserPattern = "",
} = {}) {
  let score = 0;
  if (hasSeason) score += 20;
  if (hasYear) score += 20;
  if (hasMapNumber) score += 20;
  if (parserPattern === "spring-2020-code") score += 8;
  if (Array.isArray(alterationMix) && alterationMix.length > 0) {
    score += 18;
    const canonicalCount = alterationMix.filter((item) => ALTERATION_ALIASES.has(toText(item).toLowerCase()))
      .length;
    if (canonicalCount > 0) score += 8;
  }
  if (/\b(training|winter|spring|summer|fall|autumn)\b/i.test(sanitizedName)) score += 6;
  if (/\b\d{1,2}\b/.test(sanitizedName)) score += 4;
  return Math.max(0, Math.min(100, score));
}

function formatProposedName({ season, year, mapNumber, alterationMix = [] } = {}) {
  if (!season || !year || !mapNumber) return "";
  const padded = String(mapNumber).padStart(2, "0");
  const base = `${season} ${year} - ${padded}`;
  const alterations = uniqueLower(alterationMix);
  if (!alterations.length) return base;
  return `${base} | ${alterations.join(" + ")}`;
}

function parseSpring2020Code(code) {
  const normalized = toText(code).toUpperCase();
  if (!normalized || normalized.length !== 3) return null;
  if (!(normalized.startsWith("S") || normalized.startsWith("T"))) return null;
  const tail = Number(normalized.slice(1));
  if (!Number.isFinite(tail)) return null;
  let mapNumber = tail;
  if (normalized.startsWith("T")) mapNumber += 10;
  mapNumber = normalizeMapNumber(mapNumber);
  if (!mapNumber) return null;
  return {
    season: "Spring",
    year: 2020,
    mapNumber,
  };
}

function formatCampaignAlterationLabel(tail) {
  const normalized = normalizeWhitespace(
    toText(tail)
      .replace(/[[\]()]/g, " ")
      .replace(/\s+/g, " ")
  );
  if (!normalized) return null;
  return normalized;
}

function parseCompetitionCampaignStandardizedFields(rawCampaignName) {
  const sanitizedName = sanitizeMapName(rawCampaignName);
  if (!sanitizedName) return null;

  const aliasMatch = COMPETITION_CAMPAIGN_ALIAS_BY_NAME.get(normalizeAliasValue(sanitizedName)) || null;
  if (aliasMatch) {
    return {
      sanitizedName,
      parserPattern: "competition-campaign-alias",
      season: aliasMatch.season || null,
      year: aliasMatch.year || null,
      alteration: aliasMatch.alteration || null,
      alterationMix: aliasMatch.alteration ? [aliasMatch.alteration] : [],
      type: aliasMatch.type || null,
      environment: null,
      special: aliasMatch.season ? null : aliasMatch.type || null,
    };
  }

  const compactMatch = sanitizedName.match(
    /^(?<type>tmgl|tmwt)\s+(?<season>wi|sp|su|fa|winter|spring|summer|fall|autumn)\s*(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i
  );
  if (compactMatch?.groups) {
    const type = normalizeCompetitionType(compactMatch.groups.type);
    const season = normalizeSeason(compactMatch.groups.season);
    const year = normalizeYear(compactMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(compactMatch.groups.tail || "");
    const alterationMix = uniqueLower(splitAlterationTail(compactMatch.groups.tail || ""));
    if (type && season && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-compact",
        season,
        year,
        alteration,
        alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
        type,
        environment: null,
        special: null,
      };
    }
  }

  const fullMatch = sanitizedName.match(
    /^(?<type>tmgl|tmwt)\s*(?:-\s*)?(?<season>winter|spring|summer|fall|autumn)\s+(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i
  );
  if (fullMatch?.groups) {
    const type = normalizeCompetitionType(fullMatch.groups.type);
    const season = normalizeSeason(fullMatch.groups.season);
    const year = normalizeYear(fullMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(fullMatch.groups.tail || "");
    const alterationMix = uniqueLower(splitAlterationTail(fullMatch.groups.tail || ""));
    if (type && season && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-full",
        season,
        year,
        alteration,
        alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
        type,
        environment: null,
        special: null,
      };
    }
  }

  const tmwcMatch = sanitizedName.match(
    /^(?<type>tmwc)\s*(?:-\s*)?(?<year>\d{2,4})(?:\s+(?<tail>.+))?$/i
  );
  if (tmwcMatch?.groups) {
    const type = normalizeCompetitionType(tmwcMatch.groups.type);
    const year = normalizeYear(tmwcMatch.groups.year);
    const alteration = formatCampaignAlterationLabel(tmwcMatch.groups.tail || "");
    const alterationMix = uniqueLower(splitAlterationTail(tmwcMatch.groups.tail || ""));
    if (type && year) {
      return {
        sanitizedName,
        parserPattern: "competition-campaign-year-only",
        season: null,
        year,
        alteration,
        alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
        type,
        environment: null,
        special: type,
      };
    }
  }

  return null;
}

function parseCompetitionMapAlterationFields(rawName) {
  const sanitizedName = sanitizeMapName(rawName);
  if (!sanitizedName) return null;

  const easyModeMatch = sanitizedName.match(/^(?<title>.+?)\s+\[(?<tail>easy mode)\]$/i);
  if (easyModeMatch?.groups) {
    return {
      sanitizedName,
      canonicalTitle: sanitizeMapName(easyModeMatch.groups.title) || sanitizedName,
      alterationMix: ["Easy Mode"],
      parserPattern: "competition-map-easy-mode",
    };
  }

  const podiumMatch = sanitizedName.match(/^(?<title>.+?)\s+-\s+(?<tail>podium)$/i);
  if (podiumMatch?.groups) {
    return {
      sanitizedName,
      canonicalTitle: sanitizeMapName(podiumMatch.groups.title) || sanitizedName,
      alterationMix: ["Podium"],
      parserPattern: "competition-map-podium",
    };
  }

  return null;
}

function parseCampaignStandardizedFields(rawCampaignName, { startTimestamp = null } = {}) {
  const sanitizedName = sanitizeMapName(rawCampaignName);
  const defaultOut = {
    sanitizedName,
    parserPattern: "",
    season: null,
    year: null,
    month: null,
    day: null,
    alteration: null,
    alterationMix: [],
    type: null,
    environment: null,
    special: null,
  };
  if (!sanitizedName) return defaultOut;

  const totdMonthMatch = sanitizedName.match(TOTD_MONTH_PATTERN);
  if (totdMonthMatch?.groups) {
    const year = normalizeYear(totdMonthMatch.groups.year);
    const month = normalizeMapNumber(totdMonthMatch.groups.month);
    if (year && month && month >= 1 && month <= 12) {
      return {
        ...defaultOut,
        parserPattern: "campaign-totd-month",
        year,
        month,
        special: "TOTD",
      };
    }
  }

  const totdDayMatch = sanitizedName.match(TOTD_DAY_PREFIX_PATTERN);
  if (totdDayMatch?.groups) {
    const year = normalizeYear(totdDayMatch.groups.year);
    const month = normalizeMapNumber(totdDayMatch.groups.month);
    const day = normalizeMapNumber(totdDayMatch.groups.day);
    if (year && month && month >= 1 && month <= 12 && day && day >= 1 && day <= 31) {
      return {
        ...defaultOut,
        parserPattern: "campaign-totd-day-prefix",
        year,
        month,
        day,
        special: "TOTD",
      };
    }
  }

  const competitionMatch = parseCompetitionCampaignStandardizedFields(sanitizedName);
  if (competitionMatch) {
    return competitionMatch;
  }

  const tokens = tokenizeCampaignName(sanitizedName);
  if (!tokens.length) return defaultOut;

  const specialMatch = matchAliasFromTokens(tokens, SPECIAL_CAMPAIGN_BY_TOKEN);
  if (specialMatch) {
    const remaining = tokens.slice(specialMatch.consumed);
    const environmentMatch = matchAliasFromTokens(remaining, ENVIRONMENT_BY_TOKEN);
    const environment = environmentMatch ? environmentMatch.value : null;
    const alterationTail = remaining.slice(environmentMatch ? environmentMatch.consumed : 0).join(" ");
    const startYear = normalizeYear(new Date(startTimestamp || "").getUTCFullYear());
    const year = specialMatch.value.defaultYear || startYear || null;
    const weeklyIndexOnly =
      specialMatch.value.label === "Weekly Shorts" &&
      /^\d{1,3}$/.test(normalizeWhitespace(alterationTail || ""));
    const alteration = weeklyIndexOnly ? null : formatCampaignAlterationLabel(alterationTail);
    const alterationMix = weeklyIndexOnly
      ? []
      : uniqueLower(splitAlterationTail(alterationTail));
    return {
      sanitizedName,
      parserPattern: "campaign-special-prefix",
      season: specialMatch.value.label,
      year,
      alteration,
      alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
      type: null,
      environment,
      special: specialMatch.value.label,
    };
  }

  const seasonMatch = matchAliasFromTokens(tokens, SEASON_BY_TOKEN);
  if (!seasonMatch) {
    const combinedToken = toText(tokens[0]);
    const combinedMatch = combinedToken.match(/^(?<season>[A-Za-z]{2})(?<year>\d{2,4})$/);
    if (!combinedMatch?.groups) return defaultOut;
    const combinedSeason = normalizeSeason(combinedMatch.groups.season);
    const combinedYear = normalizeYear(combinedMatch.groups.year);
    if (!combinedSeason || !combinedYear) return defaultOut;

    const remainingAfterCombined = tokens.slice(1);
    const typeMatch = matchAliasFromTokens(remainingAfterCombined, TYPE_BY_TOKEN);
    const afterType = remainingAfterCombined.slice(typeMatch ? typeMatch.consumed : 0);
    const environmentMatch = matchAliasFromTokens(afterType, ENVIRONMENT_BY_TOKEN);
    const afterEnvironment = afterType.slice(environmentMatch ? environmentMatch.consumed : 0);
    const alterationTail = afterEnvironment.join(" ");
    const alteration = formatCampaignAlterationLabel(alterationTail);
    const alterationMix = uniqueLower(splitAlterationTail(alterationTail));

    return {
      sanitizedName,
      parserPattern: "campaign-season-year-combined-token",
      season: combinedSeason,
      year: combinedYear,
      alteration,
      alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
      type: typeMatch ? typeMatch.value : null,
      environment: environmentMatch ? environmentMatch.value : null,
      special: null,
    };
  }

  const remainingAfterSeason = tokens.slice(seasonMatch.consumed);
  if (!remainingAfterSeason.length) return {
    ...defaultOut,
    season: seasonMatch.value,
    parserPattern: "campaign-season-only",
  };

  const yearToken = toText(remainingAfterSeason[0]);
  const year = normalizeYear(yearToken);
  const remainingAfterYear = year ? remainingAfterSeason.slice(1) : remainingAfterSeason;
  const typeMatch = matchAliasFromTokens(remainingAfterYear, TYPE_BY_TOKEN);
  const afterType = remainingAfterYear.slice(typeMatch ? typeMatch.consumed : 0);
  const environmentMatch = matchAliasFromTokens(afterType, ENVIRONMENT_BY_TOKEN);
  const afterEnvironment = afterType.slice(environmentMatch ? environmentMatch.consumed : 0);
  const alterationTail = afterEnvironment.join(" ");
  const alteration = formatCampaignAlterationLabel(alterationTail);
  const alterationMix = uniqueLower(splitAlterationTail(alterationTail));

  return {
    sanitizedName,
    parserPattern: "campaign-season-year-prefix",
    season: seasonMatch.value,
    year,
    alteration,
    alterationMix: alterationMix.length ? alterationMix : alteration ? [alteration] : [],
    type: typeMatch ? typeMatch.value : null,
    environment: environmentMatch ? environmentMatch.value : null,
    special: null,
  };
}

function extractMapNumberFromText(rawValue, { season = null, year = null } = {}) {
  const mapNumbers = extractMapNumbersFromText(rawValue, { season, year });
  return mapNumbers[0] || null;
}

function extractMapNumbersFromText(rawValue, { season = null, year = null } = {}) {
  const sanitizedName = sanitizeMapName(rawValue);
  if (!sanitizedName) return [];

  const totdDayMatch = sanitizedName.match(TOTD_DAY_PREFIX_PATTERN);
  if (totdDayMatch?.groups?.day) {
    const parsedYear = normalizeYear(totdDayMatch.groups.year);
    const day = normalizeMapNumber(totdDayMatch.groups.day);
    if (day && (!year || !parsedYear || parsedYear === year)) {
      return [day];
    }
  }

  const training = parseTrainingFields(sanitizedName);
  if (training?.mapNumbers?.length) {
    if (season && training.season && training.season !== season) return [];
    if (year && training.year && training.year !== year) return [];
    return training.mapNumbers;
  }

  const parsed = parseStandardizedFields(sanitizedName);
  if (Array.isArray(parsed?.mapNumbers) && parsed.mapNumbers.length) return parsed.mapNumbers;
  if (parsed?.mapNumber) return [parsed.mapNumber];

  const seasonMatch = sanitizedName.match(MAP_NUMBER_AFTER_SEASON_PATTERN);
  if (seasonMatch?.groups?.map) {
    const parsedSeason = normalizeSeason(seasonMatch.groups.season);
    const mapNumber = normalizeMapNumber(seasonMatch.groups.map);
    if (mapNumber && (!season || !parsedSeason || parsedSeason === season)) {
      return [mapNumber];
    }
  }

  const yearMatch = sanitizedName.match(MAP_NUMBER_AFTER_YEAR_PATTERN);
  if (yearMatch?.groups?.map) {
    const parsedYear = normalizeYear(yearMatch.groups.year);
    const mapNumber = normalizeMapNumber(yearMatch.groups.map);
    if (mapNumber && (!year || !parsedYear || parsedYear === year)) {
      return [mapNumber];
    }
  }

  const spring2020Match = sanitizedName.match(SPRING_2020_CODE_PATTERN);
  if (spring2020Match?.groups?.code) {
    const decoded = parseSpring2020Code(spring2020Match.groups.code);
    if (decoded?.mapNumber) return [decoded.mapNumber];
  }

  const leadingMapMatch = sanitizedName.match(LEADING_MAP_NUMBER_PATTERN);
  if (leadingMapMatch?.groups?.map) {
    const mapNumber = normalizeMapNumber(leadingMapMatch.groups.map);
    if (mapNumber) return [mapNumber];
  }

  return [];
}

function deriveMapNumbers({
  mapName = "",
  filename = "",
  campaignName = "",
  slot = null,
  campaignMapCount = null,
  season = null,
  year = null,
} = {}) {
  const candidates = [
    { values: extractMapNumbersFromText(mapName, { season, year }), source: "map-name-regex" },
    { values: extractMapNumbersFromText(filename, { season, year }), source: "filename-regex" },
    { values: extractMapNumbersFromText(campaignName, { season, year }), source: "campaign-regex" },
  ].filter((item) => item.values.length);

  let source = candidates[0]?.source || "";
  let values = candidates.flatMap((item) => item.values);

  if (!values.length) {
    const normalizedCampaignMapCount = normalizeMapNumber(campaignMapCount);
    const fallbackSlot = normalizeMapNumber(slot);
    if (normalizedCampaignMapCount === 25 && fallbackSlot) {
      values.push(fallbackSlot);
      source = "campaign-slot-fallback-25";
    }
  }

  return {
    mapNumbers: uniqueLower(values).map((value) => normalizeMapNumber(value)).filter(Boolean),
    source,
    usedSlotFallback: source === "campaign-slot-fallback-25",
  };
}

function parseStandardizedFields(rawName) {
  const sanitizedName = sanitizeMapName(rawName);
  const defaultOut = {
    sanitizedName,
    parserPattern: "",
    season: null,
    year: null,
    mapNumber: null,
    mapNumbers: [],
    alterationMix: [],
    proposedName: null,
  };
  if (!sanitizedName) return defaultOut;

  const prefixMatch = sanitizedName.match(SEASONAL_PREFIX_PATTERN);
  if (prefixMatch?.groups) {
    const season = normalizeSeason(prefixMatch.groups.season);
    const year = normalizeYear(prefixMatch.groups.year);
    const mapNumber = normalizeMapNumber(prefixMatch.groups.map);
    const alterationMix = splitAlterationTail(prefixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-prefix",
      season,
      year,
      mapNumber,
      mapNumbers: mapNumber ? [mapNumber] : [],
      alterationMix,
      proposedName: null,
    };
  }

  const suffixMatch = sanitizedName.match(SEASONAL_SUFFIX_PATTERN);
  if (suffixMatch?.groups) {
    const season = normalizeSeason(suffixMatch.groups.season);
    const year = normalizeYear(suffixMatch.groups.year);
    const mapNumber = normalizeMapNumber(suffixMatch.groups.map);
    const alterationMix = splitAlterationTail(suffixMatch.groups.tail || "");
    return {
      sanitizedName,
      parserPattern: "season-year-map-suffix",
      season,
      year,
      mapNumber,
      mapNumbers: mapNumber ? [mapNumber] : [],
      alterationMix,
      proposedName: null,
    };
  }

  const springCodeMatch = sanitizedName.match(SPRING_2020_CODE_PATTERN);
  if (springCodeMatch?.groups?.code) {
    const decoded = parseSpring2020Code(springCodeMatch.groups.code);
    if (decoded) {
      const alterationMix = splitAlterationTail(springCodeMatch.groups.tail || "");
      return {
        sanitizedName,
        parserPattern: "spring-2020-code",
        season: decoded.season,
        year: decoded.year,
        mapNumber: decoded.mapNumber,
        mapNumbers: decoded.mapNumber ? [decoded.mapNumber] : [],
        alterationMix,
        proposedName: null,
      };
    }
  }

  const colorMapped = parseColorMappedFields(sanitizedName);
  if (colorMapped?.mapNumbers?.length) {
    return {
      sanitizedName,
      parserPattern: colorMapped.parserPattern,
      season: colorMapped.season,
      year: colorMapped.year,
      mapNumber: colorMapped.mapNumbers[0] || null,
      mapNumbers: colorMapped.mapNumbers,
      alterationMix: colorMapped.alterationMix,
      proposedName: colorMapped.proposedName || null,
    };
  }

  const training = parseTrainingFields(sanitizedName);
  if (training?.mapNumbers?.length) {
    return {
      sanitizedName,
      parserPattern: training.parserPattern,
      season: training.season,
      year: training.year,
      mapNumber: training.mapNumbers[0] || null,
      mapNumbers: training.mapNumbers,
      alterationMix: training.alterationMix,
      proposedName: training.proposedName || null,
    };
  }

  return defaultOut;
}

function requiresColorMappedRegexWarningText(value = "") {
  const text = sanitizeMapName(value);
  if (!text) return "";
  const hasColor = /\b(?:white|green|blue|red|black)\b/i.test(text);
  if (!hasColor) return "";
  if (/\bcombined\b/i.test(text) && /\b(?:winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\b/i.test(text)) {
    return "Looks like a color-set Combined map, but regex did not resolve its slot range.";
  }
  if (
    /\bboss\b/i.test(text) &&
    /\b(?:winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\b/i.test(text)
  ) {
    return "Looks like a color-set BOSS map, but regex did not resolve its slot range.";
  }
  return "";
}

function deriveParserWarning({
  mapName = "",
  filename = "",
  campaignName = "",
  parserPattern = "",
} = {}) {
  const normalizedPattern = toText(parserPattern).toLowerCase();
  if (
    normalizedPattern.includes("color-combined") ||
    normalizedPattern.includes("boss-")
  ) {
    return null;
  }

  for (const value of [mapName, filename, campaignName]) {
    const warning = requiresColorMappedRegexWarningText(value);
    if (warning) return warning;
  }

  return null;
}

function classifyNamingSimilaritySource(map = {}) {
  const payload = map?.payload && typeof map.payload === "object" ? map.payload : null;
  const campaignPayload =
    map?.campaignPayload && typeof map.campaignPayload === "object" ? map.campaignPayload : null;
  const payloadSourceKey = toText(
    campaignPayload?.sourceKey ||
      campaignPayload?.source_key ||
      payload?.sourceKey ||
      payload?.source_key ||
      payload?.mapDetail?.sourceKey ||
      payload?.mapDetail?.source_key
  ).toLowerCase();
  if (payloadSourceKey) return payloadSourceKey;

  const campaignName = normalizeWhitespace(map?.campaign || map?.campaignName || "");
  const parsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map?.campaignStartTimestamp || map?.startTimestamp || null,
  });
  const special = toText(parsed?.special).toLowerCase();
  const type = toText(parsed?.type).toLowerCase();

  if (special === "weekly shorts") return "weekly-shorts";
  if (special === "weekly grands") return "weekly-grands";
  if (special === "totd") return "official-totd";
  if (special.includes("discovery")) return "official-discovery";
  if (type === "tmgl" || type === "tmwt" || type === "tmwc") return "official-competition";
  if (toText(parsed?.season)) return "official-seasonal-v2";
  return "";
}

function shouldExcludeFromNamingReview(map = {}) {
  const payload = map?.payload && typeof map.payload === "object" ? map.payload : null;
  const campaignPayload =
    map?.campaignPayload && typeof map.campaignPayload === "object" ? map.campaignPayload : null;
  const campaignName = normalizeWhitespace(map?.campaign || map?.campaignName || "");
  const campaignParsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map?.campaignStartTimestamp || map?.startTimestamp || null,
  });

  const payloads = [campaignPayload, payload].filter(Boolean);
  for (const entry of payloads) {
    const explicitCanonical =
      entry?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.weekly_shorts?.isCanonicalNadeoWeek ??
      entry?.campaign?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.campaign?.weekly_shorts?.isCanonicalNadeoWeek ??
      entry?.campaignMetadata?.weeklyShorts?.isCanonicalNadeoWeek ??
      entry?.campaignMetadata?.weekly_shorts?.isCanonicalNadeoWeek;
    if (explicitCanonical === false) {
      return true;
    }
    if (explicitCanonical === true) {
      return false;
    }
  }

  if (toText(campaignParsed?.special).toLowerCase() !== "weekly shorts") {
    return false;
  }

  const week = resolveWeeklyShortsWeek({
    campaignName,
    campaignPayload,
    mapPayload: payload,
  });
  if (!week) return false;
  return !resolveCanonicalWeeklyShortsWeek(week);
}

function buildMapNameCandidate(map = {}) {
  const mapUid = toText(map.mapUid || map.uid || map.map_uid || "");
  const originalName = normalizeWhitespace(map.name || map.mapName || map.title || "");
  const payload = map.payload && typeof map.payload === "object" ? map.payload : null;
  const filename = sanitizeMapName(
    toText(
      map.filename ||
        map.fileName ||
        map.file_name ||
        payload?.filename ||
        payload?.mapDetail?.filename ||
        ""
    ).replace(/\.map\.gbx$/i, "")
  );
  const campaignName = normalizeWhitespace(map.campaign || map.campaignName || "");
  const campaignParsed = parseCampaignStandardizedFields(campaignName, {
    startTimestamp: map.campaignStartTimestamp || map.startTimestamp || null,
  });
  const weeklyShortsEntry =
    toText(campaignParsed.special).toLowerCase() === "weekly shorts"
      ? resolveWeeklyShortsEntry({
          campaignName,
          campaignPayload: map.campaignPayload,
          mapPayload: payload,
          slot: map.slot,
          mapName: originalName,
          filename,
        })
      : null;
  const weeklyGrandWeek =
    toText(campaignParsed.special).toLowerCase() === "weekly grands"
      ? resolveWeeklyGrandWeek({
          campaignName,
          campaignPayload: map.campaignPayload,
          mapPayload: payload,
        })
      : null;
  if (weeklyShortsEntry) {
    return {
      mapUid,
      originalName: originalName || mapUid,
      sanitizedName:
        sanitizeMapName(weeklyShortsEntry.title) ||
        originalName ||
        mapUid,
      proposedName: `Weekly Shorts - ${String(weeklyShortsEntry.mapNumber).padStart(2, "0")} | ${weeklyShortsEntry.title}`,
      parserPattern: weeklyShortsEntry.source,
      parserConfidence: 100,
      season: "Weekly Shorts",
      year: null,
      mapNumber: weeklyShortsEntry.mapNumber,
      mapNumbers: [weeklyShortsEntry.mapNumber],
      alteration: null,
      alterationMix: [],
      automationState: "matched",
      requiresRegex: false,
      sourceVersion: SOURCE_VERSION,
      weeklyShortsWeek: weeklyShortsEntry.week,
      weeklyShortsCanonicalWeek: weeklyShortsEntry.canonicalWeek || null,
      weeklyShortsPosition: weeklyShortsEntry.position,
      weeklyShortsTitle: weeklyShortsEntry.title,
    };
  }
  const isCanonicalWeeklyGrand = Boolean(
    payload?.weeklyGrand?.isCanonicalNadeoWeek ||
      payload?.weekly_grand?.isCanonicalNadeoWeek ||
      map.campaignPayload?.weeklyGrand?.isCanonicalNadeoWeek ||
      map.campaignPayload?.weekly_grand?.isCanonicalNadeoWeek
  );
  if (weeklyGrandWeek && isCanonicalWeeklyGrand) {
    return {
      mapUid,
      originalName: originalName || mapUid,
      sanitizedName: originalName || mapUid,
      proposedName: `Weekly Grands - ${String(weeklyGrandWeek).padStart(2, "0")}`,
      parserPattern: "weekly-grands-week",
      parserConfidence: 100,
      season: "Weekly Grands",
      year: null,
      mapNumber: weeklyGrandWeek,
      mapNumbers: [weeklyGrandWeek],
      alteration: null,
      alterationMix: [],
      automationState: "matched",
      requiresRegex: false,
      sourceVersion: SOURCE_VERSION,
      weeklyGrandWeek,
    };
  }
  const parsed = parseStandardizedFields(originalName);
  const parsedFilename = parseStandardizedFields(filename);
  const competitionMapParsed =
    normalizeCompetitionType(campaignParsed.type) || toText(campaignParsed.special).toUpperCase() === "TMWC"
      ? parseCompetitionMapAlterationFields(originalName) || parseCompetitionMapAlterationFields(filename)
      : null;
  const mapNumbersResult = deriveMapNumbers({
    mapName: originalName,
    filename,
    campaignName,
    slot: map.slot,
    campaignMapCount: map.campaignMapCount,
    season: campaignParsed.season || parsedFilename.season || parsed.season || null,
    year: campaignParsed.year || parsedFilename.year || parsed.year || null,
  });
  const mapNumbers = mapNumbersResult.mapNumbers;
  const alterationMix = uniqueLower([
    ...(Array.isArray(campaignParsed.alterationMix) ? campaignParsed.alterationMix : []),
    ...(Array.isArray(competitionMapParsed?.alterationMix) ? competitionMapParsed.alterationMix : []),
    ...(Array.isArray(parsedFilename.alterationMix) ? parsedFilename.alterationMix : []),
    ...(Array.isArray(parsed.alterationMix) ? parsed.alterationMix : []),
  ]);
  const season =
    campaignParsed.season ||
    parsedFilename.season ||
    parsed.season ||
    null;
  const year =
    campaignParsed.year ||
    parsedFilename.year ||
    parsed.year ||
    null;
  const mapNumber = mapNumbers[0] || null;
  const alteration =
    campaignParsed.alteration ||
    (alterationMix.length === 1
      ? alterationMix[0]
      : alterationMix.length > 1
        ? alterationMix.join(" + ")
        : null);
  const parserPattern =
    (Array.isArray(parsed.mapNumbers) && parsed.mapNumbers.length ? parsed.parserPattern : null) ||
    (Array.isArray(parsedFilename.mapNumbers) && parsedFilename.mapNumbers.length
      ? parsedFilename.parserPattern
      : null) ||
    campaignParsed.parserPattern ||
    competitionMapParsed?.parserPattern ||
    parsedFilename.parserPattern ||
    parsed.parserPattern ||
    (mapNumbersResult.usedSlotFallback ? "campaign-slot-fallback-25" : null);
  const parserWarning = deriveParserWarning({
    mapName: originalName,
    filename,
    campaignName,
    parserPattern,
  });

  const confidence = calculateConfidence({
    hasSeason: Boolean(season),
    hasYear: Boolean(year),
    hasMapNumber: Boolean(mapNumber),
    alterationMix,
    sanitizedName: campaignParsed.sanitizedName || parsedFilename.sanitizedName || parsed.sanitizedName,
    parserPattern,
  });
  const proposedName =
    parsed.proposedName ||
    parsedFilename.proposedName ||
    formatProposedName({
      season,
      year,
      mapNumber,
      alterationMix,
    });
  const automationState = mapNumbers.length && (season || year) ? "matched" : "unmatched";

  return {
    mapUid,
    originalName: originalName || mapUid,
    sanitizedName:
      competitionMapParsed?.canonicalTitle ||
      parsed.sanitizedName ||
      parsedFilename.sanitizedName ||
      campaignParsed.sanitizedName ||
      originalName ||
      mapUid,
    proposedName: proposedName || null,
    parserPattern,
    parserConfidence: confidence,
    season: season || null,
    year: year || null,
    mapNumber,
    mapNumbers,
    alteration: alteration || null,
    alterationMix,
    parserWarning,
    automationState,
    requiresRegex: mapNumbers.length === 0,
    sourceVersion: SOURCE_VERSION,
  };
}

export {
  SOURCE_VERSION,
  WEEKLY_SHORTS_CANONICAL_MAPS,
  sanitizeMapName,
  parseStandardizedFields,
  parseCampaignStandardizedFields,
  resolveCanonicalWeeklyShortsWeek,
  resolveWeeklyGrandWeek,
  resolveWeeklyShortsWeek,
  resolveWeeklyShortsEntry,
  normalizeWeeklyShortsTitle,
  extractMapNumberFromText,
  extractMapNumbersFromText,
  deriveMapNumbers,
  deriveParserWarning,
  classifyNamingSimilaritySource,
  shouldExcludeFromNamingReview,
  buildMapNameCandidate,
};
