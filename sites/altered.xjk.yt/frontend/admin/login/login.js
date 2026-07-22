const loginState = document.getElementById("loginState");
const loginButton = document.getElementById("loginButton");
const loginChip = document.getElementById("loginChip");
const loginCopy = document.getElementById("loginCopy");
const tokenLoginForm = document.getElementById("tokenLoginForm");
const adminTokenInput = document.getElementById("adminToken");
const tokenLoginButton = document.getElementById("tokenLoginButton");
const alteredUrl = window.__alteredUrl || ((value) => value);

function clearLegacyAdminTokenArtifacts() {
  try {
    window.localStorage.removeItem("altered_admin_token");
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("admin_token")) return;
    url.searchParams.delete("admin_token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

clearLegacyAdminTokenArtifacts();

function setStatus(kind, message) {
  if (!loginState) return;
  loginState.className = `login-status login-status-${kind}`;
  loginState.textContent = message;
}

function setButtonDisabled(disabled) {
  if (!loginButton) return;
  if (disabled) {
    loginButton.setAttribute("aria-disabled", "true");
    loginButton.style.pointerEvents = "none";
    loginButton.style.opacity = "0.65";
    return;
  }
  loginButton.removeAttribute("aria-disabled");
  loginButton.style.pointerEvents = "";
  loginButton.style.opacity = "";
}

async function handleTokenLogin(event) {
  event.preventDefault();
  const adminToken = String(adminTokenInput?.value || "").trim();
  if (!adminToken) {
    setStatus("error", "Admin token is required.");
    return;
  }

  tokenLoginButton.disabled = true;
  setStatus("loading", "Creating a secure admin session...");
  try {
    const response = await fetch(alteredUrl("/api/v1/admin/auth/login"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminToken }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.authenticated) {
      throw new Error(payload?.error || `Token login failed (${response.status}).`);
    }
    adminTokenInput.value = "";
    setStatus("success", "Secure session created. Redirecting to the admin dashboard...");
    window.location.href = alteredUrl("/admin/");
  } catch (error) {
    setStatus("error", error?.message || "Token login failed.");
  } finally {
    tokenLoginButton.disabled = false;
  }
}

async function boot() {
  try {
    const response = await fetch(alteredUrl("/api/v1/admin/auth/status"), {
      credentials: "same-origin",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`Auth status request failed (${response.status}).`);
    }

    if (payload?.authenticated) {
      setStatus("success", "Already authenticated. Redirecting to the admin dashboard...");
      window.location.href = alteredUrl("/admin/");
      return;
    }

    if (payload?.provider === "admin-token") {
      loginChip.textContent = "Admin Token Session";
      loginCopy.textContent = "Enter the configured token once to create an HttpOnly admin session.";
      loginButton.hidden = true;
      tokenLoginForm.hidden = false;
      setStatus("info", "The token stays in this form only and is not saved in browser storage or placed in the URL.");
      adminTokenInput.focus();
      return;
    }

    if (payload?.configError) {
      setStatus("error", payload.configError);
      loginButton.textContent = "Login Unavailable";
      loginButton.removeAttribute("href");
      setButtonDisabled(true);
      return;
    }

    if (payload?.loginUrl) {
      loginButton.href = alteredUrl(payload.loginUrl);
    }

    setButtonDisabled(false);
    setStatus(
      "info",
      "Login uses Ubisoft OAuth and checks the approved admin allowlist before creating an admin session."
    );
  } catch (error) {
    setStatus("warning", "Unable to check login status right now. You can still try the direct Ubisoft login flow.");
    setButtonDisabled(false);
    loginButton.href = alteredUrl("/auth/ubisoft/login?return_to=%2Fadmin%2F");
    console.error(error);
  }
}

tokenLoginForm?.addEventListener("submit", handleTokenLogin);
boot();
