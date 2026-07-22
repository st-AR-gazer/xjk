export const SIMILARITY_UI_REFRESH_EVENT = "altered-admin:similarity-ui-refresh";

export function notifySimilarityUiChanged(detail = null) {
  document.dispatchEvent(new CustomEvent(SIMILARITY_UI_REFRESH_EVENT, { detail }));
}
