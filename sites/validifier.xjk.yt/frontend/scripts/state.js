import { DEFAULT_MAP_VIEW } from "./constants.js";

export const state = {
  activeController: null,
  livePollTimer: null,
  submissionPollTimer: null,
  lastSubmittedRecordId: "",
  lastSubmissionId: "",
  currentRoute: null,
  liveQueue: {
    active: false,
    loading: false,
    data: null,
    latestActivityKey: "",
  },
  mapView: {
    mapUid: "",
    primaryData: null,
    bundles: [],
    ...DEFAULT_MAP_VIEW,
  },
  uploadState: {
    map: null,
    replay: null,
  },
};
