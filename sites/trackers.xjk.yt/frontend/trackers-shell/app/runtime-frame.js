import { ROUTE_CONFIG, runtimeEmbedHref } from "./route-model.js?v=2";

const EMBED_STYLE_ID = "xjk-trackers-shell-embed";
const EMBED_STYLE_TEXT = [
  "html, body { background: transparent !important; }",
  ".backdrop, .sidebar, .corner-back, .foot { display: none !important; }",
  ".content-area { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }",
].join("\n");

function runtimeMarkup(context) {
  const config = ROUTE_CONFIG[context.route];
  return `
    <section class="runtime-host runtime-host--${config.theme}">
      <div class="runtime-frame-card is-loading" data-loading-label="Loading runtime...">
        <iframe
          class="runtime-frame"
          data-runtime-frame
          src="${runtimeEmbedHref(context)}"
          title="${config.label}"
          loading="eager"
        ></iframe>
      </div>
    </section>`;
}

function injectEmbeddedStyles(documentObject, card) {
  if (!documentObject) return;
  let style = documentObject.getElementById(EMBED_STYLE_ID);
  if (!style) {
    style = documentObject.createElement("style");
    style.id = EMBED_STYLE_ID;
    style.textContent = EMBED_STYLE_TEXT;
    documentObject.head.appendChild(style);
  }
  card.classList.remove("is-loading");
}

function mountRuntime(root) {
  const frame = root.querySelector("[data-runtime-frame]");
  const card = root.querySelector(".runtime-frame-card");
  if (!frame || !card) return () => {};

  const handleLoad = () => {
    try {
      injectEmbeddedStyles(frame.contentDocument, card);
    } catch {}
  };

  frame.addEventListener("load", handleLoad);
  handleLoad();
  return () => frame.removeEventListener("load", handleLoad);
}

export { EMBED_STYLE_ID, EMBED_STYLE_TEXT, injectEmbeddedStyles, mountRuntime, runtimeMarkup };
