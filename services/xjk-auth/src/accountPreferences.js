const DEFAULT_ACCOUNT_PREFERENCES = Object.freeze({
  appearance: Object.freeze({ accent: "white", density: "comfortable", motion: "full" }),
});

function normalizeAppearancePreferences(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const accent = ["white", "cyan", "teal", "amber", "purple"].includes(String(source.accent || "").trim())
    ? String(source.accent || "").trim()
    : DEFAULT_ACCOUNT_PREFERENCES.appearance.accent;
  const density = ["comfortable", "compact", "spacious"].includes(String(source.density || "").trim())
    ? String(source.density || "").trim()
    : DEFAULT_ACCOUNT_PREFERENCES.appearance.density;
  const motion = ["full", "reduced", "off"].includes(String(source.motion || "").trim())
    ? String(source.motion || "").trim()
    : DEFAULT_ACCOUNT_PREFERENCES.appearance.motion;
  return { accent, density, motion };
}

function normalizeAccountPreferences(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return { appearance: normalizeAppearancePreferences(source.appearance || source) };
}

function accountIdFromSessionRow(row = null) {
  return String(row?.xjk_account_id || row?.account_id || "").trim() || null;
}

function accountPreferencesWithDefaults(preferences = null, updatedAt = null) {
  const source = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
  const appearance =
    source.appearance && typeof source.appearance === "object" && !Array.isArray(source.appearance)
      ? source.appearance
      : {};
  return {
    ...source,
    appearance: { ...DEFAULT_ACCOUNT_PREFERENCES.appearance, ...appearance },
    updatedAt: updatedAt || null,
  };
}

function createAccountPreferencesService(store) {
  function preferencesForRow(row = null) {
    const accountId = accountIdFromSessionRow(row);
    if (!accountId) return accountPreferencesWithDefaults();
    const saved = store.getAccountPreferences(accountId);
    return accountPreferencesWithDefaults(saved?.preferences, saved?.updatedAt);
  }

  return { preferencesForRow };
}

export {
  accountIdFromSessionRow,
  accountPreferencesWithDefaults,
  createAccountPreferencesService,
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
  normalizeAppearancePreferences,
};
