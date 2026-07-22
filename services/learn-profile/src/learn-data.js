export function normalizeSlug(value = "") {
  const slug = String(value || "")
    .trim()
    .replace(/^learn\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!slug || slug.includes("..") || slug.includes("\\") || !/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(slug)) {
    throw new Error("Slug must use letters, numbers, dashes, underscores, and forward slashes only.");
  }
  return slug;
}

export function safeSlugOrEmpty(value = "") {
  try {
    return normalizeSlug(value);
  } catch {
    return "";
  }
}

export function emptyLearnData() {
  return {
    bookmarks: [],
    completed: [],
    recent: [],
    settings: {},
    notes: {},
  };
}

export function uniqueStringArray(value, maxItems = 250) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, maxItems);
}

export function sanitizeSettings(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  const settings = {};
  if (["white", "cyan", "teal", "amber", "purple"].includes(String(raw.accent || ""))) {
    settings.accent = String(raw.accent);
  }
  if (["comfortable", "compact"].includes(String(raw.density || ""))) settings.density = String(raw.density);
  if (["full", "reduced"].includes(String(raw.motion || ""))) settings.motion = String(raw.motion);
  if (typeof raw.graphLabels === "boolean") settings.graphLabels = raw.graphLabels;
  const tendril = Number(raw.tendrilIntensity);
  if (Number.isFinite(tendril)) settings.tendrilIntensity = Math.max(0.2, Math.min(2.4, tendril));
  return settings;
}

export function sanitizeNotes(value = {}) {
  const notes = {};
  const raw = value && typeof value === "object" ? value : {};
  for (const [key, note] of Object.entries(raw)) {
    const slug = safeSlugOrEmpty(key);
    if (!slug) continue;
    const rawText = typeof note === "object" && note ? note.text : note;
    const text = String(rawText || "").slice(0, 20000);
    if (!text.trim()) continue;
    notes[slug] = {
      text,
      updatedAt: String(note?.updatedAt || new Date().toISOString()),
    };
  }
  return notes;
}

export function sanitizeLearnData(raw = {}) {
  const data = emptyLearnData();
  data.bookmarks = uniqueStringArray(raw.bookmarks).map(safeSlugOrEmpty).filter(Boolean);
  data.completed = uniqueStringArray(raw.completed).map(safeSlugOrEmpty).filter(Boolean);
  data.recent = uniqueStringArray(raw.recent, 50).map(safeSlugOrEmpty).filter(Boolean);
  data.settings = sanitizeSettings(raw.settings);
  data.notes = sanitizeNotes(raw.notes);
  return data;
}
