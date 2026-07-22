export function normalizeLineEndings(source) {
  return String(source ?? "").replace(/\r\n?/g, "\n");
}

export function splitFrontmatter(source, options = {}) {
  const normalized = normalizeLineEndings(source);
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: normalized };
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closeIndex === -1) {
    return { frontmatter: {}, body: normalized };
  }

  return {
    frontmatter: parseFrontmatter(lines.slice(1, closeIndex).join("\n"), options),
    body: lines.slice(closeIndex + 1).join("\n"),
  };
}

export function parseFrontmatter(block, options = {}) {
  const data = {};
  let currentListKey = null;

  for (const line of normalizeLineEndings(block).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentListKey) {
      data[currentListKey].push(parseFrontmatterScalar(listItem[1], options));
      continue;
    }

    const pair = line.match(/^([A-Za-z][A-Za-z0-9_.-]*):\s*(.*)$/);
    if (!pair) continue;

    const [, key, rawValue] = pair;
    if (!rawValue.trim()) {
      data[key] = [];
      currentListKey = key;
      continue;
    }

    data[key] = parseFrontmatterScalar(rawValue, options);
    currentListKey = null;
  }

  return data;
}

export function parseFrontmatterScalar(value, { parseNumbers = false } = {}) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return splitCommaList(trimmed.slice(1, -1)).map((item) => parseFrontmatterScalar(item, { parseNumbers }));
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (parseNumbers && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

  return trimmed;
}

function splitCommaList(value) {
  const parts = [];
  let buffer = "";
  let quote = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      buffer += char;
      if (char === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
      continue;
    }

    if (char === ",") {
      parts.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}
