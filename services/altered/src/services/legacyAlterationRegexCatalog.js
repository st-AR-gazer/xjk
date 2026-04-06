
const LEGACY_ALTERATION_REGEX_CATALOG = Object.freeze({
  "dirt": {
    "name": "Dirt",
    "entries": [
      {
        "label": "Pattern seasonal: \"Dirty <season> <year> - <mapnumber>\"",
        "legacyPatternId": "dirt_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Dirty)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Dirty Training - <mapnumber>\"",
        "legacyPatternId": "dirt_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Dirty)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Dirt)\"",
        "legacyPatternId": "dirt_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>Dirt)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Dirt)\"",
        "legacyPatternId": "dirt_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Dirt)\\)$\""
      }
    ]
  },
  "fast-magnet": {
    "name": "fast magnet",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> FastMagnet\"",
        "legacyPatternId": "fastmagnet_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>FastMagnet)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - FastMagnet\"",
        "legacyPatternId": "fastmagnet_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s*(?P<alteration_mix>FastMagnet)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Fast Magnet\"",
        "legacyPatternId": "fastmagnet_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s*(?P<alteration_mix>Fast Magnet)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> FastMagnet\"",
        "legacyPatternId": "fastmagnet_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>FastMagnet)$\""
      }
    ]
  },
  "flooded": {
    "name": "Flooded",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Flooded\"",
        "legacyPatternId": "flooded_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Flooded)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Flooded\"",
        "legacyPatternId": "flooded_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Flooded)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - Flooded\"",
        "legacyPatternId": "flooded_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Flooded)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> - Flooded\"",
        "legacyPatternId": "flooded_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+-\\s+(?P<alteration_mix>Flooded)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - Flooded\"",
        "legacyPatternId": "flooded_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+-\\s+(?P<alteration_mix>Flooded)$\""
      }
    ]
  },
  "grass": {
    "name": "Grass",
    "entries": [
      {
        "label": "Pattern seasonal: \"Grassy <season> <year> - <mapnumber>\"",
        "legacyPatternId": "grass_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Grassy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern Training: \"Grassy Training - <mapnumber>\"",
        "legacyPatternId": "grass_training_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Grassy)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (grass)\"",
        "legacyPatternId": "grass_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>grass)\\)$\""
      }
    ]
  },
  "ice": {
    "name": "Ice",
    "entries": [
      {
        "label": "Pattern seasonal: \"Icy <season> <year> - <mapnumber>\"",
        "legacyPatternId": "ice_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<alteration_mix><season> <year> - <mapnumber>\"",
        "legacyPatternId": "ice_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Ice)\\s*(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> Ice Edition - <mapnumber>\"",
        "legacyPatternId": "ice_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Ice Edition)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Icy Training - <mapnumber>\"",
        "legacyPatternId": "ice_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern spring2020: \"Icy <spring2020><mapnumber>\"",
        "legacyPatternId": "ice_spring2020_pattern_1",
        "pattern": "r\"^(?P<alteration_mix>Icy)\\s+(?P<spring2020>[STst][0-1]\\d)$\""
      },
      {
        "label": "Pattern discovery: Icy \"<discoveryname>\"",
        "legacyPatternId": "ice_discovery_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy)\\s+(?P<discoveryname>{discovery_pattern_group})$\""
      },
      {
        "label": "Pattern totd: \"Icy <totdname>\"",
        "legacyPatternId": "ice_totd_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy)\\s+(?P<name>{totd_pattern_group})$\""
      },
      {
        "label": "Pattern weekly shorts: \"Icy <weeklyshortsname>\"",
        "legacyPatternId": "ice_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy)\\s+(?P<name>{weeklyshorts_pattern_group})$\""
      }
    ]
  },
  "magnet": {
    "name": "Magnet",
    "entries": [
      {
        "label": "Pattern season: \"<season> <year> - <mapnumber> Magnet\"",
        "legacyPatternId": "magnet_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Magnet)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Magnet\"",
        "legacyPatternId": "magnet_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Magnet)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> Magnet\"",
        "legacyPatternId": "magnet_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>Magnet)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> Magnet\"",
        "legacyPatternId": "magnet_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+(?P<alteration_mix>Magnet)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Magnet)\"",
        "legacyPatternId": "magnet_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>Magnet)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> Magnet\"",
        "legacyPatternId": "magnet_totd_pattern_2",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+(?P<alteration_mix>Magnet)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> Magnet\"",
        "legacyPatternId": "magnet_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Magnet)$\""
      }
    ]
  },
  "mixed": {
    "name": "Mixed",
    "entries": [
      {
        "label": "Pattern seasonal: \"Mixed <season> <year> - <mapnumber>\"",
        "legacyPatternId": "mixed_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Mixed)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Mixed Training - <mapnumber>\"",
        "legacyPatternId": "mixed_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Mixed)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Mixed Training - <mapnumber_1>-<mapnumber_2>\"",
        "legacyPatternId": "mixed_training_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Mixed)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber_1>\\d{{1,2}})-(?P<mapnumber_2>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Mixed)\"",
        "legacyPatternId": "mixed_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Mixed)\\)$\""
      }
    ]
  },
  "penalty": {
    "name": "Penalty",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Penalty\"",
        "legacyPatternId": "penalty_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Penalty)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Penalty\"",
        "legacyPatternId": "penalty_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Penalty)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> Penalty\"",
        "legacyPatternId": "penalty_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Penalty)$\""
      }
    ]
  },
  "plastic": {
    "name": "Plastic",
    "entries": [
      {
        "label": "Pattern seasonal: \"Plastic <season> <year> - <mapnumber>\"",
        "legacyPatternId": "plastic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Plastic Training - <mapnumber>\"",
        "legacyPatternId": "plastic_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Plastic)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Plastic Training - <mapnumber_1> & <mapnumber_2>\"",
        "legacyPatternId": "plastic_training_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Plastic)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber_1>\\d{{1,2}})\\s+&\\s+(?P<mapnumber_2>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern spring2020: \"Plastic <spring2020><mapnumber>\"",
        "legacyPatternId": "plastic_spring2020_pattern_1",
        "pattern": "r\"^(?P<alteration_mix>Plastic)\\s+(?P<spring2020>[STst][0-1]\\d)$\""
      },
      {
        "label": "Pattern discovery: \"Plastic <discoveryname>\"",
        "legacyPatternId": "plastic_discovery_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Plastic)\\s+(?P<discoveryname>{discovery_pattern_group})$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> Plastic\"",
        "legacyPatternId": "plastic_discovery_pattern_2",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+(?P<alteration_mix>Plastic)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Plastic)\"",
        "legacyPatternId": "plastic_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Plastic)\\)$\""
      },
      {
        "label": "plastic_totd_pattern_1",
        "legacyPatternId": "plastic_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>Plastic)\\)$\""
      }
    ]
  },
  "road": {
    "name": "Road",
    "entries": [
      {
        "label": "Pattern seasonal: \"Roady <season> <year> - <mapnumber>\"",
        "legacyPatternId": "road_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Roady)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> Road - <mapnumber>\"",
        "legacyPatternId": "road_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Road)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Road\"",
        "legacyPatternId": "road_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Road)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Asphalt\"",
        "legacyPatternId": "roadasphalt_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Asphalt)$\""
      },
      {
        "label": "Pattern seasonal: \"(Tech) <season> <year> - <mapnumber>\"",
        "legacyPatternId": "roadtech_seasonal_pattern_1",
        "pattern": "rf\"^\\(Tech\\)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Roady Training - <mapnumber>\"",
        "legacyPatternId": "road_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Roady)\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Road)\"",
        "legacyPatternId": "road_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Road)\\)$\""
      }
    ]
  },
  "wood": {
    "name": "Wood",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Wood\"",
        "legacyPatternId": "wood_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Wood)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Wood\"",
        "legacyPatternId": "wood_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Wood)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber_1> & <mapnumber_2> Wood\"",
        "legacyPatternId": "wood_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber_21>\\d{{1,2}})\\s+&\\s+(?P<mapnumber_24>\\d{{1,2}})\\s+(?P<alteration_mix>Wood)$\""
      },
      {
        "label": "Pattern spring2020: \"Wood <spring2020><mapnumber>\"",
        "legacyPatternId": "wood_spring2020_pattern_1",
        "pattern": "r\"^(?P<alteration_mix>Wood)\\s+(?P<spring2020>[STst][0-1]\\d)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> Wood\"",
        "legacyPatternId": "wood_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+(?P<alteration_mix>Wood)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Wood)\"",
        "legacyPatternId": "wood_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Wood)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Wood)\"",
        "legacyPatternId": "wood_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>Wood)\\)$\""
      }
    ]
  },
  "bobsleigh": {
    "name": "Bobsleigh",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (bobsleigh)\"",
        "legacyPatternId": "bobsleigh_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>bobsleigh)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Bobsleigh\"",
        "legacyPatternId": "bobsleigh_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Bobsleigh)$\""
      },
      {
        "label": "Pattern seasonal: \"Bobsleigh <season> <year> - <mapnumber>\"",
        "legacyPatternId": "bobsleigh_seasonal_pattern_3",
        "pattern": "rf\"^(?P<alteration_mix>Bobsleigh)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Bobsleigh\"",
        "legacyPatternId": "bobsleigh_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Bobsleigh)$\""
      }
    ]
  },
  "pipe": {
    "name": "Pipe",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Pipe)\"",
        "legacyPatternId": "pipe_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Pipe)\\)$\""
      }
    ]
  },
  "sausage": {
    "name": "Sausage",
    "entries": [
      {
        "label": "Pattern seasonal: \"Saussage <season> <year> - <mapnumber>\"",
        "legacyPatternId": "sausage_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Sausage)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Sausage\"",
        "legacyPatternId": "sausage_training_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Sausage)$\""
      }
    ]
  },
  "slot-track": {
    "name": "Slot Track",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Slot Track\"",
        "legacyPatternId": "slottrack_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Slot Track)$\""
      }
    ]
  },
  "surfaceless": {
    "name": "Surfaceless",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Surfaceless\"",
        "legacyPatternId": "surfaceless_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Surfaceless)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Surfaceless\"",
        "legacyPatternId": "surfaceless_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Surfaceless)$\""
      },
      {
        "label": "Pattern training - 16 17 18 19: \"<season> - <mapnumber_16> <mapnumber_17> <mapnumber_18> <mapnumber_19> Surfaceless\"",
        "legacyPatternId": "surfaceless_training_pattern_16171819",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber_16>\\d{{1,2}})\\s+(?P<mapnumber_17>\\d{{1,2}})\\s+(?P<mapnumber_18>\\d{{1,2}})\\s+(?P<mapnumber_19>\\d{{1,2}})\\s+(?P<alteration_mix>Surfaceless)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (Surfaceless)\"",
        "legacyPatternId": "surfaceless_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Surfaceless)\\)$\""
      }
    ]
  },
  "underwater": {
    "name": "Underwater",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Underwater)\"",
        "legacyPatternId": "underwater_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Underwater)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (UW)\"",
        "legacyPatternId": "underwater_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>UW)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Underwater\"",
        "legacyPatternId": "underwater_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Underwater)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> (Underwater)\"",
        "legacyPatternId": "underwater_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>Underwater)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (Underwater)\"",
        "legacyPatternId": "underwater_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>Underwater)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> Underwater\"",
        "legacyPatternId": "underwater_discovery_pattern_2",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+(?P<alteration_mix>Underwater)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - Underwater\"",
        "legacyPatternId": "underwater_discovery_pattern_3",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+-\\s+(?P<alteration_mix>Underwater)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (UW)\"",
        "legacyPatternId": "underwater_discovery_pattern_4",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>UW)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Underwater)\"",
        "legacyPatternId": "underwater_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>Underwater)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> Underwater\"",
        "legacyPatternId": "underwater_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Underwater)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> - Underwater\"",
        "legacyPatternId": "underwater_weeklyshorts_pattern_2",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+-\\s+(?P<alteration_mix>Underwater)$\""
      }
    ]
  },
  "antiboost": {
    "name": "Antiboost",
    "entries": [
      {
        "label": "antiboost_seasional_pattern_1",
        "legacyPatternId": "antiboost_seasional_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Antiboost)$\""
      }
    ]
  },
  "boosterless": {
    "name": "Boosterless",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Boosterless)\"",
        "legacyPatternId": "boosterless_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Boosterless)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> Boosterless - <mapnumber>\"",
        "legacyPatternId": "boosterless_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Boosterless)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Boosterless\"",
        "legacyPatternId": "boosterless_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Boosterless)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> Boosterless\"",
        "legacyPatternId": "boosterless_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>Boosterless)$\""
      }
    ]
  },
  "broken": {
    "name": "Broken",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Broken\"",
        "legacyPatternId": "broken_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Broken)$\""
      }
    ]
  },
  "cleaned": {
    "name": "Cleaned",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Cleaned\"",
        "legacyPatternId": "cleaned_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Cleaned)$\""
      }
    ]
  },
  "cruise-control": {
    "name": "Cruise Control",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Cruise Control\"",
        "legacyPatternId": "cruisecontrol_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Cruise Control)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Cruise Control\"",
        "legacyPatternId": "cruisecontrol_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Cruise Control)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> Cruise Control\"",
        "legacyPatternId": "cruisecontrol_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Cruise Control)$\""
      }
    ]
  },
  "cp-is-engine-off": {
    "name": "CP is Engine Off",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP is Engine Off\"",
        "legacyPatternId": "cpengineoff_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP is Engine Off)$\""
      }
    ]
  },
  "cruise-effects": {
    "name": "Cruise Effects",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Cruise Effects\"",
        "legacyPatternId": "cruiseeffects_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Cruise Effects)$\""
      },
      {
        "label": "Pattern sesaonal: \"Training - <mapnumber> Cruise Effects\"",
        "legacyPatternId": "cruiseeffects_training_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Cruise Effects)$\""
      }
    ]
  },
  "fast": {
    "name": "Fast",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Fast)\"",
        "legacyPatternId": "fast_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Fast)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Fast\"",
        "legacyPatternId": "fast_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Fast)$\""
      }
    ]
  },
  "fragile": {
    "name": "Fragile",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Fragile)\"",
        "legacyPatternId": "fragile_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Fragile)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Fragile\"",
        "legacyPatternId": "fragile_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Fragile)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> but it's Fragile\"",
        "legacyPatternId": "fragile_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+but\\s+it's\\s+(?P<alteration_mix>Fragile)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> but its Fragile\"",
        "legacyPatternId": "fragile_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+but\\s+its\\s+(?P<alteration_mix>Fragile)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Fragile\"",
        "legacyPatternId": "fragile_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Fragile)$\""
      }
    ]
  },
  "full-fragile": {
    "name": "Full Fragile",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Full Fragile)\"",
        "legacyPatternId": "fullfragile_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Full Fragile)\\)$\""
      }
    ]
  },
  "freewheel": {
    "name": "FreeWheel",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> FreeWheel\"",
        "legacyPatternId": "freewheel_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>FreeWheel)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> FreeWheel\"",
        "legacyPatternId": "freewheel_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>FreeWheel)$\""
      },
      {
        "label": "Pattern spring2020: \"Spring 2020 - <spring2020><mapnumber> FreeWheel\"",
        "legacyPatternId": "freewheel_spring2020_pattern_1",
        "pattern": "r\"^Spring 2020 - (?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>FreeWheel)$\""
      }
    ]
  },
  "glider": {
    "name": "Glider",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Glider\"",
        "legacyPatternId": "glider_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Glider)$\""
      }
    ]
  },
  "no-brakes": {
    "name": "No Brakes",
    "entries": [
      {
        "label": "Pattern seasonal: \"No Brakes - <season> <year> - <mapnumber>\"",
        "legacyPatternId": "nobrakes_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>No Brakes)\\s*-\\s*(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> NoBrakes\"",
        "legacyPatternId": "nobrakes_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>NoBrakes)$\""
      }
    ]
  },
  "no-effects": {
    "name": "No Effects",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> Effectless - <mapnumber>\"",
        "legacyPatternId": "noeffects_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Effectless)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "no-grip": {
    "name": "No Grip",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> No Grip - <mapnumber>\"",
        "legacyPatternId": "nogrip_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>No Grip)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - No Grip\"",
        "legacyPatternId": "nogrip_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>No Grip)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> No-Grip\"",
        "legacyPatternId": "nogrip_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>No-Grip).*$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> NoGrip - <mapnumber>\"",
        "legacyPatternId": "nogrip_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>NoGrip)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "no-steering": {
    "name": "No Steering",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> No Steering - <mapnumber>\"",
        "legacyPatternId": "nosteering_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>No Steering)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> No Steering\"",
        "legacyPatternId": "nosteering_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>No Steering)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (No-Steer)\"",
        "legacyPatternId": "nosteering_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>No-Steer)\\)$\""
      }
    ]
  },
  "random-dankness": {
    "name": "Random Dankness",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Random Dankness\"",
        "legacyPatternId": "randomdankness_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Random Dankness)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Random Dankness\"",
        "legacyPatternId": "randomdankness_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Random Dankness)$\""
      }
    ]
  },
  "random-effects": {
    "name": "Random Effects",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Random Effects\"",
        "legacyPatternId": "randomeffects_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Random Effects)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Random Effects <additionalinfo>\"",
        "legacyPatternId": "randomeffects_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Random Effects)\\s+(?P<additionalinfo>.+)$\""
      }
    ]
  },
  "reactor": {
    "name": "Reactor",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Reactor\"",
        "legacyPatternId": "reactor_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reactor)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Reactor\"",
        "legacyPatternId": "reactor_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reactor)$\""
      },
      {
        "label": "Pattern training: \"Training Reactor - <mapnumber>\"",
        "legacyPatternId": "reactor_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s+(?P<alteration_mix>Reactor)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "reactor-down": {
    "name": "Reactor Down",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (Reactor Down)\"",
        "legacyPatternId": "reactordown_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Reactor Down)\\)$\""
      },
      {
        "label": "Pattern2: \"<season> <year> - <mapnumber> Reactordown\"",
        "legacyPatternId": "reactordown_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reactordown)$\""
      }
    ]
  },
  "red-effects": {
    "name": "Red Effects",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Red Effects\"",
        "legacyPatternId": "redeffects_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Red Effects)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Red Effects\"",
        "legacyPatternId": "redeffects_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Red Effects)$\""
      }
    ]
  },
  "antibooster-reverse-boost": {
    "name": "Antibooster / Reverse Boost",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> AntiBoosters\"",
        "legacyPatternId": "antibooster_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>AntiBoosters)$\""
      },
      {
        "label": "reverseboost_seasonal_pattern_2",
        "legacyPatternId": "reverseboost_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reverse Boost)$\""
      },
      {
        "label": "reverseboost_seasonal_pattern_3",
        "legacyPatternId": "reverseboost_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reverse Effects)$\""
      }
    ]
  },
  "rng-boosters": {
    "name": "RNG Boosters",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> RNG Booster\"",
        "legacyPatternId": "rngboosters_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>RNG Booster)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020season><mapnumber> RNG Booster\"",
        "legacyPatternId": "rngboosters_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>RNG Booster)$\""
      }
    ]
  },
  "slowmo": {
    "name": "Slowmo",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> slowmo\"",
        "legacyPatternId": "slowmo_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>slowmo)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> <mapnumber> slowmo\"",
        "legacyPatternId": "slowmo_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>slowmo)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> slow mo\"",
        "legacyPatternId": "slowmo_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>slow mo)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (slowmo)\"",
        "legacyPatternId": "slowmo_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>slowmo)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Slowmotion\"",
        "legacyPatternId": "slowmo_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Slowmotion)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Slowmo\"",
        "legacyPatternId": "slowmo_seasonal_pattern_6",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s*(?P<alteration_mix>Slowmo)$\""
      }
    ]
  },
  "wet-wheels": {
    "name": "Wet Wheels",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (Wet-Wheels)\"",
        "legacyPatternId": "wetwheels_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet-Wheels)\\)$\""
      }
    ]
  },
  "worn-tires": {
    "name": "Worn Tires",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (Worn Tires)\"",
        "legacyPatternId": "worntires_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Worn Tires)\\)$\""
      }
    ]
  },
  "1-back-1-forwards": {
    "name": "1 Back / 1 Forwards",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (1-back)\"",
        "legacyPatternId": "oneback_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s*\\((?P<alteration_mix>1-back)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - one back\"",
        "legacyPatternId": "oneback_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>one back)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - 1-back\"",
        "legacyPatternId": "oneback_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>1-back)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (1Back)\"",
        "legacyPatternId": "oneback_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1Back)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1-back\"",
        "legacyPatternId": "oneback_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1-back)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> 1-forward - <mapnumber>\"",
        "legacyPatternId": "oneforward_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>1-forward)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training 1-forward - <mapnumber>\"",
        "legacyPatternId": "oneforward_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*(?P<alteration_mix>1-forward)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> 1-back\"",
        "legacyPatternId": "oneback_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1-back)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> 1-forward\"",
        "legacyPatternId": "oneforward_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>1-forward)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (1-Forward)\"",
        "legacyPatternId": "oneforward_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>1-Forward)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (1-For)\"",
        "legacyPatternId": "oneforward_totd_pattern_2",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>1-For)\\)$\""
      }
    ]
  },
  "1-down": {
    "name": "1 Down",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (1-DOWN)\"",
        "legacyPatternId": "onedown_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (1-DOWN)\"",
        "legacyPatternId": "onedown_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> (1-DOWN)\"",
        "legacyPatternId": "onedown_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (1-DOWN)\"",
        "legacyPatternId": "onedown_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (1-Down)\"",
        "legacyPatternId": "onedown_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> (1-DOWN)\"",
        "legacyPatternId": "onedown_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>1-DOWN)\\)$\""
      }
    ]
  },
  "1-left-1-right": {
    "name": "1 Left / 1 Right",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1 Left\"",
        "legacyPatternId": "oneleft_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1 Left)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1-Left\"",
        "legacyPatternId": "oneleft_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1-Left)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1 Right\"",
        "legacyPatternId": "oneright_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1 Right)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1-Right\"",
        "legacyPatternId": "oneright_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1-Right)$\""
      }
    ]
  },
  "1-up": {
    "name": "1 Up",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (1-UP)\"",
        "legacyPatternId": "oneup_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1-UP)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (1UP)\"",
        "legacyPatternId": "oneup_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1UP)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> 1UP - <mapnumber>\"",
        "legacyPatternId": "oneup_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>1UP)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 1-UP\"",
        "legacyPatternId": "oneup_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>1-UP)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - 1-UP\"",
        "legacyPatternId": "oneup_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>1-UP)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - 1UP\"",
        "legacyPatternId": "oneup_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>1UP)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (1-UP)\"",
        "legacyPatternId": "oneup_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>1-UP)\\)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> (1-UP)\"",
        "legacyPatternId": "oneup_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+\\((?P<alteration_mix>1-UP)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (1-UP)\"",
        "legacyPatternId": "oneup_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>1-UP)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (1-up)\"",
        "legacyPatternId": "oneup_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>1-up)\\)$\""
      }
    ]
  },
  "2-up": {
    "name": "2 Up",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (2-UP)\"",
        "legacyPatternId": "twoup_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>2-UP)\\)$\""
      }
    ]
  },
  "better-reverse": {
    "name": "Better Reverse",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (BeVerse)\"",
        "legacyPatternId": "betterreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>BeVerse)\\)$\""
      },
      {
        "label": "Pattern2: \"<season> <year> - <mapnumber> - Better Reverse\"",
        "legacyPatternId": "betterreverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Better Reverse)$\""
      },
      {
        "label": "Pattern3: \"<season> <year> - <mapnumber> - Reverse Magna\"",
        "legacyPatternId": "betterreverse_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Reverse Magna)$\""
      }
    ]
  },
  "cp1-is-end": {
    "name": "CP1 is End",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP1 Ends\"",
        "legacyPatternId": "cp1isend_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP1 Ends)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP1 is End\"",
        "legacyPatternId": "cp1isend_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP1 is End)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP is End\"",
        "legacyPatternId": "cp1isend_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP is End)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> CP1 is End\"",
        "legacyPatternId": "cp1isend_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP1 is End)$\""
      },
      {
        "label": "Pattern trainin: \"Training - <mapnumber> CP1 End\"",
        "legacyPatternId": "cp1isend_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP1 End)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> CP1 is End\"",
        "legacyPatternId": "cp1isend_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>CP1 is End)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CP1-End)\"",
        "legacyPatternId": "cp1isend_totd_pattern_1",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>CP1-End)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CP1)\"",
        "legacyPatternId": "cp1isend_totd_pattern_2",
        "pattern": "rf\"^(?P<name>{totd_pattern_group})\\s+\\((?P<alteration_mix>CP1)\\)$\""
      }
    ]
  },
  "floor-fin": {
    "name": "Floor Fin",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Floor-fin\"",
        "legacyPatternId": "floorfin_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Floor-fin)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> Floor-Fin\"",
        "legacyPatternId": "floorfin_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Floor-Fin)$\""
      }
    ]
  },
  "ground-clippers": {
    "name": "Ground Clippers",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Ground Clippers)\"",
        "legacyPatternId": "groundclippers_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Ground Clippers)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Ground Clippers <alteration_mixinfo>)\"",
        "legacyPatternId": "groundclippers_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Ground Clippers)\\s+(?P<alteration_mixinfo>.+)\\)$\""
      }
    ]
  },
  "inclined": {
    "name": "Inclined",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Inclined\"",
        "legacyPatternId": "inclined_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Inclined)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Inclined)\"",
        "legacyPatternId": "inclined_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s*\\((?P<alteration_mix>Inclined)\\)$\""
      }
    ]
  },
  "manslaughter": {
    "name": "Manslaughter",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Manslaughter\"",
        "legacyPatternId": "manslaughter_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Manslaughter)$\""
      }
    ]
  },
  "no-gear-5": {
    "name": "No Gear 5",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> No Gear 5\"",
        "legacyPatternId": "nogear5_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>No Gear 5)$\""
      }
    ]
  },
  "podium": {
    "name": "Podium",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Podium\"",
        "legacyPatternId": "podium_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Podium)$\""
      },
      {
        "label": "Pattern competition: \"<competitionname> - Podium\"",
        "legacyPatternId": "podium_competition_pattern_1",
        "pattern": "rf\"^(?P<competitionname>{competition_pattern_group})\\s+-\\s+(?P<alteration_mix>Podium)$\""
      }
    ]
  },
  "puzzle": {
    "name": "Puzzle",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Puzzle)\"",
        "legacyPatternId": "puzzle_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Puzzle)\\)$\""
      },
      {
        "label": "Pattern training: \"Training Puzzle - <mapnumber>\"",
        "legacyPatternId": "puzzle_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+(?P<alteration_mix>Puzzle)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern totd: \"<totwname> (Puzzle)\"",
        "legacyPatternId": "puzzle_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Puzzle)\\)$\""
      }
    ]
  },
  "reverse": {
    "name": "Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Reverse\"",
        "legacyPatternId": "reverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Reverse\"",
        "legacyPatternId": "reverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - Reverse\"",
        "legacyPatternId": "reverse_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> - Reverse\"",
        "legacyPatternId": "reverse_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> Reverse\"",
        "legacyPatternId": "reverse_spring2020_pattern_2",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - Reverse\"",
        "legacyPatternId": "reverse_discovery_pattern_1",
        "pattern": "rf\"^{discovery_pattern_group}\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Reverse)\"",
        "legacyPatternId": "reverse_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Reverse)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> - Reverse\"",
        "legacyPatternId": "reverse_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> - Reverse\"",
        "legacyPatternId": "reverse_weeklyshorts_pattern_1",
        "pattern": "rf\"^{weeklyshorts_pattern_group}\\s+-\\s+(?P<alteration_mix>Reverse)$\""
      }
    ]
  },
  "roofing": {
    "name": "Roofing",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Roofing)\"",
        "legacyPatternId": "roofing_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Roofing)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Roofing\"",
        "legacyPatternId": "roofing_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Roofing)$\""
      }
    ]
  },
  "short": {
    "name": "SHORT",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> | Short\"",
        "legacyPatternId": "short_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s*\\|\\s*(?P<alteration_mix>Short)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Short\"",
        "legacyPatternId": "short_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Short)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> shorts\"",
        "legacyPatternId": "short_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>shorts)$\""
      },
      {
        "label": "short_seasonal_pattern_4",
        "legacyPatternId": "short_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Short)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Short\"",
        "legacyPatternId": "short_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Short)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> Short\"",
        "legacyPatternId": "short_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>Short)$\""
      }
    ]
  },
  "sky-is-the-finish": {
    "name": "Sky is the Finish",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Sky Finish\"",
        "legacyPatternId": "skyfinish_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Sky Finish)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (SITF)\"",
        "legacyPatternId": "skyfinish_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>SITF)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Sky is the Finish\"",
        "legacyPatternId": "skyfinish_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Sky is the Finish)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> - Sky Finish\"",
        "legacyPatternId": "skyfinish_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+-\\s+(?P<alteration_mix>Sky Finish)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (SITF)\"",
        "legacyPatternId": "skyfinish_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>SITF)\\)$\""
      }
    ]
  },
  "there-back-boomerang": {
    "name": "There&Back/Boomerang",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - There&Back <mapnumber>\"",
        "legacyPatternId": "thereandback_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<alteration_mix>There&Back)\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Boomerang\"",
        "legacyPatternId": "thereandback_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Boomerang)$\""
      },
      {
        "label": "Pattern training: \"Training There and Back - <mapnumber>\"",
        "legacyPatternId": "thereandback_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<alteration_mix>There and Back)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "yep-tree-puzzle": {
    "name": "YEP Tree Puzzle",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> YEP TREE PUZZLE\"",
        "legacyPatternId": "yeptreepuzzle_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>YEP TREE PUZZLE)$\""
      }
    ]
  },
  "stadium": {
    "name": "[Stadium]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Stadium]\"",
        "legacyPatternId": "stadium_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Stadium\\])$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CarSport\"",
        "legacyPatternId": "stadium_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CarSport)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - CarSport\"",
        "legacyPatternId": "stadium_discovery_pattern_1",
        "pattern": "rf\"^(?P<dicoveryname>{discovery_pattern_group})\\s*-\\s*(?P<alteration_mix>CarSport)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Stadium]\"",
        "legacyPatternId": "stadium_discovery_pattern_2",
        "pattern": "rf\"^(?P<dicoveryname>{discovery_pattern_group})\\s+\\[Stadium\\]$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CarSport)\"",
        "legacyPatternId": "stadium_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CarSport)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> - CarSport\"",
        "legacyPatternId": "stadium_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+-\\s+(?P<alteration_mix>CarSport)$\""
      }
    ]
  },
  "stadium-to-the-top": {
    "name": "[Stadium] To The Top",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Stadium To The Top\"",
        "legacyPatternId": "stadiumtothetop_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Stadium To The Top)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> Stadium To The Top\"",
        "legacyPatternId": "stadiumtothetop_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Stadium To The Top)$\""
      }
    ]
  },
  "stadium-underwater": {
    "name": "[Stadium] Underwater",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Stadium] (UW)\"",
        "legacyPatternId": "stadiumunderwater_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\[Stadium\\]\\s+\\((?P<alteration_mix>UW)\\)$\""
      }
    ]
  },
  "stadium-wet-plastic": {
    "name": "[Stadium] Wet Plastic",
    "entries": [
      {
        "label": "Pattern seasonal: \"Wet Plastic <season> <year> - <mapnumber> (Stadium)\"",
        "legacyPatternId": "stadiumwetplastic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>Wet Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix_2>Stadium)\\)$\""
      }
    ]
  },
  "stadium-wet-wood": {
    "name": "[Stadium] Wet Wood",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood Stadium Car)\"",
        "legacyPatternId": "stadiumwetwood_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood Stadium Car)\\)$\""
      }
    ]
  },
  "snow": {
    "name": "[Snow]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Snow]\"",
        "legacyPatternId": "snow_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Snow\\])$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CarSnow\"",
        "legacyPatternId": "snow_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CarSnow)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Snowcar\"",
        "legacyPatternId": "snow_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s*(?P<alteration_mix>Snowcar)$\""
      },
      {
        "label": "Pattern training: \"Training <mapnumber> - CarSnow\"",
        "legacyPatternId": "snow_training_pattern_1",
        "pattern": "rf\"^(?P<special_map_name>.*?)\\s*-\\s*(?P<alteration_mix>CarSnow)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Snow]\"",
        "legacyPatternId": "snow_discovery_pattern_1",
        "pattern": "rf\"^{discovery_pattern_group}\\s+\\[Snow\\]$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (SnowCar)\"",
        "legacyPatternId": "snow_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>SnowCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Snow)\"",
        "legacyPatternId": "snow_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Snow)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (SC)\"",
        "legacyPatternId": "snow_totd_pattern_3",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>SC)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"[Snow] <mapname>\"",
        "legacyPatternId": "snow_weeklyshorts_pattern_1",
        "pattern": "rf\"^\\[(?P<alteration_mix>Snow)\\]\\s+(?P<mapname>{weeklyshorts_pattern_group})$\""
      }
    ]
  },
  "snow-carswitch": {
    "name": "[Snow] Carswitch",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Snowcarswitch\"",
        "legacyPatternId": "snowcarswitch_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Snowcarswitch)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-SC)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-SC)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Carswitch SnowCar)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Carswitch SnowCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-SnowCar)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_3",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-SnowCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS_SC)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_4",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS_SC)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Car Switch)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_5",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Car Switch)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Carswitch SN)\"",
        "legacyPatternId": "snowcarswitch_totd_pattern_6",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Carswitch SN)\\)$\""
      }
    ]
  },
  "snow-checkpointless": {
    "name": "[Snow] Checkpointless",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Checkpointless snow\"",
        "legacyPatternId": "snowcheckpointless_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Checkpointless snow)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Checkpointless snow\"",
        "legacyPatternId": "snowcheckpointless_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Checkpointless snow)$\""
      }
    ]
  },
  "snow-ice": {
    "name": "[Snow] Ice",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Icy [Snow])\"",
        "legacyPatternId": "snowice_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Icy \\[Snow\\])\\)$\""
      }
    ]
  },
  "snow-puzzle": {
    "name": "[Snow] Puzzle",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Snow Puzzle\"",
        "legacyPatternId": "snowpuzzle_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Snow Puzzle)$\""
      }
    ]
  },
  "snow-to-the-top": {
    "name": "[Snow] To The Top",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Snow To The Top\"",
        "legacyPatternId": "snowtothetop_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Snow To The Top)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> Snow To The Top\"",
        "legacyPatternId": "snowtothetop_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Snow To The Top)$\""
      }
    ]
  },
  "snow-underwater": {
    "name": "[Snow] Underwater",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Snow] (UW)\"",
        "legacyPatternId": "snowunderwater_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Snow\\]\\s+\\(UW\\))$\""
      },
      {
        "label": "Pattern seasonal: \"<seasonal> <year> - <mapnumber> (SnowCar UW)\"",
        "legacyPatternId": "snowunderwater_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>SnowCar UW)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<seasonal> <year> - <mapnumber> (Snow Car UW)\"",
        "legacyPatternId": "snowunderwater_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Snow Car UW)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> [Snow] (UW)\"",
        "legacyPatternId": "snowunderwater_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Snow\\]\\s+\\(UW\\))$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Snow] (UW)\"",
        "legacyPatternId": "snowunderwater_discovery_pattern_1",
        "pattern": "rf\"^{discovery_pattern_group}\\s+\\[(?P<alteration_mix_1>Snow)\\]\\s+\\((?P<alteration_mix_2>UW)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Snow] UW\"",
        "legacyPatternId": "snowunderwater_discovery_pattern_2",
        "pattern": "rf\"^{discovery_pattern_group}\\s+\\[(?P<alteration_mix_1>Snow)\\]\\s+(?P<alteration_mix_2>UW)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (SnowCar UW)\"",
        "legacyPatternId": "snowunderwater_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>SnowCar UW)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> - Underwater [Snow]\"",
        "legacyPatternId": "snowunderwater_weeklyshorts_pattern_1",
        "pattern": "rf\"^{weeklyshorts_pattern_group}\\s+-\\s+(?P<alteration_mix_1>Underwater) \\[(?P<alteration_mix_2>Snow)\\]$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> - Underwater Snow\"",
        "legacyPatternId": "snowunderwater_weeklyshorts_pattern_2",
        "pattern": "rf\"^{weeklyshorts_pattern_group}\\s+-\\s+(?P<alteration_mix>Underwater Snow)$\""
      }
    ]
  },
  "snow-wet-plastic": {
    "name": "[Snow] Wet Plastic",
    "entries": [
      {
        "label": "Pattern1: \"(Snow) Wet Plastic <season> <year> - <mapnumber>\"",
        "legacyPatternId": "snowwetplastic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>\\(Snow\\) Wet Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "snow-wood": {
    "name": "[Snow] Wood",
    "entries": [
      {
        "label": "Pattern seasonal: \"[Snow] <season> <year> - <mapnumber> Wood\"",
        "legacyPatternId": "snowwood_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>\\[Snow\\])\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Wood)$\""
      },
      {
        "label": "Pattern training: \"[Snow] Training - <mapnumber> Wood\"",
        "legacyPatternId": "snowwood_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>\\[Snow\\])\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Wood)$\""
      },
      {
        "label": "Pattern training: \"[Snow] Training - <mapnumber_21> & <mapnumber_24> Wood\" [Snow] Training - 21 & 24 Wood",
        "legacyPatternId": "snowwood_training_pattern_2124",
        "pattern": "rf\"^(?P<alteration_mix_1>\\[Snow\\])\\s+(?P<season>Training)\\s*-\\s*(?P<mapnumber_21>\\d{{1,2}})\\s*&\\s*(?P<mapnumber_24>\\d{{1,2}})\\s+(?P<alteration_mix_2>Wood)$\""
      }
    ]
  },
  "rally": {
    "name": "[Rally]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Rally]\"",
        "legacyPatternId": "rally_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Rally\\])$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CarRally\"",
        "legacyPatternId": "rally_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CarRally)$\""
      },
      {
        "label": "Pattern training: \"Training <mapnumber> - CarRally\"",
        "legacyPatternId": "rally_training_pattern_1",
        "pattern": "rf\"^(?P<special_map_name>.*?)\\s+-\\s+(?P<alteration_mix>CarRally)$\""
      },
      {
        "label": "Pattern4: \"<totd> (RallyCar)\"",
        "legacyPatternId": "rally_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>RallyCar)\\)$\""
      },
      {
        "label": "Pattern5: \"<totd> (RC)\"",
        "legacyPatternId": "rally_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>RC)\\)$\""
      }
    ]
  },
  "rally-carswitch": {
    "name": "[Rally] Carswitch",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Rallycarswitch\"",
        "legacyPatternId": "rallycarswitch_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Rallycarswitch)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-RC)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-RC)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Carswitch RallyCar)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Carswitch RallyCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-Rally)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_3",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-Rally)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-RallyCar)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_4",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-RallyCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (RallyCar)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_5",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>RallyCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (RallyCar\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_6",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>RallyCar)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Carswitch RC)\"",
        "legacyPatternId": "rallycarswitch_totd_pattern_7",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Carswitch RC)\\)$\""
      }
    ]
  },
  "rally-cp1-is-end": {
    "name": "[Rally] CP1 is End",
    "entries": [
      {
        "label": "Pattern seasonal: \"[Rally] <season> <year> - <mapnumber> Cp1 is End\"",
        "legacyPatternId": "rallycp1isend_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>\\[Rally\\])\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Cp1 is End)$\""
      },
      {
        "label": "Pattern seasonal: \"[Rally] <season> <year> - <mapnumber> - Cp1 is End\"",
        "legacyPatternId": "rallycp1isend_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix_1>\\[Rally\\])\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix_2>Cp1 is End)$\""
      },
      {
        "label": "Pattern spring2020: \"[Rally] <spring2020><mapnumber> - Cp1 is End\"",
        "legacyPatternId": "rallycp1isend_spring2020_pattern_1",
        "pattern": "r\"^(?P<alteration_mix_1>\\[Rally\\])\\s+(?P<spring2020>[STst][0-1]\\d)\\s*-\\s*(?P<alteration_mix_2>Cp1 is End)$\""
      }
    ]
  },
  "rally-ice": {
    "name": "[Rally] Ice",
    "entries": [
      {
        "label": "Pattern seasonal: \"Ricy <season> <year> - <mapnumber>\"",
        "legacyPatternId": "rallyice_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Ricy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "rally-to-the-top": {
    "name": "[Rally] To The Top",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Rally to the Top\"",
        "legacyPatternId": "rallytothetop_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Rally to the Top)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshortsname> Rally To The Top\"",
        "legacyPatternId": "rallytothetop_weeklyshorts_pattern_1",
        "pattern": "rf\"^{weeklyshorts_pattern_group}\\s+(?P<alteration_mix>Rally To The Top)$\""
      }
    ]
  },
  "rally-underwater": {
    "name": "[Rally] Underwater",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Rally] (Underwater)\"",
        "legacyPatternId": "rallyunderwater_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\[Rally\\]\\s+\\((?P<alteration_mix>Underwater)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Rally] (UW)\"",
        "legacyPatternId": "rallyunderwater_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\[Rally\\]\\s+\\((?P<alteration_mix>UW)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> [Rally] (UW)\"",
        "legacyPatternId": "rallyunderwater_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\[Rally\\]\\s+\\((?P<alteration_mix>UW)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Rally] (UW)\"",
        "legacyPatternId": "rallyunderwater_discovery_pattern_1",
        "pattern": "rf\"^{discovery_pattern_group}\\s+\\[Rally\\]\\s+\\((?P<alteration_mix>UW)\\)$\""
      }
    ]
  },
  "desert": {
    "name": "[Desert]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Desert]\"",
        "legacyPatternId": "desert_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Desert\\])$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CarDesert\"",
        "legacyPatternId": "desert_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CarDesert)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - DesertCar\"",
        "legacyPatternId": "desert_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>DesertCar)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (DesertCar)\"",
        "legacyPatternId": "desert_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>DesertCar)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - CarDesert\"",
        "legacyPatternId": "desert_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CarDesert)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> - CarDesert\"",
        "legacyPatternId": "desert_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+-\\s+(?P<alteration_mix>CarDesert)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - CarDesert\"",
        "legacyPatternId": "desert_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+-\\s+(?P<alteration_mix>CarDesert)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (DesertCar)\"",
        "legacyPatternId": "desert_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>DesertCar)\\)$\""
      }
    ]
  },
  "desert-antiboost": {
    "name": "[Desert] Antiboost",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - DAB\"",
        "legacyPatternId": "desertantiboost_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>DAB)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - DAB\"",
        "legacyPatternId": "desertantiboost_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+-\\s+(?P<alteration_mix>DAB)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> - DAB\"",
        "legacyPatternId": "desertantiboost_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+-\\s+(?P<alteration_mix>DAB)$\""
      }
    ]
  },
  "desert-carswitch": {
    "name": "[Desert] Carswitch",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Desertcarswitch\"",
        "legacyPatternId": "desertcarswitch_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Desertcarswitch)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-DC)\"",
        "legacyPatternId": "desertcarswitch_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-DC)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-DesertCar)\"",
        "legacyPatternId": "desertcarswitch_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-DesertCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Carswitch DesertCar)\"",
        "legacyPatternId": "desertcarswitch_totd_pattern_3",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Carswitch DesertCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Cawswitch DesertCar)\"",
        "legacyPatternId": "desertcarswitch_totd_pattern_4",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Cawswitch DesertCar)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (CS-DesertCar)\"",
        "legacyPatternId": "desertcarswitch_totd_pattern_5",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CS-DesertCar)\\)$\""
      }
    ]
  },
  "desert-ice": {
    "name": "[Desert] Ice",
    "entries": [
      {
        "label": "Pattern seasonal: \"Dicy <season> <year> - <mapnumber>\"",
        "legacyPatternId": "desertice_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Dicy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "desert-icy-red-reactor-down": {
    "name": "[Desert] Icy Red Reactor Down",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> IDRRD\" Fall 2024 - 12 IDRRD",
        "legacyPatternId": "deserticyredreactordown_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>IDRRD)$\""
      }
    ]
  },
  "desert-to-the-top": {
    "name": "[Desert] To The Top",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Desert to the Top\"",
        "legacyPatternId": "deserttothetop_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Desert to the Top)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> Desert to the Top\"",
        "legacyPatternId": "deserttothetop_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>Desert to the Top)$\""
      }
    ]
  },
  "desert-underwater": {
    "name": "[Desert] Underwater",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Desert] (UW)\"",
        "legacyPatternId": "desertunderwater_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Desert\\]\\s+\\(UW\\))$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Desert) (UW)\"",
        "legacyPatternId": "desertunderwater_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Desert)\\)\\s+\\(UW\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> [Desert] (UW)\"",
        "legacyPatternId": "desertunderwater_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\[Desert\\]\\s+\\(UW\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Desert] UW\"",
        "legacyPatternId": "desertunderwater_discovery_pattern_1",
        "pattern": "rf\"^{discovery_pattern_group}\\s+\\[Desert\\]\\s+UW$\""
      },
      {
        "label": "Pattern weekly shorts: \"<weeklyshorts_pattern_group> [Desert] UW\"",
        "legacyPatternId": "desertunderwater_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<name>{weeklyshorts_pattern_group})\\s+\\[Desert\\]\\s+UW$\""
      }
    ]
  },
  "desert-reverse": {
    "name": "[Desert] Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Reverse Desert\"",
        "legacyPatternId": "desertreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Reverse Desert)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Desert Reverse\"",
        "legacyPatternId": "desertreverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Desert Reverse)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Desert Reverse\"",
        "legacyPatternId": "desertreverse_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Desert Reverse)$\""
      }
    ]
  },
  "all-cars": {
    "name": "All Cars",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> all cars\"",
        "legacyPatternId": "allcars_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>all cars)$\""
      }
    ]
  },
  "all-carswitch": {
    "name": "All Carswitch",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> 4CS\"",
        "legacyPatternId": "allcarswitch_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>4CS)$\""
      }
    ]
  },
  "race": {
    "name": "[Race]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Race]\"",
        "legacyPatternId": "race_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Race\\])$\""
      },
      {
        "label": "Pattern discovery: \"<discovery> [Race]\"",
        "legacyPatternId": "race_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\[(?P<alteration_mix>Race)\\]$\""
      },
      {
        "label": "Pattern discovery: \"<discovery> (Race)\"",
        "legacyPatternId": "race_discovery_pattern_2",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>Race)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discovery>_Race\"",
        "legacyPatternId": "race_discovery_pattern_3",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})_(?P<alteration_mix>Race)$\""
      }
    ]
  },
  "stunt": {
    "name": "[Stunt]",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> [Stunt]\"",
        "legacyPatternId": "stunt_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Stunt\\])$\""
      }
    ]
  },
  "platform": {
    "name": "[Platform]",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> [Platform]\"",
        "legacyPatternId": "platform_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>\\[Platform\\])$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Platform\"",
        "legacyPatternId": "platform_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Platform)$\""
      }
    ]
  },
  "checkpointless-reverse": {
    "name": "Checkpointless Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Checkpointless Reverse)\"",
        "legacyPatternId": "checkpointlessreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Checkpointless Reverse)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CPLess, Reverse\"",
        "legacyPatternId": "checkpointlessreverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CPLess, Reverse)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CPLess, Reverse (G)\"",
        "legacyPatternId": "checkpointlessreverse_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CPLess, Reverse \\(G\\))$\""
      },
      {
        "label": "Pattern seasonal: \"(G) <season> <year> - <mapnumber> - CPLess, Reverse\"",
        "legacyPatternId": "checkpointlessreverse_seasonal_pattern_4",
        "pattern": "rf\"^(?P<alteration_mix_1>\\(G\\))\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix_2>CPLess, Reverse)$\""
      },
      {
        "label": "Pattern seasonal: \"<spring2020><mapnumber> (Checkpointless Reverse)\"",
        "legacyPatternId": "checkpointlessreverse_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+\\((?P<alteration_mix>Checkpointless Reverse)\\)$\""
      }
    ]
  },
  "deet-to-the-top": {
    "name": "DEET To The Top",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (DEET to the Top)\"",
        "legacyPatternId": "deettothetop_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>DEET to the Top)\\)$\""
      }
    ]
  },
  "ice-reverse": {
    "name": "Ice Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> IR\"",
        "legacyPatternId": "icereverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>IR)$\""
      },
      {
        "label": "Pattern seasonal: \"Icy <season> <year> - <mapnumber> Reverse\"",
        "legacyPatternId": "icereverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix_1>Icy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Reverse)$\""
      }
    ]
  },
  "ice-reverse-reactor": {
    "name": "Ice Reverse Reactor",
    "entries": [
      {
        "label": "Pattern seasonal: \"Icy RR <season> <year> <mapnumber>\"",
        "legacyPatternId": "icereversereactor_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy RR)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "ice-short": {
    "name": "Ice Short",
    "entries": [
      {
        "label": "Pattern seasonal: \"short - Icy <season> <year> - <mapnumber>\" short - Icy Winter 2023 - 17",
        "legacyPatternId": "iceshort_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>short)\\s+-\\s+(?P<alteration_mix_2>Icy)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "magnet-reverse": {
    "name": "Magnet Reverse",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> Magnet Reverse\"",
        "legacyPatternId": "magnetreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Magnet Reverse)$\""
      }
    ]
  },
  "plastic-reverse": {
    "name": "Plastic Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> PR\"",
        "legacyPatternId": "plasticreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>PR)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> PlasticReverse\"",
        "legacyPatternId": "plasticreverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>PlasticReverse)$\""
      }
    ]
  },
  "reverse-sky-is-the-finish": {
    "name": "Reverse Sky is the Finish",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> - Rev Sky is Finish\"",
        "legacyPatternId": "reverseskyfinish_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Rev Sky is Finish)$\""
      },
      {
        "label": "Pattern2: \"<season> <year> - <mapnumber> - Rev Sky Finish\"",
        "legacyPatternId": "reverseskyfinish_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Rev Sky Finish)$\""
      },
      {
        "label": "Pattern3: \"<season> <year> - <mapnumber> - Rev Sky Fin\"",
        "legacyPatternId": "reverseskyfinish_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Rev Sky Fin)$\""
      }
    ]
  },
  "start-water-2-up-1-left-checkpoints-unlinked-finish-2-down-1-right": {
    "name": "Start Water 2 UP 1 Left - Checkpoints Unlinked - Finish 2 Down 1 Right",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> sw2u1l-cpu-f2d1r\"",
        "legacyPatternId": "sw2u1lcpuf2d1r_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>sw2u1l-cpu-f2d1r)$\""
      }
    ]
  },
  "underwater-reverse": {
    "name": "Underwater Reverse",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (UW Reverse)\"",
        "legacyPatternId": "underwaterreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>UW Reverse)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> UW Reverse\"",
        "legacyPatternId": "underwaterreverse_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>UW Reverse)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (UW) (Reverse)\"",
        "legacyPatternId": "underwaterreverse_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix_1>UW)\\)\\s+\\((?P<alteration_mix_2>Reverse)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (UW Reverse)\"",
        "legacyPatternId": "underwaterreverse_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>UW Reverse)\\)$\""
      }
    ]
  },
  "wet-plastic": {
    "name": "Wet Plastic",
    "entries": [
      {
        "label": "Pattern seasonal: \"Wet Plastic <season> <year> - <mapnumber>\"",
        "legacyPatternId": "wetplastic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Wet Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s*$\""
      },
      {
        "label": "Pattern training: \"Wet Plastic Training - <mapnumber>\"",
        "legacyPatternId": "wetplastic_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Wet Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training 21&24: \"Wet Plastic Training - <mapnumber_1> & <mapnumber_2>\"",
        "legacyPatternId": "wetplastic_training_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Wet Plastic)\\s+(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber_21>\\d{{1,2}})\\s+&\\s+(?P<mapnumber_24>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Wet Plastic)\"",
        "legacyPatternId": "wetplastic_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Wet Plastic)\\)$\""
      }
    ]
  },
  "wet-wood": {
    "name": "Wet Wood",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood)\"",
        "legacyPatternId": "wetwood_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (Wet Wood)\"",
        "legacyPatternId": "wetwood_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      },
      {
        "label": "Pattern training 21&24: \"Training - <mapnumber_1> & <mapnumber_2> (Wet Wood)\"",
        "legacyPatternId": "wetwood_training_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber_21>\\d{{1,2}})\\s+&\\s+(?P<mapnumber_24>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> (Wet Wood)\"",
        "legacyPatternId": "wetwood_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Wet Wood)\"",
        "legacyPatternId": "wetwood_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Wet Wood)\"",
        "legacyPatternId": "wetwood_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Wet Wood)\\)$\""
      }
    ]
  },
  "": {
    "name": "-",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood Yellow Reactor Down)\"",
        "legacyPatternId": "wetwoodyrd_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood Yellow Reactor Down)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood Red Reactor Down)\"",
        "legacyPatternId": "wetwoodrrd_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Wood Red Reactor Down)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood Better Yellow Reactor Down)\"",
        "legacyPatternId": "wetwoodyrd_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix_1>Wet Wood) Better (?P<alteration_mix_2>Yellow Reactor Down)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Wood Better Red Reactor Down)\"",
        "legacyPatternId": "wetwoodrrd_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix_1>Wet Wood) Better (?P<alteration_mix_2>Red Reactor Down)\\)$\""
      }
    ]
  },
  "wet-icy-wood": {
    "name": "Wet Icy Wood",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (WetIcyWood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>WetIcyWood)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (100% Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>100% Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Pure Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Pure Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Pure WetIcyWood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Pure WetIcyWood)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (100% WetIcyWood)\"",
        "legacyPatternId": "weticywood_seasonal_pattern_6",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>100% WetIcyWood)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (100% Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_training_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>100% Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (Pure Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_training_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Pure Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern training 21,22,23,24: \"Training - <mapnumber_21>,<mapnumber_22>,<mapnumber_23> & <mapnumber_24> (100% Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_training_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber_21>\\d{{1,2}}),\\s*(?P<mapnumber_22>\\d{{1,2}}),\\s*(?P<mapnumber_23>\\d{{1,2}})\\s*&\\s*(?P<mapnumber_24>\\d{{1,2}})\\s+\\((?P<alteration_mix>100% Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern training 21,22,23,24: \"Training - <mapnumber_21>,<mapnumber_22>,<mapnumber_23> & <mapnumber_24> (Pure Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_training_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber_21>\\d{{1,2}}),\\s*(?P<mapnumber_22>\\d{{1,2}}),\\s*(?P<mapnumber_23>\\d{{1,2}})\\s*&\\s*(?P<mapnumber_24>\\d{{1,2}})\\s+\\((?P<alteration_mix>Pure Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (100% Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_discovery_pattern_2",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>100% Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (Pure Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_discovery_pattern_3",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>Pure Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (100% WIW)\"",
        "legacyPatternId": "weticywood_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>100% WIW)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Wet Icy Wood)\"",
        "legacyPatternId": "weticywood_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Wet Icy Wood)\\)$\""
      }
    ]
  },
  "wet-icy-plastic": {
    "name": "Wet Icy Plastic",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      },
      {
        "label": "Pattern training 21&24: \"Training - <mapnumber_21> & <mapnumber_24> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_training_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber_21>\\d{{1,2}})\\s+&\\s+(?P<mapnumber_24>\\d{{1,2}})\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Wet Icy Plastic)\"",
        "legacyPatternId": "weticyplastic_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Wet Icy Plastic)\\)$\""
      }
    ]
  },
  "yeet-max-up": {
    "name": "YEET Max-Up",
    "entries": [
      {
        "label": "Pattern seasonal: \"YEET <season> <year> - <mapnumber> Max-up\"",
        "legacyPatternId": "yeetmaxup_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>YEET)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{2,4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Max-up)$\""
      }
    ]
  },
  "yeet-random-puzzle": {
    "name": "YEET (Random) Puzzle",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (YEET Puzzle)\"",
        "legacyPatternId": "yeetpuzzle_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Yeet Puzzle)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (YEET Random Puzzle)\"",
        "legacyPatternId": "yeetrandompuzzle_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Yeet Random Puzzle)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> YEET Puzzle\"",
        "legacyPatternId": "yeetpuzzle_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>YEET Puzzle)$\""
      }
    ]
  },
  "yeet-reverse": {
    "name": "YEET Reverse",
    "entries": [
      {
        "label": "Pattern1: \"YEET <season> <year> - <mapnumber> Reverse\"",
        "legacyPatternId": "yeetreverse_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix_1>YEET)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{2,4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix_2>Reverse)$\""
      }
    ]
  },
  "flat-2d": {
    "name": "Flat/2D",
    "entries": [
      {
        "label": "Pattern seasonal: \"FLAT <season> <year> - <mapnumber>\"",
        "legacyPatternId": "flat_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>FLAT)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{2,4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"Flat<season>'<year> - <mapnumber>\"",
        "legacyPatternId": "flat_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Flat)(?P<season>{SEASON_REGEX})['’](?P<year>\\d{{2}})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"2D-<season><year>-<mapnumber>\"",
        "legacyPatternId": "flat_seasonal_pattern_3",
        "pattern": "rf\"^(?P<alteration_mix>2D)-(?P<season>{SEASON_REGEX})(?P<year>\\d{{4}})-(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Flat Training - <mapnumber>\"",
        "legacyPatternId": "flat_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Flat)\\s(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Flat\"",
        "legacyPatternId": "flat_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Flat)$\""
      }
    ]
  },
  "a08": {
    "name": "A08",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> - 08\"",
        "legacyPatternId": "a08_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>08)$\""
      }
    ]
  },
  "backwards": {
    "name": "Backwards",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> backwards\"",
        "legacyPatternId": "backwards_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>backwards)$\""
      }
    ]
  },
  "boss": {
    "name": "BOSS",
    "entries": [
      {
        "label": "Pattern seasonal: \"<mapnumber_color> BOSS - <season>'<year>\"",
        "legacyPatternId": "boss_seasonal_pattern_1",
        "pattern": "rf\"^(?P<mapnumber_color>{MAPNUMBER_COLOR_REGEX})\\s+(?P<alteration_mix>BOSS)\\s+-\\s+(?P<season>{SEASON_REGEX})['’](?P<year>\\d{{2}})$\""
      },
      {
        "label": "Pattern seasonal: \"BOSS <mapnumber_color> of <season> <year>\"",
        "legacyPatternId": "boss_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>BOSS)\\s+(?P<mapnumber_color>{MAPNUMBER_COLOR_REGEX})\\s+of\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})$\""
      },
      {
        "label": "Pattern seasonal: \"<mapnumber_color> BOSS <season> <year>\"",
        "legacyPatternId": "boss_seasonal_pattern_3",
        "pattern": "rf\"^(?P<mapnumber_color>{MAPNUMBER_COLOR_REGEX})\\s+(?P<alteration_mix>BOSS)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})$\""
      }
    ]
  },
  "bumper": {
    "name": "Bumper",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Bumper\"",
        "legacyPatternId": "bumper_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Bumper)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Bumper\"",
        "legacyPatternId": "bumper_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{2}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Bumper)$\""
      },
      {
        "label": "Pattern seasonal: \"Training - <mapnumber> Bumper\"",
        "legacyPatternId": "bumper_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Bumper)$\""
      }
    ]
  },
  "blind": {
    "name": "Blind",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <mapnumber> (Blind)\"",
        "legacyPatternId": "blind_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Blind)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> But Blind\"",
        "legacyPatternId": "blind_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>But Blind)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Blindfolded\"",
        "legacyPatternId": "blind_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Blindfolded)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Blind\"",
        "legacyPatternId": "blind_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Blind)$\""
      },
      {
        "label": "Pattern training: \"Blind Training - <mapnumber>\"",
        "legacyPatternId": "blind_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Blind)\\s+(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "egocentrism": {
    "name": "Egocentrism",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> Egocentrism\"",
        "legacyPatternId": "egocentrism_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Egocentrism)$\""
      }
    ]
  },
  "replay": {
    "name": "Replay",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - Replay <mapnumber>\"",
        "legacyPatternId": "replay_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s+(?P<alteration_mix>Replay)\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "n-golo": {
    "name": "N'golo",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season>N'golo <year> - <mapnumber>\"",
        "legacyPatternId": "ngolo_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})N'golo\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season>olo <year> - <mapnumber>\"",
        "legacyPatternId": "ngolo_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>Spring)olo\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "checkpoin-t": {
    "name": "Checkpoin't",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> Checkpoin't - <mapnumber>\"",
        "legacyPatternId": "checkpoin_t_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Checkpoin't)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - Checkpoin't - <mapnumber>\"",
        "legacyPatternId": "checkpoin_t_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s+(?P<alteration_mix>Checkpoin't)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - Checkpoin't <mapnumber>\"",
        "legacyPatternId": "checkpoin_t_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s+(?P<alteration_mix>Checkpoin't)\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "colour-combined": {
    "name": "Colour Combined",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <each map number in sets from 1-5 shown in sets using colours, white = 1-5, green = 6-10, blue = 11-15, red 16-20 black 21-25> Combined\"",
        "legacyPatternId": "colourcombined_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s+(?P<mapnumber_color>{MAPNUMBER_COLOR_REGEX})\\s+(?P<alteration_mix>Combined)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber_color> Combined\"",
        "legacyPatternId": "colourcombined_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber_color>{MAPNUMBER_COLOR_REGEX})\\s+(?P<alteration_mix>Combined)$\""
      }
    ]
  },
  "checkpoint-boost-swap": {
    "name": "Checkpoint Boost Swap",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP-Boost Swap\"",
        "legacyPatternId": "checkpointboostswap_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP-Boost Swap)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (CP-Boost)\"",
        "legacyPatternId": "checkpointboostswap_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>CP-Boost)\\)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> CP-Boost\"",
        "legacyPatternId": "checkpointboostswap_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>CP-Boost)$\""
      }
    ]
  },
  "checkpoint-1-kept": {
    "name": "Checkpoint 1 Kept",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CP1 Kept\"",
        "legacyPatternId": "checkpoint1kept_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CP1 Kept)$\""
      }
    ]
  },
  "checkpointfull": {
    "name": "Checkpointfull",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CPfull\"",
        "legacyPatternId": "checkpointfull_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CPfull)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CPfull (-NN)\"",
        "legacyPatternId": "checkpointfull_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CPfull)\\s+\\((?P<alteration_mixinfo>-?\\d+)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> CPfull\"",
        "legacyPatternId": "checkpointfull_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CPfull)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> CPfull\"",
        "legacyPatternId": "checkpointfull_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>CPfull)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> CPfull (-NN)\"",
        "legacyPatternId": "checkpointfull_weeklyshorts_pattern_2",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+(?P<alteration_mix>CPfull)\\s+\\((?P<alteration_mixinfo>-?\\d+)\\)$\""
      }
    ]
  },
  "checkpointless": {
    "name": "Checkpointless",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Checkpointless\"",
        "legacyPatternId": "checkpointless_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Checkpointless)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Checkpointless\"",
        "legacyPatternId": "checkpointless_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Checkpointless)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - Checkpointless\"",
        "legacyPatternId": "checkpointless_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Checkpointless)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> - CPLess\"",
        "legacyPatternId": "checkpointless_training_pattern_2",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CPLess)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> cpless\"",
        "legacyPatternId": "checkpointless_training_pattern_3",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>cpless)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> - Checkpointless\"",
        "legacyPatternId": "checkpointless_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+-\\s+(?P<alteration_mix>Checkpointless)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> cpless\"",
        "legacyPatternId": "checkpointless_spring2020_pattern_2",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>cpless)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> - Checkpointless\"",
        "legacyPatternId": "checkpointless_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+-\\s+(?P<alteration_mix>Checkpointless)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (cpless)\"",
        "legacyPatternId": "checkpointless_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>cpless)\\)$\""
      },
      {
        "label": "Pattern totd: \"<mapname> (CPLess-STTF)\"",
        "legacyPatternId": "checkpointless_totd_pattern_2",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CPLess-STTF)\\)$\""
      },
      {
        "label": "Pattern totd: \"<mapname> (STTF-CPLess)\"",
        "legacyPatternId": "checkpointless_totd_pattern_3",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>STTF-CPLess)\\)$\""
      },
      {
        "label": "Pattern totd: \"<mapname> (CPLess - STTF)\"",
        "legacyPatternId": "checkpointless_totd_pattern_4",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>CPLess\\s*-\\s*STTF)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (STTF - CPLess)\"",
        "legacyPatternId": "checkpointless_totd_pattern_5",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>STTF\\s*-\\s*CPLess)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> - Checkpointless\"",
        "legacyPatternId": "checkpointless_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+-\\s+(?P<alteration_mix>Checkpointless)$\""
      }
    ]
  },
  "checkpointlink": {
    "name": "Checkpointlink",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CPLink\"",
        "legacyPatternId": "checkpointlink_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CPLink)$\""
      }
    ]
  },
  "checkpoints-rotated-90-got-rotated": {
    "name": "Checkpoints Rotated 90° / Got Rotated",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CPs Rotated 90°\"",
        "legacyPatternId": "checkpointsrotated90_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CPs Rotated 90°)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> CPs Rotated 90°\"",
        "legacyPatternId": "checkpointsrotated90_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>CPs Rotated 90°)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - CPs Rotated 90\"",
        "legacyPatternId": "checkpointsrotated90_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>CPs Rotated 90)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Got Rotated\"",
        "legacyPatternId": "gotrotated_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Got Rotated)$\""
      }
    ]
  },
  "dragonyeet": {
    "name": "DragonYeet",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (DragonYeet)\"",
        "legacyPatternId": "dragonyeet_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>DragonYeet)\\)$\""
      }
    ]
  },
  "earthquake": {
    "name": "Earthquake",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Earthquake\"",
        "legacyPatternId": "earthquake_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Earthquake)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Earthquake\"",
        "legacyPatternId": "earthquake_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Earthquake)$\""
      }
    ]
  },
  "extra-checkpoint": {
    "name": "Extra Checkpoint",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> Extra CP\"",
        "legacyPatternId": "extracheckpoint_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Extra CP)$\""
      }
    ]
  },
  "flipped": {
    "name": "Flipped",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> (Flipped)\"",
        "legacyPatternId": "flipped_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Flipped)\\)$\""
      },
      {
        "label": "Pattern2: \"<season><year>UpsideDown - <mapnumber>\"",
        "legacyPatternId": "flipped_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})(?P<year>\\d{{4}})(?P<alteration_mix>UpsideDown)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Flipped)\"",
        "legacyPatternId": "flipped_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Flipped)\\)$\""
      }
    ]
  },
  "holes": {
    "name": "Holes",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Holes)\"",
        "legacyPatternId": "holes_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Holes)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Holes\"",
        "legacyPatternId": "holes_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Holes)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (Holes)\"",
        "legacyPatternId": "holes_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>Holes)\\)$\""
      }
    ]
  },
  "lowered": {
    "name": "Lowered",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Lowered\"",
        "legacyPatternId": "lowered_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Lowered)$\""
      }
    ]
  },
  "invisible": {
    "name": "Invisible",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Invisible)\"",
        "legacyPatternId": "invisible_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Invisible)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> (Invisible)\"",
        "legacyPatternId": "invisible_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Invisible)\\)$\""
      }
    ]
  },
  "lunatic": {
    "name": "Lunatic",
    "entries": [
      {
        "label": "Pattern1: \"Lunatic <season> <year> - <mapnumber>\"",
        "legacyPatternId": "lunatic_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Lunatic)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern2: \"Harder <season> <year> - <mapnumber>\"",
        "legacyPatternId": "lunatic_seasonal_pattern_2",
        "pattern": "rf\"^(?P<alteration_mix>Harder)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "mini-rpg": {
    "name": "Mini-RPG",
    "entries": [
      {
        "label": "Pattern seasonal: \"RPG <season><year> - <mapnumber>\"",
        "legacyPatternId": "minirpg_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>RPG)\\s+(?P<season>{SEASON_SHORT_REGEX})(?P<year>\\d{{2}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Mini RPG\"",
        "legacyPatternId": "minirpg_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Mini RPG)$\""
      }
    ]
  },
  "mirrored": {
    "name": "Mirrored",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <mapnumber> (Mirror)\"",
        "legacyPatternId": "mirrored_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Mirror)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Mirrored\"",
        "legacyPatternId": "mirrored_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Mirrored)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Mirrored\"",
        "legacyPatternId": "mirrored_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Mirrored)$\""
      }
    ]
  },
  "no-items": {
    "name": "No Items",
    "entries": [
      {
        "label": "Pattern1: \"<season> <year> - <mapnumber> NoItems\"",
        "legacyPatternId": "noitems_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>NoItems)$\""
      }
    ]
  },
  "pool-hunters": {
    "name": "Pool Hunters",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Pool Hunters\"",
        "legacyPatternId": "poolhunters_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Pool Hunters)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> poolhunter - <mapnumber>\"",
        "legacyPatternId": "poolhunters_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>poolhunter)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"Poolhunter <season> <year> - <mapnumber>\"",
        "legacyPatternId": "poolhunters_seasonal_pattern_3",
        "pattern": "rf\"^(?P<alteration_mix>Poolhunter)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> poolhunters - <mapnumber>\"",
        "legacyPatternId": "poolhunters_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{2}})\\s+(?P<alteration_mix>poolhunters)\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "random": {
    "name": "Random",
    "entries": [
      {
        "label": "Pattern1: \"Random <season> <year> - <mapnumber>\"",
        "legacyPatternId": "random_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Random)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "ring-checkpoint": {
    "name": "Ring Checkpoint",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Ring CP\"",
        "legacyPatternId": "ringcheckpoint_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Ring CP)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Ring CP)\"",
        "legacyPatternId": "ringcheckpoint_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Ring CP)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Ring CP%\"",
        "legacyPatternId": "ringcheckpoint_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Ring CP%)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - ring cp\"",
        "legacyPatternId": "ringcheckpoint_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>ring cp)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Ring CP\"",
        "legacyPatternId": "ringcheckpoint_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Ring CP)$\""
      }
    ]
  },
  "sections-joined": {
    "name": "Sections Joined",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - Section [Index] joined\"",
        "legacyPatternId": "sectionsjoined_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<alteration_mix>Section\\s*(?P<mapnumber>\\d{{1,2}})\\s*joined)\\.*$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - Last Section Joined (All Ends)\"",
        "legacyPatternId": "sectionsjoined_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<alteration_mix>Last Section Joined)\\s+\\((?P<alteration_mixinfo>All Ends)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - Last Section Joined\"",
        "legacyPatternId": "sectionsjoined_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<alteration_mix>Last Section Joined)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - Section 1 Joined (All Starts)\"",
        "legacyPatternId": "sectionsjoined_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<alteration_mix>Section 1 Joined)\\s+\\((?P<alteration_mixinfo>All Starts)\\)$\""
      }
    ]
  },
  "select-del": {
    "name": "Select DEL",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Select DEL)\"",
        "legacyPatternId": "selectdel_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Select DEL)\\)$\""
      }
    ]
  },
  "speedlimit": {
    "name": "Speedlimit",
    "entries": [
      {
        "label": "Pattern seaonal: \"<season> <year> - <mapnumber> (Speedlimit)\"",
        "legacyPatternId": "speedlimit_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Speedlimit)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Speed Limit\"",
        "legacyPatternId": "speedlimit_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Speed Limit)\\s*$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Speedlimit\"",
        "legacyPatternId": "speedlimit_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Speedlimit)$\""
      }
    ]
  },
  "start-1-down": {
    "name": "Start 1-Down",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (Start 1-Down)\"",
        "legacyPatternId": "start1down_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>Start 1-Down)\\)$\""
      }
    ]
  },
  "supersized": {
    "name": "Supersized",
    "entries": [
      {
        "label": "Pattern seasonal: \"Supersized <season> <year> - <mapnumber>\"",
        "legacyPatternId": "supersized_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Supersized)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> <mapnumber> Big\"",
        "legacyPatternId": "supersized_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Big)$\""
      },
      {
        "label": "Pattern seasonal: \"Super<mapnumber>\"",
        "legacyPatternId": "supersized_seasonal_pattern_3",
        "pattern": "rf\"^(?P<alteration_mix>Super)(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> Supersized <mapnumber>\"",
        "legacyPatternId": "supersized_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<alteration_mix>Supersized)\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> <mapnumber> Supersized\"",
        "legacyPatternId": "supersized_seasonal_pattern_5",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Supersized)$\""
      },
      {
        "label": "Pattern seasonal: \"Supersized Training - <mapnumber>\"",
        "legacyPatternId": "supersized_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Supersized)\\s+(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "straight-to-the-finish": {
    "name": "Straight to the Finish",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Straight to the Finish\"",
        "legacyPatternId": "straighttothefinish_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Straight to the Finish)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> STTF\"",
        "legacyPatternId": "straighttothefinish_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>STTF)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - sttf\"",
        "legacyPatternId": "straighttothefinish_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>sttf)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (STTF)\"",
        "legacyPatternId": "straighttothefinish_seasonal_pattern_4",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>STTF)\\)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> STTF\"",
        "legacyPatternId": "straighttothefinish_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>STTF)$\""
      },
      {
        "label": "Pattern spring2020: \"<spring2020><mapnumber> STTF\"",
        "legacyPatternId": "straighttothefinish_spring2020_pattern_1",
        "pattern": "r\"^(?P<spring2020>[STst][0-1]\\d)\\s+(?P<alteration_mix>STTF)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> (STTF)\"",
        "legacyPatternId": "straighttothefinish_discovery_pattern_1",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\((?P<alteration_mix>STTF)\\)$\""
      },
      {
        "label": "Pattern discovery: \"<discoveryname> [Race] (STTF)\"",
        "legacyPatternId": "straighttothefinish_discovery_pattern_2",
        "pattern": "rf\"^(?P<discoveryname>{discovery_pattern_group})\\s+\\[Race\\]\\s+\\((?P<alteration_mix>STTF)\\)$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (STTF)\"",
        "legacyPatternId": "straighttothefinish_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>STTF)\\)$\""
      },
      {
        "label": "Pattern weekly shorts: \"<mapname> (STTF)\"",
        "legacyPatternId": "straighttothefinish_weeklyshorts_pattern_1",
        "pattern": "rf\"^(?P<mapname>{weeklyshorts_pattern_group})\\s+\\((?P<alteration_mix>STTF)\\)$\""
      }
    ]
  },
  "stunt-mode": {
    "name": "Stunt Mode",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Stunt\"",
        "legacyPatternId": "stuntmode_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Stunt)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Stunt Mode\"",
        "legacyPatternId": "stuntmode_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Stunt Mode)$\""
      }
    ]
  },
  "symmetrical": {
    "name": "Symmetrical",
    "entries": [
      {
        "label": "Pattern seasonal: \"Symmetrical <season> <year> - <mapnumber>\"",
        "legacyPatternId": "symmetrical_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Symmetrical)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "tilted": {
    "name": "Tilted",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <mapnumber> - Tilted\"",
        "legacyPatternId": "tilted_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Tilted)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Tilted\"",
        "legacyPatternId": "tilted_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Tilted)$\""
      },
      {
        "label": "Pattern training: \"Training - <mapnumber> Tilted\"",
        "legacyPatternId": "tilted_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Tilted)$\""
      }
    ]
  },
  "yeet": {
    "name": "YEET",
    "entries": [
      {
        "label": "Pattern seasonal: \"YEET <season> <year> - <mapnumber>\"",
        "legacyPatternId": "yeet_seasonal_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>YEET)\\s+(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"YEET Training - <mapnumber>\"",
        "legacyPatternId": "yeet_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>YEET)\\s+(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern spring2020: \"YEET <spring2020><mapnumber>\"",
        "legacyPatternId": "yeet_spring2020_pattern_1",
        "pattern": "r\"^(?P<alteration_mix>YEET)\\s+(?P<spring2020>[STst][0-1]\\d).*$\""
      },
      {
        "label": "Pattern discovery: \"YEET <discoveryname>\"",
        "legacyPatternId": "yeet_discovery_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>YEET)\\s+(?P<discoveryname>{discovery_pattern_group})$\""
      },
      {
        "label": "Pattern totd: \"<totdname> (Yeet)\"",
        "legacyPatternId": "yeet_totd_pattern_1",
        "pattern": "rf\"^{totd_pattern_group}\\s+\\((?P<alteration_mix>Yeet)\\)$\""
      }
    ]
  },
  "yeet-down": {
    "name": "YEET Down",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> (DEET)\"",
        "legacyPatternId": "yeetdown_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+\\((?P<alteration_mix>DEET)\\)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> - Deet\"",
        "legacyPatternId": "yeetdown_seasonal_pattern_2",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+-\\s+(?P<alteration_mix>Deet)$\""
      },
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> Deet\"",
        "legacyPatternId": "yeetdown_seasonal_pattern_3",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Deet)$\""
      }
    ]
  },
  "easy-mode": {
    "name": "Easy Mode",
    "entries": [
      {
        "label": "Pattern competition: \"<competitionname> [Easy Mode]\"",
        "legacyPatternId": "easymode_competition_pattern_1",
        "pattern": "rf\"^(?P<competitionname>{competition_pattern_group})\\s+\\[(?P<alteration_mix>Easy Mode)\\]$\""
      }
    ]
  },
  "chinese": {
    "name": "Chinese",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season_chinese> <year> - <mapnumber>\"",
        "legacyPatternId": "chinese_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_CHINESE_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})$\""
      },
      {
        "label": "Pattern training: \"<season_chinese> - <mapnumber>\"",
        "legacyPatternId": "chinese_training_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_CHINESE_REGEX})\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "all-1-up": {
    "name": "All 1-Up",
    "entries": [
      {
        "label": "Pattern seasonal: \"<season> <year> - <mapnumber> All 1-Up\"",
        "legacyPatternId": "all1up_seasonal_pattern_1",
        "pattern": "rf\"^(?P<season>{SEASON_REGEX})\\s+(?P<year>\\d{{4}})\\s*-\\s*(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>All 1-Up)$\""
      }
    ]
  },
  "walmart-mini": {
    "name": "Walmart Mini",
    "entries": [
      {
        "label": "Pattern training: \"Training - <mapnumber> Walmart Mini\"",
        "legacyPatternId": "wallmartmini_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Walmart Mini)$\""
      }
    ]
  },
  "staircase": {
    "name": "Staircase",
    "entries": [
      {
        "label": "Pattern training: \"Training Staircase - <mapnumber>\"",
        "legacyPatternId": "staircase_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+(?P<alteration_mix>Staircase)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "ice-reactor": {
    "name": "Ice Reactor",
    "entries": [
      {
        "label": "Pattern training: \"Icy Reactor Training - <mapnumber>\"",
        "legacyPatternId": "icereactor_training_pattern_1",
        "pattern": "rf\"^(?P<alteration_mix>Icy Reactor)\\s+(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})$\""
      }
    ]
  },
  "better-mixed": {
    "name": "Better Mixed",
    "entries": [
      {
        "label": "Pattern training: \"Training - <mapnumber> Better Mixed\"",
        "legacyPatternId": "bettermixed_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Better Mixed)$\""
      }
    ]
  },
  "no-cut": {
    "name": "No Cut",
    "entries": [
      {
        "label": "Pattern training: \"Training - <mapnumber> No-Cut\"",
        "legacyPatternId": "nocut_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>No-Cut)$\""
      }
    ]
  },
  "road-dirt": {
    "name": "Road Dirt",
    "entries": [
      {
        "label": "Pattern training: \"Training - <mapnumber> Road Dirt\"",
        "legacyPatternId": "roaddirt_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Road Dirt)$\""
      }
    ]
  },
  "scuba-diving": {
    "name": "Scuba Diving",
    "entries": [
      {
        "label": "Pattern training: \"Training - <mapnumber> Scuba Diving\"",
        "legacyPatternId": "scubadiving_training_pattern_1",
        "pattern": "rf\"^(?P<season>Training)\\s+-\\s+(?P<mapnumber>\\d{{1,2}})\\s+(?P<alteration_mix>Scuba Diving)$\""
      }
    ]
  }
});

const ALTERATION_REGEX_BEHAVIOR = Object.freeze({
  "boss": {
    "recommendedProfile": {
      "regexOnly": true,
      "regexOverwriteWeights": false
    },
    "reason": "BOSS campaigns map a color range to five slots, so regex resolution should stay authoritative."
  },
  "sections-joined": {
    "recommendedProfile": {
      "regexOnly": true,
      "regexOverwriteWeights": false
    },
    "reason": "Sections Joined mixes multiple sections together, so similarity should not try to infer a normal single-slot map number."
  }
});

export { LEGACY_ALTERATION_REGEX_CATALOG, ALTERATION_REGEX_BEHAVIOR };