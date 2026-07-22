function expandTrackmaniaColor(hex) {
  return `#${hex
    .split("")
    .map((digit) => `${digit}${digit}`)
    .join("")}`;
}

function createTextState(overrides = {}) {
  return {
    bold: false,
    color: "",
    italic: false,
    shadow: false,
    uppercase: false,
    width: "normal",
    ...overrides,
  };
}

export function parseTrackmaniaMarkup(value) {
  const source = String(value || "");
  const runs = [];
  let state = createTextState();
  let buffer = "";
  let plainText = "";

  const flush = () => {
    const text = state.uppercase ? buffer.toLocaleUpperCase() : buffer;
    if (text) {
      runs.push({
        text,
        bold: state.bold,
        color: state.color,
        italic: state.italic,
        shadow: state.shadow,
        width: state.width,
      });
      plainText += text;
    }
    buffer = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== "$") {
      buffer += char;
      continue;
    }

    const next = source[index + 1];
    if (!next) {
      buffer += char;
      continue;
    }

    if (next === "$") {
      buffer += "$";
      index += 1;
      continue;
    }

    const colorCode = source.slice(index + 1, index + 4);
    if (/^[0-9a-f]{3}$/i.test(colorCode)) {
      flush();
      state = createTextState({
        ...state,
        color: expandTrackmaniaColor(colorCode.toLowerCase()),
      });
      index += 3;
      continue;
    }

    const code = next.toLowerCase();
    if ("oiwntsmgz".includes(code)) {
      flush();
      if (code === "o") state = createTextState({ ...state, bold: true });
      if (code === "i") state = createTextState({ ...state, italic: true });
      if (code === "w") state = createTextState({ ...state, width: "wide" });
      if (code === "n") state = createTextState({ ...state, width: "narrow" });
      if (code === "m") state = createTextState({ ...state, width: "normal" });
      if (code === "t") state = createTextState({ ...state, uppercase: true });
      if (code === "s") state = createTextState({ ...state, shadow: true });
      if (code === "g") state = createTextState({ ...state, color: "" });
      if (code === "z") state = createTextState();
      index += 1;
      continue;
    }

    if (code === "l") {
      flush();
      if (source[index + 2] === "[") {
        const endBracket = source.indexOf("]", index + 3);
        index = endBracket === -1 ? index + 1 : endBracket;
      } else {
        index += 1;
      }
      continue;
    }

    if (next === "<" || next === ">") {
      flush();
      index += 1;
      continue;
    }

    buffer += "$";
  }

  flush();
  return { plainText, runs };
}

function appendRun(fragment, run, wordContext, document) {
  for (const token of run.text.match(/\s+|\S+/g) || []) {
    if (/^\s+$/.test(token)) {
      wordContext.currentWord = null;
      fragment.append(document.createTextNode(token));
      continue;
    }

    if (!wordContext.currentWord) {
      wordContext.currentWord = document.createElement("span");
      wordContext.currentWord.className = "tm-word";
      fragment.append(wordContext.currentWord);
    }

    const span = document.createElement("span");
    span.className = "tm-text-run";
    if (run.bold) span.classList.add("tm-bold");
    if (run.italic) span.classList.add("tm-italic");
    if (run.shadow) span.classList.add("tm-shadow");
    if (run.width === "wide") span.classList.add("tm-wide");
    if (run.width === "narrow") span.classList.add("tm-narrow");
    if (run.color) span.style.color = run.color;
    span.textContent = token;
    wordContext.currentWord.append(span);
  }
}

export function renderTrackmaniaMarkup(parsed, document = globalThis.document) {
  if (!document?.createDocumentFragment) {
    throw new TypeError("A DOM document is required to render Trackmania text");
  }

  const fragment = document.createDocumentFragment();
  const wordContext = { currentWord: null };
  for (const run of parsed.runs) {
    appendRun(fragment, run, wordContext, document);
  }
  return fragment;
}

export function parseTrackmaniaText(value, document = globalThis.document) {
  const parsed = parseTrackmaniaMarkup(value);
  return {
    ...parsed,
    fragment: renderTrackmaniaMarkup(parsed, document),
  };
}

export function trackmaniaPlainText(value, fallback = "") {
  return parseTrackmaniaMarkup(value).plainText || fallback;
}

export function setTrackmaniaText(element, value, fallback, { prefix = "" } = {}) {
  const source = String(value || "").trim() || fallback;
  const document = element.ownerDocument || globalThis.document;
  const parsed = parseTrackmaniaText(source, document);
  element.classList.add("tm-text");
  element.replaceChildren();
  if (prefix) {
    element.append(document.createTextNode(prefix));
  }
  element.append(parsed.fragment);
  element.title = parsed.plainText && parsed.plainText !== source ? parsed.plainText : "";
  return parsed.plainText || fallback;
}
