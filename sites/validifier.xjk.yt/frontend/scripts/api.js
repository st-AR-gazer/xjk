import { state } from "./state.js";
import { hideOverlay, setBusyState, showOverlay } from "./ui.js";
import { apiUrl } from "./routes.js";
import { validateLookupValue } from "/shared/xjk-core/input-validation.js?v=2";

export { validateLookupValue };

function buildRequestOptions(options = {}, signal) {
  return {
    method: options.method || "GET",
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal,
  };
}

function createRequestError(response, payload, fallbackMessage) {
  const error = new Error(
    payload?.error?.message ||
      fallbackMessage ||
      (response.status >= 500 ? "Validifier could not complete this request." : "Request failed.")
  );

  error.statusCode = response.status;
  error.code = payload?.error?.code || null;
  return error;
}

export async function requestJson(url, message, options = {}) {
  if (state.activeController) {
    state.activeController.abort();
  }

  const controller = new AbortController();
  state.activeController = controller;

  showOverlay(message);
  setBusyState(true);

  try {
    const response = await fetch(apiUrl(url), buildRequestOptions(options, controller.signal));
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      throw createRequestError(response, payload);
    }

    return payload.data;
  } finally {
    if (state.activeController === controller) {
      hideOverlay();
      setBusyState(false);
      state.activeController = null;
    }
  }
}

export async function requestJsonQuiet(url, options = {}) {
  const response = await fetch(apiUrl(url), buildRequestOptions(options));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw createRequestError(response, payload);
  }

  return payload.data;
}

export async function requestUpload(url, file, message) {
  if (state.activeController) {
    state.activeController.abort();
  }

  const controller = new AbortController();
  state.activeController = controller;

  showOverlay(message);
  setBusyState(true);

  try {
    const response = await fetch(apiUrl(url), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/octet-stream",
      },
      body: file,
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw createRequestError(response, payload, "Upload failed.");
    }

    return payload.data;
  } finally {
    if (state.activeController === controller) {
      hideOverlay();
      setBusyState(false);
      state.activeController = null;
    }
  }
}
