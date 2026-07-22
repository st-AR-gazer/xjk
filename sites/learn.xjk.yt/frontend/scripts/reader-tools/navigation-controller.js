import { copyText, slugToHash } from "../utils.js";
import { getPins, savePin } from "./pins.js";

const HEADING_SELECTOR =
  ".learn-article-body h2[id], .learn-article-body h3[id], .learn-article-body h4[id], .learn-article-body h5[id], .learn-article-body h6[id]";

function createNavigationController({
  panel,
  page,
  toast,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  copyTextImpl = copyText,
  getPinsImpl = getPins,
  savePinImpl = savePin,
  now = () => new Date(),
} = {}) {
  function cssEscape(value = "") {
    if (windowRef.CSS?.escape) return windowRef.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function jumpTo(id) {
    const target = id ? panel.querySelector(`#${cssEscape(id)}`) : panel.querySelector(".lesson-header");
    if (!target) return;
    panel.scrollTo({ top: target.offsetTop - 72, behavior: "smooth" });
  }

  function currentHeading() {
    const headings = [...panel.querySelectorAll(HEADING_SELECTOR)];
    if (!headings.length) return null;
    const threshold = panel.scrollTop + 92;
    return headings.reduce((best, heading) => (heading.offsetTop <= threshold ? heading : best), headings[0]);
  }

  function currentSectionText() {
    const heading = currentHeading();
    const body = panel.querySelector(".learn-article-body");
    if (!body) return "";
    if (!heading) return body.innerText.trim();
    const level = Number(heading.tagName.slice(1));
    const chunks = [heading.innerText.trim()];
    let node = heading.nextElementSibling;
    while (node) {
      const nextLevel = /^H[2-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : 99;
      if (nextLevel <= level) break;
      chunks.push(node.innerText.trim());
      node = node.nextElementSibling;
    }
    return chunks.filter(Boolean).join("\n\n");
  }

  function sectionUrl(id = currentHeading()?.id || "") {
    const base = `${windowRef.location.origin}${windowRef.location.pathname}`;
    return `${base}${slugToHash(page.slug)}${id ? `?section=${encodeURIComponent(id)}` : ""}`;
  }

  function pinCurrentSection() {
    const heading = currentHeading();
    const label = heading?.innerText?.trim() || page.title || "Lesson start";
    savePinImpl(page.slug, {
      id: heading?.id || "",
      label,
      updatedAt: now().toISOString(),
    });
    toast(`Pinned: ${label}`);
  }

  function goToPin() {
    const pin = getPinsImpl()[page.slug];
    if (!pin) {
      toast("No pinned section yet");
      return;
    }
    jumpTo(pin.id);
    toast(`Opened pin: ${pin.label}`);
  }

  function copySectionLink() {
    const heading = currentHeading();
    copyTextImpl(sectionUrl(heading?.id || "")).then(() => toast("Section link copied"));
  }

  function shareLesson() {
    const payload = {
      title: page.title || "learn.xjk.yt",
      text: page.summary || "",
      url: sectionUrl(""),
    };
    if (navigatorRef.share) {
      navigatorRef
        .share(payload)
        .catch(() => copyTextImpl(`${payload.title}\n${payload.url}`).then(() => toast("Share text copied")));
      return;
    }
    copyTextImpl(`${payload.title}\n${payload.text ? `${payload.text}\n` : ""}${payload.url}`).then(() =>
      toast("Share text copied")
    );
  }

  function copyCurrentSection() {
    const text = currentSectionText();
    copyTextImpl(text || page.title || "").then(() => toast("Section copied"));
  }

  return {
    copyCurrentSection,
    copySectionLink,
    currentHeading,
    currentSectionText,
    goToPin,
    jumpTo,
    pinCurrentSection,
    sectionUrl,
    shareLesson,
  };
}

export { createNavigationController };
