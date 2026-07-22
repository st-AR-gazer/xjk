function buildAdminLoginLocation(requestPath, query = {}) {
  const pathname = String(requestPath || "/admin").split("?", 1)[0];
  const relativeLoginPath = pathname === "/admin" ? "admin/login" : "login";
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const suffix = search.toString();
  return suffix ? `${relativeLoginPath}?${suffix}` : relativeLoginPath;
}

function buildCanonicalAdminLocation(requestPath) {
  const pathname = String(requestPath || "").split("?", 1)[0];
  if (pathname === "/admin/") return "../admin";
  if (pathname === "/admin/login/") return "../login";
  return "";
}

export { buildAdminLoginLocation, buildCanonicalAdminLocation };
