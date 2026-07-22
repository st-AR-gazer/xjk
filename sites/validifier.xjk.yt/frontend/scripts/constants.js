export const TRACKS = ["replay", "deep"];
export const MAP_STATUS_FILTERS = ["all", "pass", "fail", "pending", "unavailable", "not_run"];
export const MAP_SORT_OPTIONS = ["rank_asc", "rank_desc", "updated_desc", "record_asc"];
export const MAP_PAGE_SIZE_OPTIONS = [10, 25, 50];
export const DEFAULT_MAP_VIEW = {
  track: "replay",
  sort: "rank_asc",
  status: "all",
  page: 1,
  pageSize: 25,
};

export const STATUS_LABELS = {
  pass: "Verified",
  fail: "Failed",
  pending: "Pending",
  unavailable: "Unavailable",
  not_run: "Not run",
};
