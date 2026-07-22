import { escapeAttribute, escapeHtml, safeNavigationHref } from "../../../shared/xjk-core/dom-utils.js";
import { applySiteLinks, userHasAdminRole } from "../../../shared/xjk-core/site-runtime.js";

function loginUrlForCurrentPage(rawLoginUrl = "", locationObject = window.location) {
  const fallback = new URL("/auth/ubisoft/login", locationObject.origin);
  try {
    const url = new URL(
      safeNavigationHref(rawLoginUrl, {
        base: locationObject.origin,
        fallback: fallback.toString(),
      })
    );
    url.searchParams.set("return_to", locationObject.href);
    return url.toString();
  } catch {
    fallback.searchParams.set("return_to", locationObject.href);
    return fallback.toString();
  }
}

function renderAccessGate({ elements, payload = {}, locationObject = window.location }) {
  const layout = document.querySelector(".editor-layout");
  if (!layout) return;
  const authenticated = Boolean(payload.authenticated || payload.session);
  const loginUrl = loginUrlForCurrentPage(payload.loginUrl, locationObject);
  const user = payload?.session?.user || payload?.user || null;
  const title = authenticated ? "Admin access required" : "Log in required";
  const message = authenticated
    ? `${user?.displayName || "This account"} is signed in, but does not have xjk admin access.`
    : "Log in with the configured Ubisoft admin account to edit the xjk map layout.";

  layout.className = "access-layout";
  globalThis.XjkSafeHtml.set(
    layout,
    `
    <section class="access-gate" aria-labelledby="accessTitle">
      <p class="eyebrow">xjk admin</p>
      <h1 id="accessTitle">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="button-row">
        <a class="access-button" href="${escapeAttribute(loginUrl)}">Log in with Ubisoft</a>
        <a class="access-button access-button--subtle" href="/" data-xjk-site-link="xjk">Return to hub</a>
      </div>
    </section>
  `
  );
  applySiteLinks(layout);
  elements.undoBtn?.setAttribute("hidden", "hidden");
  elements.copyExportBtn?.setAttribute("hidden", "hidden");
}

async function requireAdminAccess({ elements, setStatus, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl("/api/v1/account/session", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && userHasAdminRole(payload?.session?.user || payload?.user)) return true;
    renderAccessGate({ elements, payload });
    setStatus("Admin access required");
    return false;
  } catch {
    renderAccessGate({ elements });
    setStatus("Auth unavailable");
    return false;
  }
}

export { loginUrlForCurrentPage, renderAccessGate, requireAdminAccess };
