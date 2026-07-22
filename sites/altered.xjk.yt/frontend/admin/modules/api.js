import { notifySimilarityUiChanged } from "./admin-events.js?v=2";
import { FETCH_NETWORK_RETRY_ATTEMPTS, FETCH_NETWORK_RETRY_DELAY_MS, alteredUrl } from "./constants.js?v=2";
import {
  fetchWithAlteredFallback,
  isTransientGatewayStatus,
  normalizeLoginUrl,
  waitForFetchRetry,
} from "./request-client.js?v=2";
import { state } from "./state.js?v=2";
import { findActiveButton, lockButtonWhileBusy, setBusyButtonsState, toast, toastBusy } from "./ui.js?v=2";

export async function api(url) {
  for (let attempt = 0; attempt <= FETCH_NETWORK_RETRY_ATTEMPTS; attempt += 1) {
    const r = await fetchWithAlteredFallback(alteredUrl(url), {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    const p = await safeJson(r);
    if (r.status === 401 || r.status === 403) {
      location.replace(normalizeLoginUrl(p?.loginUrl || state.auth?.loginUrl || "/admin/login/"));
      throw new Error("Unauthorized");
    }
    if (!r.ok) {
      if (isTransientGatewayStatus(r.status) && attempt < FETCH_NETWORK_RETRY_ATTEMPTS) {
        await waitForFetchRetry(FETCH_NETWORK_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw new Error(p?.error || p?.message || `Request failed (${r.status}).`);
    }
    return p;
  }
  throw new Error("Request failed.");
}

export async function post(url, body) {
  const r = await fetchWithAlteredFallback(alteredUrl(url), {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: JSON.stringify(body || {}),
  });
  const p = await safeJson(r);
  if (r.status === 401 || r.status === 403) {
    location.replace(normalizeLoginUrl(p?.loginUrl || state.auth?.loginUrl || "/admin/login/"));
    throw new Error("Unauthorized");
  }
  if (!r.ok) throw new Error(p?.error || p?.message || `Request failed (${r.status}).`);
  return p;
}

async function safeJson(r) {
  try {
    return await r.json();
  } catch {
    return {};
  }
}

export async function guarded(key, task, successMsg = "") {
  if (state.busy.has(key)) return;
  state.busy.add(key);
  const activeButton = findActiveButton();
  const activeLabel = String(activeButton?.textContent || "").trim();
  const busyLabel = activeLabel ? `${activeLabel}…` : `${String(key || "Working").replace(/[-_:]+/g, " ")}…`;
  const lockLabel = activeButton?.hasAttribute("data-similarity-button-label") ? null : "Working...";
  const releaseButton = lockButtonWhileBusy(activeButton, { label: lockLabel });
  const dismissBusyToast = toastBusy(busyLabel, "info");
  setBusyButtonsState(key, true);
  try {
    await task();
    if (successMsg) toast(successMsg, "ok");
  } catch (err) {
    console.error(err);
    toast(err?.message || "Request failed.", "err");
  } finally {
    try {
      dismissBusyToast();
    } catch {}
    try {
      releaseButton();
    } catch {}
    setBusyButtonsState(key, false);
    state.busy.delete(key);
    if (key === "naming-similarity") {
      notifySimilarityUiChanged({ source: "guarded-action" });
    }
  }
}
