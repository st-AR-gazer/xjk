import { normalizeAliasValue } from "./baseText.js";

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
  COMPETITION_CAMPAIGN_DEFINITIONS.flatMap((entry) => entry.aliases.map((alias) => [normalizeAliasValue(alias), entry]))
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
  WEEKLY_SHORTS_CANONICAL_MAPS.map((entry) => [normalizeAliasValue(entry.title), entry])
);

const ALTERATION_ALIASES = new Map(
  Object.entries({
    "100x boost": "100x Booster",
    "100xbooster": "100x Booster",
    "100x booster": "100x Booster",
    "all 1up": "1Up",
    antiboost: "Antiboost",
    "anti boost": "Antiboost",
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
    undrwater: "Underwater",
    underwater: "Underwater",
    uw: "Underwater",
    reverse: "Reverse",
    rev: "Reverse",
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
    "there&back": "There and Back",
    "there back": "There and Back",
    boomerang: "There and Back",
    checkpointless: "Checkpointless",
    cpless: "Checkpointless",
    "cp less": "Checkpointless",
    magna: "Magnet",
    sttf: "Straight to the Finish",
    stts: "Straight to the Start",
    "straight to the finish": "Straight to the Finish",
    "straight to the start": "Straight to the Start",
    "sky finish": "Sky is the Finish",
    "sky is the finish": "Sky is the Finish",
    "cp1 end": "CP1 is End",
    "cp1 is end": "CP1 is End",
    "cp1 kept": "CP1 Kept",
    "cp1 to start": "CP1 to Start",
    cpfull: "CPFull",
    "cp full": "CPFull",
    "cp bump": "CP Bump",
    "cp boost": "CP Boost",
    "cp is engineoff": "CP is EngineOff",
    "cps 90°": "CPs Rotated 90",
    "cps 90": "CPs Rotated 90",
    "cps rotated 90": "CPs Rotated 90",
    "cruise control": "Cruise",
    "ice short": "Ice Short",
    iceshort: "Ice Short",
    wetplastic: "Wet Plastic",
    "wet plastic": "Wet Plastic",
    weticywood: "Wet Icy Wood",
    pureweticywood: "Wet Icy Wood",
    "weticywood pure": "Wet Icy Wood",
    "wet icy wood pure": "Wet Icy Wood",
    "pure wet icy wood": "Wet Icy Wood",
    "wet icy wood": "Wet Icy Wood",
    "wet icy plastic": "Wet Icy Plastic",
    "wet wood": "Wet Wood",
    "wet wood yrd": "Wet Wood",
    "wet wood rrd": "Wet Wood",
    "random dank": "Random Dankness",
    rngboost: "RNG Booster",
    "rng boost": "RNG Booster",
    "effect planes": "Effect Planes",
    "red effects": "Red Effects",
    "reverse boost": "Reverse Boost",
    carswitch: "Carswitch",
    "car switch": "Carswitch",
    "4carswitch": "4 Carswitch",
    "4 carswitch": "4 Carswitch",
    "4cs": "4 Carswitch",
    "4 car choice": "4 Car Choice",
    "4cs planes": "4 Carswitch Planes",
    "4 carswitch planes": "4 Carswitch Planes",
    "4carswitch planes": "4 Carswitch Planes",
    "4 carswitch straight to the finish": "4 Carswitch Straight to the Finish",
    "4carswitch sttf": "4 Carswitch Straight to the Finish",
    "fewest blocks": "Fewest Blocks",
    "floor-fin": "Floor-Fin",
    "floor fin": "Floor-Fin",
    "ground clippers": "Ground Clippers",
    "mini rpg": "Mini RPG",
    "no items": "No Items",
    "ring cp": "Ring CP",
    "select del": "Select Del",
    "to the top": "To The Top",
    "yeet down": "YEET Down",
    "yeet max-up": "YEET Max-Up",
    "yeet max up": "YEET Max-Up",
    "yeet puzzle": "YEET Puzzle",
    "yeet reverse": "YEET Reverse",
    "yeet there&back": "YEET There and Back",
    "yeet there back": "YEET There and Back",
    "yeet there and back": "YEET There and Back",
    yeetrandmpuzzle: "YEET Random Puzzle",
    "official nadeo map": "Unaltered Nadeo",
  })
);

const ALTERATION_SEQUENCE_ALIASES = new Map(
  Object.entries({
    "4 carswitch straight to the finish": ["4 Carswitch", "Straight to the Finish"],
    "4carswitch sttf": ["4 Carswitch", "Straight to the Finish"],
    "deet to the top": ["YEET Down", "To The Top"],
    "cp1 end reverse": ["CP1 is End", "Reverse"],
    "cp1 is end reverse": ["CP1 is End", "Reverse"],
    "rev cp1 end": ["Reverse", "CP1 is End"],
    "cpless reverse": ["Checkpointless", "Reverse"],
    "cplessrev ¬gate": ["Checkpointless", "Reverse"],
    "checkpointless reverse": ["Checkpointless", "Reverse"],
    "ice reverse": ["Ice", "Reverse"],
    "ice rev": ["Ice", "Reverse"],
    "ice rev reactor": ["Ice", "Reverse", "Reactor"],
    "ice reverse reactor": ["Ice", "Reverse", "Reactor"],
    "magnet reverse": ["Magnet", "Reverse"],
    "magnet rev": ["Magnet", "Reverse"],
    "plastic reverse": ["Plastic", "Reverse"],
    "sky finish reverse": ["Sky is the Finish", "Reverse"],
    "sky is the finish reverse": ["Sky is the Finish", "Reverse"],
    "underwater reverse": ["Underwater", "Reverse"],
    "undrwater reverse": ["Underwater", "Reverse"],
    "unw reverse": ["Underwater", "Reverse"],
    "yeet reverse": ["YEET", "Reverse"],
    "yeet puzzle": ["YEET", "Puzzle"],
    "yeet there back": ["YEET", "There and Back"],
    "yeet there&back": ["YEET", "There and Back"],
    "yeet there and back": ["YEET", "There and Back"],
    "yeet random puzzle": ["YEET", "Random", "Puzzle"],
    yeetrandmpuzzle: ["YEET", "Random", "Puzzle"],
    "road dirt": ["Road", "Dirt"],
    "race sttf": ["Straight to the Finish"],
    "terrain sttf": ["Terrain", "Straight to the Finish"],
  })
);

const SEASONAL_PREFIX_PATTERN =
  /^(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})(?:\s+(?<tail>.+))?$/i;
const SEASONAL_SUFFIX_PATTERN =
  /^(?<tail>.+?)\s+(?<season>winter|spring|summer|fall|autumn|training|wi|sp|su|fa)\s+(?<year>\d{2,4})\s*-\s*(?<map>\d{1,2})$/i;
const SPRING_2020_CODE_PATTERN = /^(?<code>[STst][0-1]\d)(?:\s*[-:]\s*|\s+)?(?<tail>.*)$/;
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
const TOTD_DAY_PREFIX_PATTERN = /^(?<day>\d{1,2})\/(?<month>\d{1,2})\/(?<year>\d{4})(?:\s+(?<tail>.+))?$/i;

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

export {
  ALTERATION_ALIASES,
  ALTERATION_SEQUENCE_ALIASES,
  BOSS_SEASONAL_PATTERN_1,
  BOSS_SEASONAL_PATTERN_2,
  BOSS_SEASONAL_PATTERN_3,
  CANONICAL_WEEKLY_SHORTS_WEEKS,
  COMPETITION_CAMPAIGN_ALIAS_BY_NAME,
  COMPETITION_TYPE_BY_TOKEN,
  ENVIRONMENT_BY_TOKEN,
  LEADING_MAP_NUMBER_PATTERN,
  MAPNUMBER_COLOR_RANGES,
  MAP_NUMBER_AFTER_SEASON_PATTERN,
  MAP_NUMBER_AFTER_YEAR_PATTERN,
  SEASONAL_COLOR_COMBINED_PATTERN,
  SEASONAL_PREFIX_PATTERN,
  SEASONAL_SUFFIX_PATTERN,
  SEASON_BY_TOKEN,
  SOURCE_VERSION,
  SPECIAL_CAMPAIGN_BY_TOKEN,
  SPRING_2020_CODE_PATTERN,
  TM_STYLE_CODE_PATTERN,
  TOTD_DAY_PREFIX_PATTERN,
  TOTD_MONTH_PATTERN,
  TRAINING_COLOR_COMBINED_PATTERN,
  TRAINING_DEFAULT_YEAR,
  TRAINING_MULTI_PAIR_PREFIX_PATTERN,
  TRAINING_MULTI_PAIR_SUFFIX_PATTERN,
  TRAINING_MULTI_RANGE_PATTERN,
  TRAINING_MULTI_SNOW_WOOD_PATTERN,
  TRAINING_MULTI_SURFACELESS_16171819_PATTERN,
  TRAINING_MULTI_WET_ICY_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_ICY_WOOD_PATTERN,
  TRAINING_MULTI_WET_PLASTIC_PAIR_PATTERN,
  TRAINING_MULTI_WET_WOOD_PAIR_PATTERN,
  TRAINING_NUMBER_BEFORE_DASH_PATTERN,
  TRAINING_PREFIX_BEFORE_SEASON_PATTERN,
  TRAINING_PREFIX_PATTERN,
  TRAINING_TAIL_BEFORE_DASH_PATTERN,
  TYPE_BY_TOKEN,
  WEEKLY_SHORTS_BY_TITLE,
  WEEKLY_SHORTS_BY_WEEK_AND_POSITION,
  WEEKLY_SHORTS_CANONICAL_MAPS,
};
