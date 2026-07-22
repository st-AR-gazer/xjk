function apiErrorMessage(payload, status) {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return `Request failed (${status}).`;
}

async function fetchJson(url, options = {}) {
  const { json, headers = {}, onResponse, ...requestOptions } = options;
  const hasJsonBody = json !== undefined;
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...requestOptions,
    ...(hasJsonBody ? { body: JSON.stringify(json) } : {}),
    headers: {
      accept: "application/json",
      ...(hasJsonBody ? { "content-type": "application/json" } : {}),
      ...headers,
    },
  });
  onResponse?.(response);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(apiErrorMessage(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function unwrapApiData(payload) {
  if (payload?.ok !== true) {
    const error = new Error(apiErrorMessage(payload, 200));
    error.payload = payload;
    throw error;
  }
  return payload?.data;
}

export { apiErrorMessage, fetchJson, unwrapApiData };
