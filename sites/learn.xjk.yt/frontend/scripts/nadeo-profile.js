import { assetPath, readJson, writeJson } from "./utils.js";
import { buildAppPath, fetchJson } from "./http.js";

export const NADEO_PROFILE_CACHE_KEY = "xjk.learn.nadeoProfile";

function profileApiPath(path = "") {
  return buildAppPath("/api/v1/profile", path);
}

function profileAuthPath(path = "") {
  return buildAppPath("/auth/ubisoft", path);
}

function dispatchProfileChange(detail = {}) {
  window.dispatchEvent(new CustomEvent("learn:nadeoprofilechange", { detail }));
}

export function getCachedNadeoProfile() {
  return readJson(NADEO_PROFILE_CACHE_KEY, null);
}

export function cacheNadeoProfile(payload) {
  const safePayload = payload
    ? {
        provider: payload.provider || "nadeo-profile",
        profile: payload.profile || payload.user || null,
        session: payload.session || null,
        cachedAt: new Date().toISOString(),
      }
    : null;
  writeJson(NADEO_PROFILE_CACHE_KEY, safePayload);
  dispatchProfileChange({ profile: safePayload });
  return safePayload;
}

export function clearCachedNadeoProfile() {
  try {
    window.localStorage.removeItem(NADEO_PROFILE_CACHE_KEY);
  } catch {
    // localStorage can be unavailable in hardened/private contexts.
  }
  dispatchProfileChange({ profile: null });
}

export async function fetchNadeoProfileStatus() {
  const status = await fetchJson(profileApiPath("/auth/status"));
  if (status?.authenticated && status?.session?.user) {
    cacheNadeoProfile({
      provider: status.provider,
      profile: status.session.user,
      session: status.session,
    });
  }
  if (status && !status.authenticated) {
    clearCachedNadeoProfile();
  }
  return status;
}

export async function fetchNadeoProfile() {
  const payload = await fetchJson(profileApiPath("/me"));
  if (payload?.profile) cacheNadeoProfile(payload);
  return payload;
}

export async function logoutNadeoProfile() {
  const payload = await fetchJson(profileApiPath("/logout"), {
    method: "POST",
    json: {},
  });
  clearCachedNadeoProfile();
  return payload;
}

export function loginToNadeoProfile() {
  const base = assetPath("/");
  const returnTo = `${base.replace(/\/$/, "") || ""}/#/profile`;
  const url = new URL(profileAuthPath("/login"), window.location.origin);
  url.searchParams.set("return_to", returnTo || "/#/profile");
  window.location.href = url.toString();
}
