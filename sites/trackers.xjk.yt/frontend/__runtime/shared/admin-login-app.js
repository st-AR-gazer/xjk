import {
  byId,
  clearLegacyAdminTokenArtifacts,
  createTrackerRouteResolver,
  requestJson,
} from "/shared/xjk-core/tracker-runtime.js";

const $ = byId;
const TRACKER_MODE = globalThis.XjkTrackerConfig?.mode === "leaderboard" ? "leaderboard" : "wr";
const routes = createTrackerRouteResolver(TRACKER_MODE);

clearLegacyAdminTokenArtifacts();

const els = {
  status: $("status-note"),
  hint: $("hint-note"),
  form: $("login-form"),
  usernameField: $("login-username-field"),
  username: $("login-username"),
  passwordField: $("login-password-field"),
  password: $("login-password"),
  tokenField: $("login-token-field"),
  token: $("login-token"),
  submit: $("login-submit"),
};

const loginMode = {
  open: false,
  password: false,
  token: false,
};

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.classList.toggle("is-error", tone === "error");
  els.status.classList.toggle("is-ok", tone === "ok");
}

function getNextPath() {
  const fallback = routes.admin();
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("next") || fallback;
    const decoded = decodeURIComponent(raw);
    if (decoded.includes("\\") || decoded.startsWith("//")) return fallback;
    if (decoded === fallback || decoded.startsWith(`${fallback}/`)) return decoded;
    if (decoded === "/admin" || decoded.startsWith("/admin/")) return routes.resolve(decoded);
  } catch {}
  return fallback;
}

function wasLoggedOut() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("logged_out") === "1";
  } catch {
    return false;
  }
}

const api = (path, options) => requestJson(routes.resolve(path), options);

function configureLoginForm(status) {
  const methods = Array.isArray(status?.loginMethods) ? status.loginMethods : [];
  loginMode.open = methods.includes("open");
  loginMode.password = methods.includes("password");
  loginMode.token = methods.includes("token");

  els.usernameField.hidden = !loginMode.password;
  els.passwordField.hidden = !loginMode.password;
  els.tokenField.hidden = !loginMode.token;
  els.username.required = loginMode.password && !loginMode.token;
  els.password.required = loginMode.password && !loginMode.token;
  els.token.required = loginMode.token && !loginMode.password;

  if (loginMode.open) {
    els.hint.textContent = "Open mode is enabled. Credentials are optional in this environment.";
    return;
  }
  if (loginMode.password && loginMode.token) {
    els.hint.textContent = "Use your tracker username and password, or enter an admin token.";
    return;
  }
  if (loginMode.password) {
    els.hint.textContent = "Use TRACKER_ADMIN_USERNAME / TRACKER_ADMIN_PASSWORD credentials.";
    return;
  }
  if (loginMode.token) {
    els.hint.textContent = "Enter the configured admin token. It will be exchanged for a secure session cookie.";
    return;
  }
  els.hint.textContent = "No admin login method is configured.";
}

async function handleLogin(event) {
  event.preventDefault();
  const username = String(els.username.value || "").trim();
  const password = String(els.password.value || "");
  const adminToken = String(els.token.value || "").trim();

  const hasPasswordCredentials = Boolean(username && password);
  if (!loginMode.open && !adminToken && !hasPasswordCredentials) {
    const message =
      loginMode.password && loginMode.token
        ? "Enter a username and password, or an admin token."
        : loginMode.token
          ? "Admin token is required."
          : "Username and password are required.";
    setStatus(message, "error");
    return;
  }
  if (!adminToken && (username || password) && !hasPasswordCredentials) {
    setStatus("Username and password are required.", "error");
    return;
  }

  els.submit.disabled = true;
  setStatus("Signing in...");
  try {
    const result = await api("/api/v1/admin/auth/login", {
      method: "POST",
      body: adminToken ? { adminToken } : { username, password },
    });
    if (result?.ok) {
      els.password.value = "";
      els.token.value = "";
      setStatus("Login successful. Redirecting...", "ok");
      window.location.replace(getNextPath());
      return;
    }
    setStatus("Login failed.", "error");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.submit.disabled = false;
  }
}

async function boot() {
  document.title = TRACKER_MODE === "leaderboard" ? "xjk / leaderboard / admin login" : "xjk / wr / admin login";
  els.form.addEventListener("submit", handleLogin);

  if (wasLoggedOut()) {
    setStatus("You have been logged out.", "ok");
  }

  try {
    const status = await api("/api/v1/admin/auth/status");
    configureLoginForm(status);

    if (status?.authenticated) {
      setStatus("Already authenticated. Redirecting...", "ok");
      window.location.replace(getNextPath());
      return;
    }

    if (!status?.credentialsEnabled && !status?.tokenEnabled && !status?.openMode) {
      els.form.hidden = true;
      setStatus("No admin login method is configured on this service.", "error");
      return;
    }

    if (!wasLoggedOut()) {
      setStatus("Enter your tracker admin credentials.");
    }
  } catch (error) {
    setStatus(error.message || "Failed to load auth status.", "error");
  }
}

boot();
