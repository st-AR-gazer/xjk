import { buildAppPath, fetchJson } from "./http.js";

function adminPath(path = "") {
  return buildAppPath("/api/v1/admin", path);
}

export function fetchAdminSession() {
  return fetchJson(adminPath("/session"));
}

export function fetchAdminAccounts() {
  return fetchJson(adminPath("/accounts"));
}

export function saveAdminAccount(account) {
  return fetchJson(adminPath("/accounts"), {
    method: "POST",
    json: account,
  });
}

export function fetchAdminContentList() {
  return fetchJson(adminPath("/content"));
}

export function fetchAdminPage(slug) {
  return fetchJson(adminPath(`/content/page?slug=${encodeURIComponent(slug)}`));
}

export function saveAdminPage({ slug, markdown, metadata = {}, reason = "" }) {
  return fetchJson(adminPath("/content/page"), {
    method: "PUT",
    json: { slug, markdown, metadata, reason },
  });
}

export function createAdminPage(page) {
  return fetchJson(adminPath("/content/page"), {
    method: "POST",
    json: page,
  });
}

export function fetchAdminAudit() {
  return fetchJson(adminPath("/audit"));
}

export function fetchAdminSuggestions() {
  return fetchJson(adminPath("/suggestions"));
}
