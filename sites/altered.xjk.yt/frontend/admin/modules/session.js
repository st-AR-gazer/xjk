import "/shared/xjk-core/safe-html.js?v=2";
import { esc, fmtDateTime } from "./formatters.js?v=2";
import { normalizeLoginUrl } from "./request-client.js?v=2";
import { el, state } from "./state.js?v=2";

export function renderSession() {
  const auth = state.auth;
  if (!auth) {
    globalThis.XjkSafeHtml.set(el.sidebarSession, `<span class="pill tone-muted">Loading</span>`);
    el.statUser.textContent = "-";
    return;
  }
  if (auth.authenticated) {
    const name = auth.user?.displayName || auth.user?.username || auth.provider || "Admin";
    globalThis.XjkSafeHtml.set(
      el.sidebarSession,
      `
      <span class="pill tone-success">Signed in</span>
      <p style="margin-top:.35rem;font-size:.84rem;">${esc(name)}</p>
      ${auth.expiresAt ? `<p style="margin-top:.2rem;font-size:.74rem;color:var(--a-muted)">Expires ${esc(fmtDateTime(auth.expiresAt))}</p>` : ""}
    `
    );
    el.statUser.textContent = name;
    return;
  }

  const url = normalizeLoginUrl(auth.loginUrl || "/admin/login/");
  globalThis.XjkSafeHtml.set(
    el.sidebarSession,
    `
    <span class="pill tone-warn">Signed out</span>
    <p style="margin-top:.35rem;font-size:.84rem;">${esc(auth.configError || "Session not active.")}</p>
    <a class="btn primary small" href="${esc(url)}" style="margin-top:.45rem;">Sign In</a>
  `
  );
  el.statUser.textContent = "Not signed in";
}

export function renderSignedOut() {
  const url = normalizeLoginUrl(state.auth?.loginUrl || "/admin/login/");
  el.healthPill.className = "pill tone-warn";
  el.healthPill.textContent = "Signed out";
  el.healthSummary.textContent = "Login required.";
  el.statRunning.textContent = "-";
  el.statAlerts.textContent = "-";
  el.statUpdated.textContent = "-";
  globalThis.XjkSafeHtml.set(
    el.wsDashboard,
    `
    <div class="empty-state">
      <span class="pill tone-warn">Login required</span>
      <h3>Admin session not active</h3>
      <p>Sign in to access the admin panel.</p>
      <div style="margin-top:1rem;"><a class="btn primary" href="${esc(url)}">Open Login</a></div>
    </div>`
  );
}
