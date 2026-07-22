import { userHasAdminRole } from "/shared/xjk-core/site-runtime.js";
import { safeNavigationHref } from "/shared/xjk-core/dom-utils.js";
import { cloneDefaults, createAppearanceFeature, normalizePreferences } from "./appearance.js";
import { collectAccountElements, createAccountState } from "./context.js";
import { createProfileFeature } from "./profile.js";
import { createSpacesFeature } from "./spaces.js";

function createAccountApp() {
  const elements = collectAccountElements();
  const state = createAccountState();
  state.preferences = cloneDefaults();

  function prettyDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  }

  function loginUrl() {
    const raw = state.sessionPayload?.loginUrl || "/auth/ubisoft/login";
    const fallback = new URL("/auth/ubisoft/login", window.location.origin);
    try {
      const url = new URL(
        safeNavigationHref(raw, {
          base: window.location.origin,
          fallback: fallback.toString(),
        })
      );
      url.searchParams.set("return_to", window.location.href);
      return url.toString();
    } catch {
      fallback.searchParams.set("return_to", window.location.href);
      return fallback.toString();
    }
  }

  function isAuthenticated() {
    return Boolean(state.sessionPayload?.authenticated && state.sessionPayload?.session?.user);
  }

  function currentUser() {
    return state.sessionPayload?.session?.user || null;
  }

  const spaces = createSpacesFeature({ state, elements });
  const profile = createProfileFeature({
    state,
    elements,
    currentUser,
    isAuthenticated,
    render: () => syncUi(),
  });
  const appearance = createAppearanceFeature({
    state,
    elements,
    isAuthenticated,
    render: () => syncUi(),
  });

  function syncUi() {
    const payload = state.sessionPayload || {};
    const user = currentUser();
    const auth = isAuthenticated();
    const isAdmin = userHasAdminRole(user);
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const displayName = auth ? user?.displayName || "xjk account" : "Not signed in";
    const nickname = auth ? profile.nicknameForUser(user) : "";
    const shownDisplayName = nickname || displayName;
    const username = user?.username ? `@${user.username}` : auth ? "shared account" : "Guest";
    const xjkId = user?.xjkAccountId || "-";
    const ubiId = user?.ubisoftAccountId || user?.accountId || "-";
    const expiresAt =
      payload?.session?.expiresAt || payload?.session?.expires || payload?.expiresAt || payload?.expires || null;
    elements.heroSessionLine.textContent = auth
      ? `${shownDisplayName} is signed in across xjk spaces`
      : "shared identity for xjk spaces";
    elements.panels.overview?.classList.toggle("has-admin-overview", isAdmin);

    elements.overviewMeta.textContent = auth ? "Signed-in xjk identity" : "Guest identity";
    if (elements.appearanceMeta) {
      elements.appearanceMeta.textContent = state.dirty ? "Unsaved appearance changes." : "Applies to all xjk spaces.";
    }
    elements.sessionStateValue.textContent = auth ? "Signed in" : "Signed out";
    elements.overviewSessionState.textContent = auth ? "Signed in" : "Signed out";
    elements.overviewSessionExpires.textContent = auth ? prettyDate(expiresAt) : "-";
    if (elements.overviewAccessLevel) {
      elements.overviewAccessLevel.textContent = auth ? (isAdmin ? "Admin" : "Member") : "Guest";
    }
    if (elements.identityMemberSince) {
      elements.identityMemberSince.textContent = auth ? prettyDate(user?.createdAt) : "-";
    }
    if (elements.identityLastActive) {
      elements.identityLastActive.textContent = auth ? (user?.lastLoginAt ? prettyDate(user.lastLoginAt) : "Now") : "-";
    }
    if (elements.overviewAdminRow) {
      elements.overviewAdminRow.hidden = !isAdmin;
      elements.overviewAdminRow.href = spaces.hrefForSite("admin");
    }
    elements.loginButton.href = loginUrl();
    elements.loginButton.hidden = auth;
    elements.overviewLogoutButton.hidden = !auth;
    elements.overviewLogoutButton.disabled = !auth || state.logoutBusy;
    if (elements.overviewActionNote) elements.overviewActionNote.textContent = state.sessionActionError;

    if (!auth) state.editingNickname = false;
    elements.identityDisplayName.textContent = shownDisplayName;
    elements.identityUsername.textContent = auth ? username : "Guest";
    if (elements.nicknameEditButton) {
      elements.nicknameEditButton.hidden = !auth || state.editingNickname;
    }
    if (elements.nicknameForm) {
      elements.nicknameForm.hidden = !auth || !state.editingNickname;
    }
    if (elements.nicknameInput && auth && state.editingNickname && document.activeElement !== elements.nicknameInput) {
      elements.nicknameInput.value = nickname || displayName;
    }
    if (elements.nicknameResetButton) {
      elements.nicknameResetButton.hidden = !Boolean(nickname);
    }
    elements.identityXjkIdDetail.textContent = xjkId;
    elements.identityUbisoftIdDetail.textContent = ubiId;
    elements.identityRolesDetail.textContent = auth ? (roles.length ? roles.join(", ") : "User") : "Guest";

    elements.appearanceHint.textContent = auth
      ? state.dirty
        ? "You have unsaved appearance changes."
        : "Stored on your shared xjk account."
      : "Editing a local draft. Sign in to store it centrally.";
    if (elements.appearanceStatusPill) elements.appearanceStatusPill.textContent = state.dirty ? "Draft" : "Saved";
    if (elements.appearanceSaveStateValue) {
      elements.appearanceSaveStateValue.textContent = state.dirty ? "Unsaved draft" : "Saved";
    }
    if (elements.appearanceStorageValue) {
      elements.appearanceStorageValue.textContent = auth ? "Shared xjk account" : "This browser";
    }
    if (elements.appearanceUpdatedValue) {
      elements.appearanceUpdatedValue.textContent = state.preferences?.updatedAt
        ? prettyDate(state.preferences.updatedAt)
        : "-";
    }
    elements.saveAppearanceButton.disabled = !auth;
    if (elements.clearPreferencesButton) elements.clearPreferencesButton.disabled = false;
    const sessionSnapshotText = JSON.stringify(
      { ...payload, preferences: normalizePreferences(state.preferences) },
      null,
      2
    );
    elements.sessionPayload.textContent = sessionSnapshotText;

    profile.applyProfileImage();
    appearance.applyAppearance();
    appearance.renderAppearanceControls();
    spaces.renderSpacePills();
    spaces.renderSpacePanel();
  }

  async function refreshSession() {
    const response = await fetch("/api/v1/account/session", { credentials: "same-origin" });
    const payload = await response.json();
    state.sessionPayload = payload;
    state.preferences = normalizePreferences(payload.preferences || cloneDefaults());
    state.dirty = false;
    syncUi();
  }

  async function logoutEverywhere() {
    const response = await fetch("/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`Logout failed with status ${response.status}.`);
    await refreshSession();
  }

  async function runLogoutAction() {
    if (state.logoutBusy) return;
    state.logoutBusy = true;
    state.sessionActionError = "";
    syncUi();
    try {
      await logoutEverywhere();
    } catch {
      state.sessionActionError = "Unable to log out. Please try again.";
    } finally {
      state.logoutBusy = false;
      syncUi();
    }
  }

  function downloadSnapshot() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      host: window.location.host,
      account: state.sessionPayload?.session?.user || null,
      preferences: normalizePreferences(state.preferences),
      payload: state.sessionPayload || null,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xjk-account-snapshot.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindStaticEvents() {
    profile.bindEvents();
    appearance.bindEvents();
    spaces.bindEvents();
    elements.overviewLogoutButton?.addEventListener("click", () => {
      runLogoutAction().catch(() => {
        state.logoutBusy = false;
        state.sessionActionError = "Unable to log out. Please try again.";
        syncUi();
      });
    });
    elements.downloadSnapshotButtonData?.addEventListener("click", downloadSnapshot);
  }

  function boot() {
    profile.loadPersistedProfile();
    bindStaticEvents();
    spaces.applyViewState(
      spaces.parseLocationView() || spaces.readStoredView() || { tab: state.activeTab, space: state.activeSpace },
      { historyMode: "replace" }
    );
    syncUi();
    refreshSession().catch((error) => {
      state.sessionPayload = {
        ok: false,
        authenticated: false,
        error: error?.message || String(error),
      };
      state.preferences = cloneDefaults();
      syncUi();
    });
  }

  return { boot };
}

export { createAccountApp };
