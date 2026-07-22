import { buildAppPath, fetchJson } from "./http.js";

function profilePath(path = "") {
  return buildAppPath("/api/v1/profile", path);
}

export function fetchLearnAccountData() {
  return fetchJson(profilePath("/learn-data"));
}

export function saveLearnAccountData(data) {
  return fetchJson(profilePath("/learn-data"), {
    method: "PUT",
    json: { data },
  });
}

export function submitLearnSuggestion({ slug = "", title = "", text = "", context = "" } = {}) {
  return fetchJson(profilePath("/suggestions"), {
    method: "POST",
    json: { slug, title, text, context },
  });
}
