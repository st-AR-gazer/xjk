function createNotesController({ getDrawer, page, state, toast, onSaveNote } = {}) {
  function save() {
    if (!state.authenticated) {
      toast("Log in with Ubisoft to save lesson notes");
      return;
    }
    const textarea = getDrawer()?.querySelector("[data-reader-note]");
    const text = textarea?.value || "";
    Promise.resolve(onSaveNote?.(page.slug, text))
      .then(() => toast(text.trim() ? "Lesson note saved" : "Lesson note cleared"))
      .catch((error) => toast(error?.message || "Could not save note"));
  }

  return { save };
}

export { createNotesController };
