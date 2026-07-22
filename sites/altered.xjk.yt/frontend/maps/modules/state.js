import { DEFAULT_MAP_SORT } from "./config.js?v=2";

export const state = {
  stats: null,
  options: null,
  maps: [],
  total: 0,
  page: 1,
  filterPanelOpen: false,
  openDropdown: null,
  randomSeed: "",
  explicitQuery: {
    sort: false,
    seed: false,
  },
  tagSearch: {
    alteration: "",
    other: "",
  },
  filters: {
    q: "",
    seasonInclude: [],
    seasonExclude: [],
    yearInclude: [],
    yearExclude: [],
    otherInclude: [],
    otherExclude: [],
    alterationInclude: [],
    alterationExclude: [],
    statusInclude: [],
    statusExclude: [],
    wrInclude: [],
    wrExclude: [],
    mapNumber: "",
    environmentInclude: [],
    environmentExclude: [],
    mapTypeInclude: [],
    mapTypeExclude: [],
    sort: DEFAULT_MAP_SORT,
  },
  displayNameRefresh: {
    timer: null,
    attempts: 0,
    key: "",
  },
  activeModalMapUid: "",
  activeModalDetail: null,
};

export const displayNamesByAccountId = {};
