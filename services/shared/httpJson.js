async function fetchJsonWithTimeout(
  url,
  { method = "GET", body = undefined, headers = {}, timeoutMs = 15000, fetchImpl = fetch } = {}
) {
  const response = await fetchImpl(url, {
    method,
    headers,
    body: body === undefined || typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 15000)),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      (typeof payload?.error === "string" && payload.error) ||
      payload?.error?.message ||
      payload?.message ||
      text.trim() ||
      `${response.status} ${response.statusText}`;
    const error = new Error(message);
    error.statusCode = Number(response.status || 0);
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function readBodyBuffer(request, { maxBytes = 64 * 1024 } = {}) {
  const limit = Math.max(1, Number(maxBytes) || 64 * 1024);
  const declaredLength = Number(request?.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    request?.resume?.();
    const error = new Error(`Request body exceeds the ${limit}-byte limit.`);
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let receivedBytes = 0;
  let exceedsLimit = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > limit) {
      exceedsLimit = true;
      continue;
    }
    chunks.push(buffer);
  }

  if (exceedsLimit) {
    const error = new Error(`Request body exceeds the ${limit}-byte limit.`);
    error.statusCode = 413;
    throw error;
  }

  return Buffer.concat(chunks);
}

async function readTextBody(request, { maxBytes = 64 * 1024, encoding = "utf8" } = {}) {
  const buffer = await readBodyBuffer(request, { maxBytes });
  return buffer.toString(encoding);
}

async function readJsonBody(request, { maxBytes = 64 * 1024 } = {}) {
  const raw = (await readTextBody(request, { maxBytes })).trim();
  return raw ? JSON.parse(raw) : {};
}

export { fetchJsonWithTimeout, readBodyBuffer, readJsonBody, readTextBody };
