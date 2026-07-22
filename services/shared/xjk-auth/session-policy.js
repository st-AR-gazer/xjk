import { oauthTokenExpiryMs as tokenExpiryMs } from "../tokenUtils.js";
import { oauthConfigured, refreshUbisoftToken } from "./oauth-profile.js";

export const DEFAULT_XJK_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function ensureFreshSharedSession(
  store,
  sessionEntry,
  oauthConfig,
  { refreshWindowMs = 90000, fetchImpl = fetch } = {}
) {
  if (!store || !sessionEntry?.row) return sessionEntry;
  const row = sessionEntry.row;
  if (Number(row.oauth_expires_at || 0) - Date.now() > refreshWindowMs) return sessionEntry;
  const refreshToken = String(row.refresh_token || "").trim();
  if (!refreshToken || !oauthConfigured(oauthConfig)) return sessionEntry;
  const refreshed = await refreshUbisoftToken(oauthConfig, refreshToken, { fetchImpl });
  const updatedRow = store.updateSessionOauth(row.session_token, {
    accessToken: String(refreshed.access_token || "").trim(),
    refreshToken: String(refreshed.refresh_token || refreshToken).trim(),
    tokenType: String(refreshed.token_type || row.token_type || "Bearer").trim(),
    idToken: String(refreshed.id_token || row.id_token || "").trim(),
    scope: String(refreshed.scope || row.scope || oauthConfig.scope || "").trim(),
    expiresAt: tokenExpiryMs(refreshed, Date.now() + 3600 * 1000),
  });
  return updatedRow ? { token: row.session_token, row: updatedRow } : sessionEntry;
}
