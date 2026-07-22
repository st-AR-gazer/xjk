const PROFILE_IMAGE_STORAGE_KEY = "xjk.account.profileImage";
const NICKNAMES_STORAGE_KEY = "xjk.account.nicknames";
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

function nicknameKeyForUser(user = null) {
  return String(user?.xjkAccountId || user?.ubisoftAccountId || user?.accountId || user?.username || "").trim();
}

function sanitizeNickname(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function createProfileFeature({
  state,
  elements,
  currentUser,
  isAuthenticated,
  render,
  storage = window.localStorage,
}) {
  function readStoredProfileImage() {
    try {
      return storage.getItem(PROFILE_IMAGE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeStoredProfileImage(value) {
    try {
      if (value) storage.setItem(PROFILE_IMAGE_STORAGE_KEY, value);
      else storage.removeItem(PROFILE_IMAGE_STORAGE_KEY);
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  function readStoredNicknames() {
    try {
      const parsed = JSON.parse(storage.getItem(NICKNAMES_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStoredNicknames(value) {
    try {
      storage.setItem(NICKNAMES_STORAGE_KEY, JSON.stringify(value || {}));
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  function applyProfileImage() {
    const image = state.profileImage || "";
    elements.overviewProfileAvatar?.classList.toggle("has-image", Boolean(image));
    if (elements.overviewProfileImage) {
      elements.overviewProfileImage.hidden = !image;
      if (image) elements.overviewProfileImage.src = image;
      else elements.overviewProfileImage.removeAttribute("src");
    }
    // The note is an error-only slot; clear it on a successful (re)render.
    if (elements.overviewAvatarNote) elements.overviewAvatarNote.textContent = "";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read image.")));
      reader.readAsDataURL(file);
    });
  }

  async function handleProfileImageChange() {
    const file = elements.overviewAvatarInput?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      elements.overviewAvatarNote.textContent = "Choose an image file for the profile picture.";
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      elements.overviewAvatarNote.textContent = "Choose an image smaller than 2 MB.";
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    state.profileImage = dataUrl;
    writeStoredProfileImage(dataUrl);
    applyProfileImage();
    elements.overviewAvatarInput.value = "";
  }

  function nicknameForUser(user = null) {
    const key = nicknameKeyForUser(user);
    return key ? sanitizeNickname(state.nicknames[key]) : "";
  }

  function setNicknameForUser(user = null, value = "") {
    const key = nicknameKeyForUser(user);
    if (!key) return;
    const next = { ...state.nicknames };
    const clean = sanitizeNickname(value);
    if (clean) next[key] = clean;
    else delete next[key];
    state.nicknames = next;
    writeStoredNicknames(next);
  }

  function beginNicknameEdit() {
    const user = currentUser();
    if (!isAuthenticated() || !user) return;
    const current = nicknameForUser(user) || user.displayName || user.username || "";
    state.editingNickname = true;
    if (elements.nicknameInput) elements.nicknameInput.value = current;
    render();
    window.requestAnimationFrame(() => {
      elements.nicknameInput?.focus();
      elements.nicknameInput?.select();
    });
  }

  function cancelNicknameEdit() {
    state.editingNickname = false;
    render();
  }

  function saveNickname(event = null) {
    event?.preventDefault();
    const user = currentUser();
    if (!isAuthenticated() || !user) return;
    const fallbackName = sanitizeNickname(user.displayName || user.username || "");
    const nextNickname = sanitizeNickname(elements.nicknameInput?.value || "");
    setNicknameForUser(user, nextNickname && nextNickname !== fallbackName ? nextNickname : "");
    state.editingNickname = false;
    render();
  }

  function resetNickname() {
    const user = currentUser();
    if (!isAuthenticated() || !user) return;
    setNicknameForUser(user, "");
    state.editingNickname = false;
    render();
  }

  function loadPersistedProfile() {
    state.profileImage = readStoredProfileImage();
    state.nicknames = readStoredNicknames();
  }

  function bindEvents() {
    elements.overviewAvatarInput?.addEventListener("change", () => {
      handleProfileImageChange().catch(() => {
        if (elements.overviewAvatarNote) elements.overviewAvatarNote.textContent = "Unable to load that image.";
      });
    });
    elements.nicknameEditButton?.addEventListener("click", beginNicknameEdit);
    elements.nicknameForm?.addEventListener("submit", saveNickname);
    elements.nicknameCancelButton?.addEventListener("click", cancelNicknameEdit);
    elements.nicknameResetButton?.addEventListener("click", resetNickname);
    elements.nicknameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancelNicknameEdit();
    });
  }

  return {
    applyProfileImage,
    bindEvents,
    loadPersistedProfile,
    nicknameForUser,
    sanitizeNickname,
    setNicknameForUser,
  };
}

export { createProfileFeature, nicknameKeyForUser, sanitizeNickname };
