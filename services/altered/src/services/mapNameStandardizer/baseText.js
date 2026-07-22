import { toText } from "../../../../shared/valueUtils.js";

function normalizeWhitespace(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function normalizeAliasValue(value) {
  return normalizeWhitespace(toText(value))
    .toLowerCase()
    .replace(/[\[\]()]/g, "")
    .replace(/[_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { normalizeAliasValue, normalizeWhitespace, toText };
