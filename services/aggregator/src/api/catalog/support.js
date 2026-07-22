function withOrigin(origin, path) {
  const safePath = String(path || "").trim();
  const safeOrigin = String(origin || "")
    .trim()
    .replace(/\/+$/, "");
  return safeOrigin ? `${safeOrigin}${safePath}` : safePath;
}

function endpoint({
  method,
  path,
  summary,
  auth = "public",
  query = [],
  pathParams = [],
  notes = [],
  bodyExample = null,
  responseExample = null,
  example = "",
}) {
  return { method, path, summary, auth, query, pathParams, notes, bodyExample, responseExample, example };
}

export { endpoint, withOrigin };
