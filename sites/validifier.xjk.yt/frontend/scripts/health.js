import { setWorkspaceHealth, setWorkspaceHealthError } from "./workspace.js";
import { apiUrl } from "./routes.js";

export async function loadServiceHealth() {
  try {
    const response = await fetch(apiUrl("/api/v1/health"), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error("health unavailable");
    }

    setWorkspaceHealth({
      status: payload.data?.status || "offline",
      checkedAt: payload.data?.checked_at || null,
    });
  } catch {
    setWorkspaceHealthError();
  }
}
