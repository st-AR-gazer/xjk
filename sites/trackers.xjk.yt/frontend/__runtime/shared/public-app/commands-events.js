function createTrackerCommands({ documentRef, refreshData, state, transport, view }) {
  async function runNow() {
    const button = view.elements.runNowBtn;
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Running…";
    try {
      await transport.api("api/v1/admin/tracker/run-now", { method: "POST", body: {}, admin: true });
      await refreshData({ silent: true });
    } catch (error) {
      view.elements.engineError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function bindEvents() {
    documentRef.querySelectorAll(".dock-btn").forEach((button) => {
      button.addEventListener("click", () => view.switchTab(button.dataset.view));
    });
    view.elements.mapSearch.addEventListener("input", (event) => {
      state.filters.search = event.target.value;
      state.pagination.page = 1;
      view.renderMaps();
    });
    view.elements.dueOnly.addEventListener("change", (event) => {
      state.filters.dueOnly = event.target.checked;
      state.pagination.page = 1;
      view.renderMaps();
    });
    view.elements.pagePrev.addEventListener("click", () => {
      if (state.pagination.page <= 1) return;
      state.pagination.page -= 1;
      view.renderMaps();
    });
    view.elements.pageNext.addEventListener("click", () => {
      if (state.pagination.page >= state.pagination.totalPages) return;
      state.pagination.page += 1;
      view.renderMaps();
    });
    view.elements.runNowBtn.addEventListener("click", runNow);
  }

  return { bindEvents, runNow };
}

export { createTrackerCommands };
