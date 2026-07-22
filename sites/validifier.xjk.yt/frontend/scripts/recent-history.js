const STORAGE_KEY = "validifier_recent_history_v1";
const MAX_ENTRIES = 16;

function canUseStorage() {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readStorage() {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(entries) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors silently for now.
  }
}

export function listRecentEntries() {
  return readStorage();
}

export function rememberRecentEntry(entry) {
  if (!entry || !entry.href || !entry.label) {
    return listRecentEntries();
  }

  const normalizedEntry = {
    type: String(entry.type || "lookup"),
    label: String(entry.label || "").trim(),
    href: String(entry.href || "").trim(),
    meta: String(entry.meta || "").trim(),
    summary: String(entry.summary || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  const nextEntries = readStorage()
    .filter((item) => item && item.href !== normalizedEntry.href)
    .slice(0, MAX_ENTRIES - 1);

  nextEntries.unshift(normalizedEntry);
  writeStorage(nextEntries);
  return nextEntries;
}

export function clearRecentEntries() {
  writeStorage([]);
  return [];
}
