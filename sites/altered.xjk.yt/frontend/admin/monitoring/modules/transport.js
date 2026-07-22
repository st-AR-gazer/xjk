function createMonitoringTransport({
  fetchImpl = globalThis.fetch,
  location = globalThis.window?.location,
  resolveUrl = globalThis.window?.__alteredUrl || ((value) => value),
} = {}) {
  async function api(path, { method = "GET", body } = {}) {
    const r = await fetchImpl(resolveUrl(path), {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let p = null;
    try {
      p = await r.json();
    } catch {}
    if (r.status === 401) {
      location.href = resolveUrl(p?.loginUrl || "/auth/ubisoft/login?return_to=%2Fadmin%2Fmonitoring%2F");
      throw new Error("Unauthorized");
    }
    if (!r.ok) throw new Error(p?.error || `Request failed (${r.status})`);
    return p;
  }

  return { api, resolveUrl };
}

export { createMonitoringTransport };
