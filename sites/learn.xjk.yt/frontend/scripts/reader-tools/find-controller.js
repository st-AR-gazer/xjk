function createFindController({ panel, getDrawer, documentRef, nodeFilter } = {}) {
  let hits = [];
  let index = -1;

  function updateStatus() {
    const label = getDrawer()?.querySelector("[data-reader-find-status]");
    if (label) label.textContent = hits.length ? `${index + 1} / ${hits.length}` : "No matches";
  }

  function clear() {
    hits.forEach((mark) => mark.replaceWith(documentRef.createTextNode(mark.textContent || "")));
    hits = [];
    index = -1;
    panel.querySelector(".learn-article-body")?.normalize();
  }

  function markTextNode(textNode, needle) {
    const value = textNode.nodeValue || "";
    const lower = value.toLowerCase();
    const query = needle.toLowerCase();
    const fragment = documentRef.createDocumentFragment();
    let cursor = 0;
    let matchIndex = lower.indexOf(query);
    while (matchIndex !== -1) {
      fragment.append(documentRef.createTextNode(value.slice(cursor, matchIndex)));
      const mark = documentRef.createElement("mark");
      mark.className = "learn-find-hit";
      mark.textContent = value.slice(matchIndex, matchIndex + needle.length);
      fragment.append(mark);
      cursor = matchIndex + needle.length;
      matchIndex = lower.indexOf(query, cursor);
    }
    fragment.append(documentRef.createTextNode(value.slice(cursor)));
    textNode.replaceWith(fragment);
  }

  function activate() {
    hits.forEach((hit, hitIndex) => hit.classList.toggle("is-active", hitIndex === index));
    if (index >= 0) {
      const hit = hits[index];
      panel.scrollTo({ top: hit.offsetTop - 120, behavior: "smooth" });
    }
  }

  function run(query = "") {
    clear();
    const needle = query.trim();
    if (!needle) {
      updateStatus();
      return;
    }
    const body = panel.querySelector(".learn-article-body");
    if (!body) return;
    const walker = documentRef.createTreeWalker(body, nodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) return nodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest("script, style, mark")) return nodeFilter.FILTER_REJECT;
        return node.nodeValue.toLowerCase().includes(needle.toLowerCase())
          ? nodeFilter.FILTER_ACCEPT
          : nodeFilter.FILTER_REJECT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((textNode) => markTextNode(textNode, needle));
    hits = [...body.querySelectorAll(".learn-find-hit")];
    index = hits.length ? 0 : -1;
    activate();
    updateStatus();
  }

  function move(delta) {
    if (!hits.length) return;
    index = (index + delta + hits.length) % hits.length;
    activate();
    updateStatus();
  }

  return {
    clear,
    move,
    run,
    snapshot: () => ({ count: hits.length, index }),
  };
}

export { createFindController };
