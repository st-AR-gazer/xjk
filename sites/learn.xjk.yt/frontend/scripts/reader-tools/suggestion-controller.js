function createSuggestionController({ getDrawer, navigationController, page, state, toast, onSubmitSuggestion } = {}) {
  function submit() {
    if (!state.authenticated) {
      toast("Log in with Ubisoft to send improvement suggestions");
      return;
    }
    const textarea = getDrawer()?.querySelector("[data-reader-suggestion]");
    const text = textarea?.value || "";
    if (text.trim().length < 8) {
      toast("Suggestion is too short");
      return;
    }
    Promise.resolve(
      onSubmitSuggestion?.({
        slug: page.slug,
        title: page.title || "",
        text,
        context: navigationController.currentSectionText().slice(0, 1800),
      })
    )
      .then(() => {
        if (textarea) textarea.value = "";
        toast("Suggestion sent");
      })
      .catch((error) => toast(error?.message || "Could not send suggestion"));
  }

  return { submit };
}

export { createSuggestionController };
