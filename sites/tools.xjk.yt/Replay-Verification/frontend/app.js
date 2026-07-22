const recordForm = document.getElementById("recordForm");
const mapForm = document.getElementById("mapForm");
const recordInput = document.getElementById("recordInput");
const mapInput = document.getElementById("mapInput");
const errorEl = document.getElementById("error");
const homeLink = document.getElementById("homeLink");
const apiLink = document.getElementById("apiLink");

const { setError } = window.ToolTheme.createToolUiBindings({ errorElement: errorEl });

function getValidifierOrigin() {
  const host = String(window.location.hostname || "").toLowerCase();
  const port = window.location.port ? `:${window.location.port}` : "";

  if (host === "validifier.localhost" || host === "validifier.xjk.yt") {
    return `${window.location.protocol}//${window.location.host}`;
  }

  if (
    host === "tools.localhost" ||
    host === "xjk.localhost" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  ) {
    return `${window.location.protocol}//validifier.localhost${port}`;
  }

  return "https://validifier.xjk.yt";
}

function buildTargetUrl(values) {
  const origin = getValidifierOrigin();
  const params = new URLSearchParams();
  if (values.recordId) params.set("recordId", values.recordId);
  if (values.mapUid) params.set("mapUid", values.mapUid);
  const query = params.toString();
  return query ? `${origin}/?${query}` : `${origin}/`;
}

function navigateToValidifier(values) {
  window.location.href = buildTargetUrl(values);
}

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    setError("");
    navigateToValidifier({ recordId: validateLookupValue(recordInput.value, "Record ID") });
  } catch (error) {
    setError(error?.message || "Could not open Validifier.");
  }
});

mapForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    setError("");
    navigateToValidifier({ mapUid: validateLookupValue(mapInput.value, "Map UID") });
  } catch (error) {
    setError(error?.message || "Could not open Validifier.");
  }
});

homeLink.href = buildTargetUrl({});
apiLink.href = `${getValidifierOrigin()}/api/v1/`;
import { validateLookupValue } from "/shared/xjk-core/input-validation.js?v=2";
