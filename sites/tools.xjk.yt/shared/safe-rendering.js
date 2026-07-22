import { createTextElement, replaceWithTextLines } from "../../shared/xjk-core/dom-utils.js";

function renderClipCandidate(doc, card, entry = {}, { formatRaceTime = String } = {}) {
  const top = createTextElement(doc, "div", { className: "candidate-top" });
  top.append(
    createTextElement(doc, "strong", {
      text: `clip ${entry.clipIndex} / track ${entry.trackIndex} / block ${entry.blockIndex}`,
    }),
    createTextElement(doc, "span", {
      className: "candidate-time",
      text: formatRaceTime(entry.derivedRaceTimeMs),
    })
  );

  const meta = createTextElement(doc, "div", { className: "candidate-meta" });
  meta.append(
    createTextElement(doc, "span", { text: `EntList: ${entry.entListCount}` }),
    createTextElement(doc, "span", { text: `Samples: ${entry.totalSamples}` }),
    createTextElement(doc, "span", { text: `Samples2: ${entry.totalSamples2}` })
  );

  card.replaceChildren(
    top,
    meta,
    createTextElement(doc, "div", {
      className: "candidate-path",
      text: entry.sourcePath || "Unknown source path",
    })
  );
  return card;
}

function renderGhostDetails(doc, details, ghost = {}) {
  return replaceWithTextLines(doc, details, [
    `Login: ${ghost.ghostLogin || "N/A"}`,
    `Zone: ${ghost.ghostZone || "N/A"}`,
    `Trigram/Club: ${(ghost.ghostTrigram || "-") + " / " + (ghost.ghostClubTag || "-")}`,
    `Model: ${ghost?.playerModel?.author || "?"}:${ghost?.playerModel?.id || "?"}`,
    `GameVersion: ${ghost?.recordData?.gameVersion || "N/A"}`,
    `Walltime: ${ghost.walltimeStartTimestamp || "?"} -> ${ghost.walltimeEndTimestamp || "?"}`,
  ]);
}

export { renderClipCandidate, renderGhostDetails };
