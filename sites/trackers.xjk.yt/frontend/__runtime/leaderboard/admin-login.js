const $ = (id) => document.getElementById(id);

const els = {
  status: $("status-note"),
  hint: $("hint-note"),
  form: $("login-form"),
  username: $("login-username"),
  password: $("login-password"),
  submit: $("login-submit"),
};

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.classList.toggle("is-error", tone === "error");
  els.status.classList.toggle("is-ok", tone === "ok");
}

function getNextPath() {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("next") || "/admin";
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/admin")) return decoded;
  } catch {}
  return "/admin";
}

function wasLoggedOut() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("logged_out") === "1";
  } catch {
    return false;
  }
}

async function api(path, { method = "GET", body } = {}) {
  const headers = body ? { "content-type": "application/json" } : {};
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

function renderModeHint(status) {
  const methods = Array.isArray(status?.loginMethods) ? status.loginMethods : [];
  if (methods.includes("open")) {
    els.hint.textContent = "Open mode is enabled. Credentials are optional in this environment.";
    return;
  }
  if (methods.includes("password")) {
    els.hint.textContent = "Use TRACKER_ADMIN_USERNAME / TRACKER_ADMIN_PASSWORD credentials.";
    return;
  }
  if (methods.includes("token")) {
    els.hint.textContent = "Password login is disabled. Use admin token authentication.";
    return;
  }
  els.hint.textContent = "No admin login method is configured.";
}

async function handleLogin(event) {
  event.preventDefault();
  const username = String(els.username.value || "").trim();
  const password = String(els.password.value || "");

  if (!username || !password) {
    setStatus("Username and password are required.", "error");
    return;
  }

  els.submit.disabled = true;
  setStatus("Signing in...");
  try {
    const result = await api("/api/v1/admin/auth/login", {
      method: "POST",
      body: { username, password },
    });
    if (result?.ok) {
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
  els.form.addEventListener("submit", handleLogin);

  if (wasLoggedOut()) {
    setStatus("You have been logged out.", "ok");
  }

  try {
    const status = await api("/api/v1/admin/auth/status");
    renderModeHint(status);

    if (status?.authenticated) {
      setStatus("Already authenticated. Redirecting...", "ok");
      window.location.replace(getNextPath());
      return;
    }

    if (!status?.credentialsEnabled && !status?.openMode) {
      els.form.hidden = true;
      setStatus(
        "Password login is not configured on this service. Set TRACKER_ADMIN_USERNAME and TRACKER_ADMIN_PASSWORD.",
        "error"
      );
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
