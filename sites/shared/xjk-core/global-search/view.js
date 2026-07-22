import { ensureStylesheetLink, safeCssColor, shortcutLabel } from "../dom-utils.js";
import { KIND_LABELS, KIND_MARKERS, orderedResultGroups, parseScope, slug } from "./model.js";

const SEARCH_STYLES_URL = new URL("../global-search.css", import.meta.url);

const SEARCH_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5"></circle>
    <path d="m16 16 5 5"></path>
  </svg>`;

const CLOSE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
    <path d="m6 6 12 12M18 6 6 18"></path>
  </svg>`;

function ensureSearchStyles() {
  return ensureStylesheetLink(document, {
    selector: "link[data-xjk-global-search-styles]",
    href: SEARCH_STYLES_URL.href,
    datasetKey: "xjkGlobalSearchStyles",
  });
}

function createDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "xjkGlobalSearch";
  dialog.className = "xjk-search-dialog";
  dialog.setAttribute("aria-labelledby", "xjkSearchLabel");
  globalThis.XjkSafeHtml.set(
    dialog,
    `
    <div class="xjk-search-shell">
      <div class="xjk-search-input-row">
        <span class="xjk-search-input-icon">${SEARCH_ICON}</span>
        <label id="xjkSearchLabel" for="xjkSearchInput" hidden>Search the xjk service</label>
        <input
          class="xjk-search-input"
          id="xjkSearchInput"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="xjkSearchResults"
          aria-expanded="true"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search services, tools, guides..."
        />
        <button class="xjk-search-close" type="button" aria-label="Close xjk search">${CLOSE_ICON}</button>
      </div>
      <div class="xjk-search-body">
        <div class="xjk-search-results-panel" id="xjkSearchResults" role="listbox" aria-label="xjk search results"></div>
        <aside class="xjk-search-preview" aria-label="Selected result preview"></aside>
      </div>
      <footer class="xjk-search-footer">
        <span class="xjk-search-footer-status" role="status" aria-live="polite">Loading the xjk index...</span>
        <span class="xjk-search-footer-keys" aria-hidden="true">
          <span class="xjk-search-footer-key"><kbd>↑↓</kbd> navigate</span>
          <span class="xjk-search-footer-key"><kbd>↵</kbd> open</span>
          <span class="xjk-search-footer-key"><kbd>&gt;</kbd> actions</span>
          <span class="xjk-search-footer-key"><kbd>esc</kbd> close</span>
        </span>
      </footer>
    </div>`
  );
  document.body.appendChild(dialog);
  return dialog;
}

function createAutoTrigger({ floating = false } = {}) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = `xjk-global-search-trigger xjk-global-search-trigger--compact${floating ? " xjk-global-search-trigger--floating" : ""}`;
  trigger.dataset.xjkSearchTrigger = "";
  trigger.dataset.xjkSearchAuto = "true";
  trigger.setAttribute("aria-label", `Search all xjk services (${shortcutLabel()})`);
  trigger.title = `Search xjk · ${shortcutLabel()}`;
  globalThis.XjkSafeHtml.set(trigger, SEARCH_ICON);
  return trigger;
}

function installAutoTrigger() {
  if (document.querySelector("[data-xjk-search-trigger], [data-xjk-topbar-local-search]")) return;

  const searchSlot = document.querySelector("[data-xjk-global-search-slot]");
  if (searchSlot) {
    searchSlot.appendChild(createAutoTrigger());
    return;
  }

  document.body.appendChild(createAutoTrigger({ floating: true }));
}

function createSearchView({ state, computeResults, activateSelected }) {
  const dialog = createDialog();
  const input = dialog.querySelector(".xjk-search-input");
  const resultsRoot = dialog.querySelector(".xjk-search-results-panel");
  const preview = dialog.querySelector(".xjk-search-preview");
  const footerStatus = dialog.querySelector(".xjk-search-footer-status");
  const closeButton = dialog.querySelector(".xjk-search-close");
  const shell = dialog.querySelector(".xjk-search-shell");

  function renderPreview(item) {
    preview.replaceChildren();
    if (!item) return;
    const accent = safeCssColor(item.accent);
    preview.style.setProperty("--preview-accent", accent);
    shell.style.setProperty("--xjk-search-active-accent", accent);

    const marker = document.createElement("span");
    marker.className = "xjk-search-preview-marker";
    marker.textContent = KIND_MARKERS[item.kind] || "xjk";

    const kicker = document.createElement("p");
    kicker.className = "xjk-search-preview-kicker";
    kicker.textContent = [item.siteLabel, KIND_LABELS[item.kind] || item.kind].filter(Boolean).join(" / ");

    const title = document.createElement("h2");
    title.className = "xjk-search-preview-title";
    title.textContent = item.title;

    const description = document.createElement("p");
    description.className = "xjk-search-preview-description";
    description.textContent = item.description || item.subtitle || `Open ${item.title}.`;

    const tags = document.createElement("div");
    tags.className = "xjk-search-preview-tags";
    for (const keyword of (item.keywords || []).slice(0, 4)) {
      const tag = document.createElement("span");
      tag.className = "xjk-search-preview-tag";
      tag.textContent = keyword;
      tags.appendChild(tag);
    }

    const path = document.createElement("p");
    path.className = "xjk-search-preview-path";
    if (item.href) {
      try {
        const url = new URL(item.href, globalThis.location.href);
        path.textContent = `${url.host}${url.pathname}${url.hash}`;
      } catch {
        path.textContent = item.href;
      }
    } else {
      path.textContent = "Runs on the current page";
    }

    preview.append(marker, kicker, title, description);
    if (tags.childElementCount) preview.appendChild(tags);
    preview.appendChild(path);
  }

  function updateSelection(nextIndex, { scroll = true } = {}) {
    if (!state.results.length) {
      state.selectedIndex = 0;
      input.removeAttribute("aria-activedescendant");
      renderPreview(null);
      return;
    }
    state.selectedIndex = (nextIndex + state.results.length) % state.results.length;
    state.resultButtons.forEach((button, index) => {
      const active = index === state.selectedIndex;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      if (active) {
        input.setAttribute("aria-activedescendant", button.id);
        if (scroll) button.scrollIntoView({ block: "nearest" });
      }
    });
    renderPreview(state.results[state.selectedIndex]);
  }

  function renderEmptyResults() {
    const empty = document.createElement("div");
    empty.className = "xjk-search-empty";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Nothing found on the network";
    const hint = document.createElement("span");
    hint.textContent = "Try a service, tool, map topic, or use > for actions and # for this page.";
    copy.append(title, hint);
    empty.appendChild(copy);
    resultsRoot.appendChild(empty);
    footerStatus.textContent = state.indexLoaded
      ? `No matches across ${state.indexCount} indexed items`
      : "No local matches · the full index is still loading";
    updateSelection(0);
  }

  function createResultButton(item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `xjkSearchResult${index}`;
    button.className = "xjk-search-result";
    button.tabIndex = -1;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.style.setProperty("--result-accent", safeCssColor(item.accent));

    const marker = document.createElement("span");
    marker.className = "xjk-search-result-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = KIND_MARKERS[item.kind] || "xjk";

    const copy = document.createElement("span");
    copy.className = "xjk-search-result-copy";
    const title = document.createElement("span");
    title.className = "xjk-search-result-title";
    title.textContent = item.title;
    const subtitle = document.createElement("span");
    subtitle.className = "xjk-search-result-subtitle";
    subtitle.textContent = item.subtitle || item.siteLabel || item.section || "xjk";
    copy.append(title, subtitle);

    const kind = document.createElement("span");
    kind.className = "xjk-search-result-kind";
    kind.textContent = KIND_LABELS[item.kind] || item.kind || "Result";

    button.append(marker, copy, kind);
    button.addEventListener("pointerenter", () => updateSelection(index, { scroll: false }));
    button.addEventListener("click", () => {
      updateSelection(index, { scroll: false });
      activateSelected();
    });
    return button;
  }

  function appendResultGroup(groupName, items, groupIndex, resultIndex) {
    const group = document.createElement("section");
    group.className = "xjk-search-group";
    group.setAttribute("role", "group");
    const label = document.createElement("div");
    label.className = "xjk-search-group-label";
    const labelText = document.createElement("span");
    labelText.id = `xjkSearchGroup${groupIndex}-${slug(groupName)}`;
    labelText.textContent = groupName;
    group.setAttribute("aria-labelledby", labelText.id);
    const labelCount = document.createElement("span");
    labelCount.textContent = String(items.length).padStart(2, "0");
    label.append(labelText, labelCount);
    group.appendChild(label);

    for (const item of items) {
      const button = createResultButton(item, resultIndex);
      resultIndex += 1;
      state.resultButtons.push(button);
      group.appendChild(button);
    }
    resultsRoot.appendChild(group);
    return resultIndex;
  }

  function renderResults({ preserveSelection = false } = {}) {
    const previousId = preserveSelection ? state.results[state.selectedIndex]?.id : "";
    state.results = computeResults(input.value);
    if (previousId) {
      const nextIndex = state.results.findIndex((item) => item.id === previousId);
      state.selectedIndex = nextIndex >= 0 ? nextIndex : 0;
    } else {
      state.selectedIndex = 0;
    }
    state.resultButtons = [];
    resultsRoot.replaceChildren();

    if (!state.results.length) {
      renderEmptyResults();
      return;
    }

    const orderedGroups = orderedResultGroups(state.results, input.value);
    const selectedId = state.results[state.selectedIndex]?.id;
    state.results = orderedGroups.flatMap(([, items]) => items);
    if (selectedId) {
      const reorderedIndex = state.results.findIndex((item) => item.id === selectedId);
      state.selectedIndex = reorderedIndex >= 0 ? reorderedIndex : 0;
    }

    let resultIndex = 0;
    orderedGroups.forEach(([groupName, items], groupIndex) => {
      resultIndex = appendResultGroup(groupName, items, groupIndex, resultIndex);
    });

    const scope = parseScope(input.value);
    const scopeLabel = scope.kinds?.includes("action")
      ? "actions"
      : scope.kinds?.includes("site")
        ? "services"
        : scope.kinds?.includes("local")
          ? "this page"
          : "xjk";
    footerStatus.textContent = `${state.results.length} result${state.results.length === 1 ? "" : "s"} in ${scopeLabel}${
      state.indexLoaded ? ` · ${state.indexCount} indexed` : " · indexing..."
    }`;
    updateSelection(state.selectedIndex, { scroll: false });
  }

  return {
    closeButton,
    dialog,
    footerStatus,
    input,
    renderResults,
    updateSelection,
  };
}

export { createSearchView, ensureSearchStyles, installAutoTrigger };
