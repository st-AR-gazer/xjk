import { renderSimpleMarkdown } from "/shared/xjk-core/simple-markdown.js";

async function loadContent() {
  const content = document.getElementById("prose");
  const sourceUrl = content?.dataset.src;
  if (!content || !sourceUrl) return;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Markdown request failed (${response.status})`);
    content.replaceChildren(renderSimpleMarkdown(document, await response.text()));
  } catch {
    const message = document.createElement("p");
    message.className = "load-error";
    message.textContent = "Failed to load content.";
    content.replaceChildren(message);
  }
}

loadContent();
