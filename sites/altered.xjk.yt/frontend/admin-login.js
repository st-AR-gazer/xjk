const loginState = document.getElementById("loginState");
const loginButton = document.getElementById("loginButton");

async function boot() {
  try {
    const response = await fetch("/api/v1/admin/auth/status");
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`Auth status request failed (${response.status}).`);
    }

    if (payload?.authenticated) {
      loginState.textContent = "Already authenticated. Redirecting to admin dashboard...";
      window.location.href = "/admin/";
      return;
    }

    if (payload?.provider === "admin-token") {
      loginState.textContent = "Admin token mode is enabled. Use your configured admin token to access /admin/.";
      loginButton.textContent = "Open Admin Dashboard";
      loginButton.href = "/admin/";
      return;
    }

    if (payload?.configError) {
      loginState.textContent = payload.configError;
      loginButton.textContent = "Login Unavailable";
      loginButton.removeAttribute("href");
      loginButton.setAttribute("aria-disabled", "true");
      loginButton.style.pointerEvents = "none";
      loginButton.style.opacity = "0.65";
      return;
    }

    if (payload?.loginUrl) {
      loginButton.href = payload.loginUrl;
    }

    loginState.textContent = "Login uses Ubisoft OAuth and checks the approved admin allowlist.";
  } catch (error) {
    loginState.textContent = "Unable to check login status right now. You can still try direct login.";
    loginButton.href = "/auth/ubisoft/login?return_to=%2Fadmin%2F";
    console.error(error);
  }
}

boot();
