const loginState = document.getElementById("loginState");
const loginButton = document.getElementById("loginButton");
const alteredUrl = window.__alteredUrl || ((value) => value);

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

async function boot() {
  try {
    const response = await fetch(alteredUrl("/api/v1/admin/auth/status"));
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
      setStatus("warning", "Admin token mode is enabled on this instance. Open the admin dashboard with your configured token flow.");
      loginButton.textContent = "Open Admin Dashboard";
      loginButton.href = alteredUrl("/admin/");
      setButtonDisabled(false);
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
    setStatus("info", "Login uses Ubisoft OAuth and checks the approved admin allowlist before creating an admin session.");
  } catch (error) {
    setStatus("warning", "Unable to check login status right now. You can still try the direct Ubisoft login flow.");
    setButtonDisabled(false);
    loginButton.href = alteredUrl("/auth/ubisoft/login?return_to=%2Fadmin%2F");
    console.error(error);
  }
}

boot();
