import "../../../shared/xjk-core/safe-html.js?v=2";
import {
  fetchNadeoProfile,
  fetchNadeoProfileStatus,
  getCachedNadeoProfile,
  loginToNadeoProfile,
  logoutNadeoProfile,
} from "./nadeo-profile.js";
import {
  clusterSvgIcon,
  copyText,
  escapeHtml,
  formatCount,
  readJson,
  renderIcon,
  slugToHash,
  writeJson,
} from "./utils.js";

export const PROFILE_KEY = "xjk.learn.profile";

const DEFAULT_PROFILE = {
  preferredCar: "mixed",
  focus: "consistency",
  weeklyTarget: 3,
  goals: "Finish one focused lesson.\nSave two techniques to review.\nConvert one note into a repeatable drill.",
  sessionNotes: "",
};

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...readJson(PROFILE_KEY, {}) };
}

export function saveProfile(profile) {
  const next = { ...DEFAULT_PROFILE, ...profile, updatedAt: new Date().toISOString() };
  writeJson(PROFILE_KEY, next);
  return next;
}

function miniCard(page) {
  return `<a class="learn-library-card" href="${slugToHash(page.slug)}">
    <span class="learn-nav-icon">${clusterSvgIcon(page.cluster)}</span>
    <h2 class="learn-card-title">${escapeHtml(page.title)}</h2>
    <p class="learn-card-text">${escapeHtml(page.summary)}</p>
  </a>`;
}

function displayNameFromNadeo(cached) {
  const profile = cached?.profile || cached?.session?.user || null;
  return profile?.displayName || profile?.username || profile?.accountId || "";
}

function shortId(value = "") {
  const text = String(value || "").trim();
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function renderNadeoIdentity(cached) {
  const profile = cached?.profile || cached?.session?.user || null;
  const name = displayNameFromNadeo(cached);
  return `<section class="learn-panel learn-span-8" id="nadeo-profile-panel">
    <div class="learn-profile-connect">
      <div>
        <p class="learn-eyebrow">Trackmania profile</p>
        <h2 class="learn-card-title" id="nadeo-profile-title">${escapeHtml(name || "Connect Nadeo profile")}</h2>
        <p class="learn-card-text" id="nadeo-profile-status">${profile ? "Using cached Trackmania identity while the Learn profile API checks the session." : "Connect through the Learn-owned Nadeo OAuth flow. Tokens stay server-side."}</p>
      </div>
      <div class="learn-card-actions">
        <button class="learn-button" id="connect-nadeo-profile" type="button">Connect</button>
        <button class="learn-button" id="refresh-nadeo-profile" type="button">Refresh</button>
        <button class="learn-button" id="logout-nadeo-profile" type="button">Disconnect</button>
      </div>
    </div>
    <div class="learn-profile-api-grid" id="nadeo-profile-details">
      ${profile ? renderNadeoFacts(profile, cached.session) : renderNadeoEmpty()}
    </div>
  </section>`;
}

function renderNadeoEmpty() {
  return `<div class="learn-empty">No Trackmania session is active yet.</div>`;
}

function renderNadeoFacts(profile = {}, session = null, status = null) {
  const accountId = profile.accountId || profile.subject || "";
  const sessionExpiry = session?.expiresAt || status?.session?.expiresAt || "";
  const tokenExpiry = session?.oauth?.accessTokenExpiresAt || status?.session?.oauth?.accessTokenExpiresAt || "";
  const configured = status ? (status.configured ? "Configured" : "Unconfigured") : "Checking";
  return `
    <div class="learn-profile-fact">
      <span>Display name</span>
      <strong>${escapeHtml(profile.displayName || profile.username || "Unknown")}</strong>
    </div>
    <div class="learn-profile-fact">
      <span>Account id</span>
      <strong title="${escapeHtml(accountId)}">${escapeHtml(shortId(accountId || "Unknown"))}</strong>
    </div>
    <div class="learn-profile-fact">
      <span>Provider</span>
      <strong>${escapeHtml(profile.provider || "nadeo-profile")}</strong>
    </div>
    <div class="learn-profile-fact">
      <span>API config</span>
      <strong>${escapeHtml(configured)}</strong>
    </div>
    <div class="learn-profile-fact">
      <span>Session expires</span>
      <strong>${escapeHtml(sessionExpiry ? new Date(sessionExpiry).toLocaleString() : "n/a")}</strong>
    </div>
    <div class="learn-profile-fact">
      <span>Access expires</span>
      <strong>${escapeHtml(tokenExpiry ? new Date(tokenExpiry).toLocaleString() : "server-side")}</strong>
    </div>`;
}

function renderNadeoUnavailable(status = null, error = "") {
  const configured = status?.configured ? "configured" : "not configured";
  const message =
    error ||
    (status?.oauthEnabled === false ? "Learn OAuth is disabled on this instance." : `Learn OAuth is ${configured}.`);
  return `<div class="learn-empty">
    <strong>Profile API unavailable</strong>
    <span>${escapeHtml(message)}</span>
    <small>Set LEARN_UBI_OAUTH_* for the Learn profile service to enable live Nadeo identity.</small>
  </div>`;
}

function setNadeoButtons(root, status = {}) {
  const connect = root.querySelector("#connect-nadeo-profile");
  const refresh = root.querySelector("#refresh-nadeo-profile");
  const logout = root.querySelector("#logout-nadeo-profile");
  if (connect) connect.hidden = Boolean(status.authenticated);
  if (logout) logout.hidden = !status.authenticated;
  if (refresh) refresh.disabled = false;
}

async function hydrateNadeoPanel(root, showToast, { force = false } = {}) {
  const statusText = root.querySelector("#nadeo-profile-status");
  const details = root.querySelector("#nadeo-profile-details");
  const title = root.querySelector("#nadeo-profile-title");
  if (statusText) statusText.textContent = force ? "Refreshing Nadeo profile..." : "Checking Nadeo profile session...";
  try {
    const status = await fetchNadeoProfileStatus();
    setNadeoButtons(root, status);
    if (!status.configured) {
      if (statusText) statusText.textContent = "Learn profile OAuth is not configured on this service.";
      if (details) globalThis.XjkSafeHtml.set(details, renderNadeoUnavailable(status));
      return status;
    }
    if (!status.authenticated) {
      if (statusText) statusText.textContent = "Not connected. Use Connect to start the Learn-owned Nadeo OAuth flow.";
      if (title) title.textContent = "Connect Nadeo profile";
      if (details) globalThis.XjkSafeHtml.set(details, renderNadeoEmpty());
      return status;
    }
    const payload = await fetchNadeoProfile();
    const profile = payload.profile || status.session?.user || {};
    if (title) title.textContent = profile.displayName || profile.username || profile.accountId || "Trackmania profile";
    if (statusText) {
      statusText.textContent =
        "Live Trackmania identity is active. Learn settings, saved lessons, and private notes can sync to this account.";
    }
    if (details) {
      globalThis.XjkSafeHtml.set(details, renderNadeoFacts(profile, payload.session || status.session, status));
    }
    if (force) showToast?.("Nadeo profile refreshed");
    return status;
  } catch (error) {
    setNadeoButtons(root, { authenticated: false });
    if (statusText) statusText.textContent = "Could not reach the Learn profile API.";
    if (details) {
      globalThis.XjkSafeHtml.set(
        details,
        renderNadeoUnavailable(null, error?.message || "Profile API request failed.")
      );
    }
    return null;
  }
}

export function renderProfileView({ root, state, store, showToast }) {
  let profile = getProfile();
  const authenticated = Boolean(state.authenticated);
  const cachedNadeo = authenticated ? getCachedNadeoProfile() : null;
  const identityName = authenticated ? displayNameFromNadeo(cachedNadeo) || "Trackmania profile" : "Guest";
  const pages = state.manifest.pages || [];
  const completed = state.completed;
  const bookmarks = state.bookmarks.map((slug) => store.getPage(slug)).filter(Boolean);
  const recent = state.recent.map((slug) => store.getPage(slug)).filter(Boolean);
  const percent = Math.round((completed.length / Math.max(1, pages.length)) * 100);
  const clusterDone = Object.fromEntries(
    (state.manifest.clusters || []).map((cluster) => [
      cluster.id,
      completed.filter((slug) => store.getPage(slug)?.cluster === cluster.id).length,
    ])
  );

  if (!authenticated) {
    globalThis.XjkSafeHtml.set(
      root,
      `<div class="learn-workspace learn-single-workspace">
      <div class="learn-page-scaffold">
        <div class="learn-page-head">
          <div>
            <p class="learn-eyebrow">Profile</p>
            <h1 class="learn-page-title">Guest</h1>
            <p class="learn-page-subtitle">Visual settings are available without login. Saved lessons, private notes, synced settings, improvement suggestions, and editor tools require Ubisoft login.</p>
          </div>
          <div class="learn-card-actions">
            <button class="learn-button" id="connect-nadeo-profile" type="button">Log in</button>
            <a class="learn-button" href="#/settings">Open settings</a>
          </div>
        </div>
        <div class="learn-panel-grid">
          <section class="learn-panel learn-span-4 learn-profile-summary-card">
            <div class="learn-progress-ring" style="--progress:0%"><strong>Guest</strong></div>
            <h2 class="learn-card-title">No progress saved</h2>
            <p class="learn-card-text">Lessons are readable without an account.</p>
          </section>
          ${renderNadeoIdentity(null)}
          <section class="learn-panel learn-span-12">
            <h2 class="learn-card-title">Available as guest</h2>
            <div class="learn-card-grid">
              <div class="learn-card"><strong>Read lessons</strong><p class="learn-card-text">Browse the map, library, tools, and markdown content.</p></div>
              <div class="learn-card"><strong>Change settings</strong><p class="learn-card-text">Accent, density, motion, graph labels, and tendril intensity stay local.</p></div>
              <div class="learn-card"><strong>Log in to sync</strong><p class="learn-card-text">Bookmarks, notes, settings sync, suggestions, and admin/editor access unlock after Ubisoft login.</p></div>
            </div>
          </section>
        </div>
      </div>
    </div>`
    );

    hydrateNadeoPanel(root, showToast);

    const onClick = (event) => {
      if (event.target.id === "connect-nadeo-profile") loginToNadeoProfile();
      if (event.target.id === "refresh-nadeo-profile") {
        event.target.disabled = true;
        hydrateNadeoPanel(root, showToast, { force: true }).finally(() => {
          event.target.disabled = false;
        });
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }

  globalThis.XjkSafeHtml.set(
    root,
    `<div class="learn-workspace learn-single-workspace">
    <div class="learn-page-scaffold">
      <div class="learn-page-head">
        <div>
          <p class="learn-eyebrow">Profile</p>
          <h1 class="learn-page-title">${escapeHtml(identityName)}</h1>
          <p class="learn-page-subtitle">Identity comes from Learn's own Nadeo profile integration; progress, bookmarks, and notes unlock only after login.</p>
        </div>
        <div class="learn-card-actions">
          <button class="learn-button" id="copy-profile" type="button">Copy profile</button>
          <button class="learn-button" id="reset-profile" type="button">Reset notes</button>
          <button class="learn-button" data-action="clear-progress" type="button">Clear progress</button>
        </div>
      </div>
      <div class="learn-panel-grid">
        <section class="learn-panel learn-span-4 learn-profile-summary-card">
          <div class="learn-progress-ring" style="--progress:${percent}%"><strong>${percent}%</strong></div>
          <h2 class="learn-card-title">${escapeHtml(identityName || "xjk learner")}</h2>
          <p class="learn-card-text">${completed.length}/${pages.length} topics complete.</p>
        </section>
        ${renderNadeoIdentity(cachedNadeo)}
        <section class="learn-panel learn-span-12">
          <h2 class="learn-card-title">Learning preferences</h2>
          <form id="profile-form" class="learn-panel-grid learn-profile-form">
            <label class="learn-span-4"><span class="learn-eyebrow">Preferred car</span><select class="learn-select" data-profile-field="preferredCar">
              ${["mixed", "desert-car", "snowcar", "stadium"].map((value) => `<option value="${value}" ${profile.preferredCar === value ? "selected" : ""}>${escapeHtml(value.replaceAll("-", " "))}</option>`).join("")}
            </select></label>
            <label class="learn-span-4"><span class="learn-eyebrow">Focus</span><select class="learn-select" data-profile-field="focus">
              ${["consistency", "speed", "recovery", "routing"].map((value) => `<option value="${value}" ${profile.focus === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
            </select></label>
            <label class="learn-span-4"><span class="learn-eyebrow">Weekly target</span><input class="learn-input" type="number" min="1" max="21" data-profile-field="weeklyTarget" value="${escapeHtml(profile.weeklyTarget)}" /></label>
            <label class="learn-span-6"><span class="learn-eyebrow">Goals</span><textarea class="learn-textarea" rows="6" data-profile-field="goals">${escapeHtml(profile.goals)}</textarea></label>
            <label class="learn-span-6"><span class="learn-eyebrow">Session notes</span><textarea class="learn-textarea" rows="6" data-profile-field="sessionNotes">${escapeHtml(profile.sessionNotes)}</textarea></label>
          </form>
          <p id="profile-save-state" class="learn-card-text">Learning notes saved locally.</p>
        </section>
        <section class="learn-panel learn-span-12">
          <h2 class="learn-card-title">Recent activity</h2>
          <div class="learn-activity-list">
            ${
              recent.length
                ? recent
                    .slice(0, 6)
                    .map(
                      (page) => `<a class="learn-activity-row" href="${slugToHash(page.slug)}">
              <span class="learn-activity-dot"></span>
              <span class="learn-activity-copy"><strong>${escapeHtml(page.title)}</strong><small>${escapeHtml(page.summary)}</small></span>
              <span>${renderIcon("chevron-right")}</span>
            </a>`
                    )
                    .join("")
                : `<div class="learn-empty">Open a lesson to create recent activity.</div>`
            }
          </div>
        </section>
        <section class="learn-panel learn-span-6">
          <h2 class="learn-card-title">Bookmarks</h2>
          <div class="learn-card-grid">
            ${bookmarks.length ? bookmarks.map(miniCard).join("") : `<div class="learn-empty">No bookmarks yet.</div>`}
          </div>
        </section>
        <section class="learn-panel learn-span-6">
          <h2 class="learn-card-title">Completed lessons</h2>
          <div class="learn-card-grid">
            ${
              completed
                .map((slug) => store.getPage(slug))
                .filter(Boolean)
                .map(miniCard)
                .join("") || `<div class="learn-empty">No completed lessons yet.</div>`
            }
          </div>
        </section>
        <section class="learn-panel learn-span-12">
          <h2 class="learn-card-title">Cluster badges</h2>
          <div class="learn-badge-grid learn-badge-grid-compact">
            ${(state.manifest.clusters || [])
              .map(
                (cluster) => `<div class="learn-card">
              <span class="learn-nav-icon">${clusterSvgIcon(cluster.id)}</span>
              <strong>${escapeHtml(cluster.title)}</strong>
              <p class="learn-card-text">${formatCount(clusterDone[cluster.id] || 0, "topic")} complete</p>
            </div>`
              )
              .join("")}
          </div>
        </section>
      </div>
    </div>
  </div>`
  );

  hydrateNadeoPanel(root, showToast);

  const status = () => root.querySelector("#profile-save-state");
  const onInput = (event) => {
    const field = event.target.closest("[data-profile-field]");
    if (!field) return;
    const value = field.type === "number" ? Number(field.value) : field.value;
    profile = saveProfile({ ...profile, [field.dataset.profileField]: value });
    const target = status();
    if (target) target.textContent = "Learning notes saved locally.";
  };
  const onClick = (event) => {
    if (event.target.id === "connect-nadeo-profile") {
      loginToNadeoProfile();
    }
    if (event.target.id === "refresh-nadeo-profile") {
      event.target.disabled = true;
      hydrateNadeoPanel(root, showToast, { force: true }).finally(() => {
        event.target.disabled = false;
      });
    }
    if (event.target.id === "logout-nadeo-profile") {
      logoutNadeoProfile()
        .then(() => {
          showToast?.("Nadeo profile disconnected");
          return hydrateNadeoPanel(root, showToast, { force: true });
        })
        .catch((error) => showToast?.(error?.message || "Disconnect failed"));
    }
    if (event.target.id === "copy-profile") {
      copyText(
        JSON.stringify(
          {
            schema: "xjk.learn.profile-export.v2",
            nadeo: getCachedNadeoProfile(),
            profile,
            progress: { completed, bookmarks: state.bookmarks, recent: state.recent },
          },
          null,
          2
        )
      ).then(() => showToast?.("Profile copied"));
    }
    if (event.target.id === "reset-profile") {
      profile = saveProfile({ ...DEFAULT_PROFILE });
      root.querySelectorAll("[data-profile-field]").forEach((field) => {
        field.value = profile[field.dataset.profileField] ?? "";
      });
      showToast?.("Learning notes reset");
    }
  };
  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);
  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onInput);
    root.removeEventListener("click", onClick);
  };
}
