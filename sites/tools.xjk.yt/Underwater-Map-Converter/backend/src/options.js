import { stripMapGbxExtension } from "../../../shared/backend/values.js";

const validVariants = ["normal", "meshless", "both"];
const validCoverages = ["one-layer", "full-stack"];

function stripMapExtension(fileName) {
  return stripMapGbxExtension(fileName, { allowDuplicateSuffix: true });
}

function makeDownloadName(originalName, suffix) {
  return `${stripMapExtension(originalName)}-${suffix}.Map.Gbx`;
}

function parseConversionOptions(body) {
  const variant = String(body?.variant || "both").toLowerCase();
  if (!validVariants.includes(variant)) return { error: `Invalid variant. Use: ${validVariants.join(", ")}` };
  const coverage = String(body?.coverage || "full-stack").toLowerCase();
  if (!validCoverages.includes(coverage)) return { error: `Invalid coverage. Use: ${validCoverages.join(", ")}` };
  const suffix =
    String(body?.suffix || "Underwater")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64) || "Underwater";
  return { variant, coverage, suffix };
}

export { makeDownloadName, parseConversionOptions, stripMapExtension };
