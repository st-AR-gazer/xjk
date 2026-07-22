(function installSafeHtml(global) {
  if (global.XjkSafeHtml) return;

  const blockedElements = new Set([
    "ANIMATE",
    "ANIMATEMOTION",
    "ANIMATETRANSFORM",
    "BASE",
    "DISCARD",
    "EMBED",
    "FOREIGNOBJECT",
    "FRAME",
    "FRAMESET",
    "HANDLER",
    "LINK",
    "MATH",
    "META",
    "NOEMBED",
    "NOFRAMES",
    "NOSCRIPT",
    "OBJECT",
    "PLAINTEXT",
    "SCRIPT",
    "SET",
    "STYLE",
    "TEMPLATE",
    "XMP",
  ]);
  const urlAttributes = new Set(["action", "formaction", "href", "poster", "src", "xlink:href"]);
  const safeProtocols = new Set(["blob:", "http:", "https:", "mailto:", "tel:"]);

  function compactUrlProbe(value) {
    return String(value || "")
      .replace(/[\u0000-\u0020\u007f]+/g, "")
      .toLowerCase();
  }

  function isSafeUrl(value, { attributeName = "", elementName = "", baseUrl = "http://localhost/" } = {}) {
    const raw = String(value || "").trim();
    if (!raw) return true;
    const probe = compactUrlProbe(raw);
    if (/^(?:#|\/|\.\/|\.\.\/|\?)/.test(probe)) return !probe.startsWith("//");
    if (
      attributeName === "src" &&
      elementName === "IMG" &&
      /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(raw)
    ) {
      return true;
    }
    try {
      return safeProtocols.has(new URL(raw, baseUrl).protocol.toLowerCase());
    } catch {
      return false;
    }
  }

  function isSafeStyle(value) {
    return !/(?:\\|\/\*|@import|behavior\s*:|expression\s*\(|-moz-binding|url\s*\()/i.test(String(value || ""));
  }

  function isSafeSrcset(value, options = {}) {
    const candidates = String(value || "")
      .split(",")
      .map((candidate) => candidate.trim())
      .filter(Boolean);
    return candidates.every((candidate) => {
      const [url, ...descriptors] = candidate.split(/\s+/);
      return (
        isSafeUrl(url, options) &&
        descriptors.length <= 1 &&
        descriptors.every((descriptor) => /^(?:\d+(?:\.\d+)?x|\d+w)$/.test(descriptor))
      );
    });
  }

  function sanitizeElement(element, documentRef) {
    const tagName = String(element.localName || element.tagName || "").toUpperCase();
    if (blockedElements.has(tagName)) {
      element.remove();
      return;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "http-equiv") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style" && !isSafeStyle(attribute.value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      const urlOptions = {
        attributeName: name,
        elementName: tagName,
        baseUrl: documentRef.baseURI || global.location?.href || "http://localhost/",
      };
      if (name === "srcset" && !isSafeSrcset(attribute.value, urlOptions)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (urlAttributes.has(name) && !isSafeUrl(attribute.value, urlOptions)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (tagName === "USE" && element.hasAttribute("href") && !element.getAttribute("href").trim().startsWith("#")) {
      element.removeAttribute("href");
    }

    if (tagName === "A" && element.getAttribute("target")?.toLowerCase() === "_blank") {
      const rel = new Set(
        String(element.getAttribute("rel") || "")
          .split(/\s+/)
          .filter(Boolean)
      );
      rel.add("noopener");
      rel.add("noreferrer");
      element.setAttribute("rel", [...rel].join(" "));
    }
  }

  function fragment(html, documentRef = global.document) {
    if (!documentRef?.createElement) throw new TypeError("A DOM document is required to sanitize HTML.");
    const template = documentRef.createElement("template");
    template.innerHTML = String(html ?? "");
    for (const element of [...template.content.querySelectorAll("*")]) sanitizeElement(element, documentRef);
    return template.content;
  }

  function set(element, html, documentRef = element?.ownerDocument || global.document) {
    if (!element?.replaceChildren) throw new TypeError("An HTML container is required.");
    element.replaceChildren(fragment(html, documentRef));
    return html;
  }

  global.XjkSafeHtml = Object.freeze({ fragment, isSafeSrcset, isSafeStyle, isSafeUrl, set });
})(globalThis);
