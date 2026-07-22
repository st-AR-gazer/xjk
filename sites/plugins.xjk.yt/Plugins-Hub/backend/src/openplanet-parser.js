function decodeHtmlEntities(value) {
  if (!value) return "";
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return String(value)
    .replace(/&#(\d+);/g, (_all, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (all, key) => (named[key] !== undefined ? named[key] : all));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteOpenplanetUrl(value, openplanetOrigin) {
  try {
    const origin = new URL(openplanetOrigin);
    const url = new URL(String(value || ""), origin);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password || url.origin !== origin.origin) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function pluginIdFromHref(href, index) {
  const match = String(href || "").match(/\/plugin\/([^/?#]+)/i);
  return match ? match[1].trim() : `plugin-${index + 1}`;
}

function toneForPluginId(id) {
  return hashString(String(id || "")) % 2 === 0 ? "cool" : "warm";
}

function targetFromTags(tags) {
  return Array.isArray(tags) && tags.length ? `${tags.join(" / ")} + Openplanet` : "Trackmania + Openplanet";
}

export function parseTotalPages(profileHtml, { maxPages = 20 } = {}) {
  let totalPages = 1;
  for (const match of String(profileHtml || "").matchAll(/href="\?page=(\d+)"/g)) {
    const page = Number(match[1]);
    if (Number.isFinite(page) && page > totalPages) totalPages = page;
  }
  return Math.max(1, Math.min(totalPages, Math.max(1, Number(maxPages) || 20)));
}

export function parsePluginCards(
  profileHtml,
  pageNumber,
  { openplanetOrigin = "https://openplanet.dev", pluginInstallLabel = "Openplanet plugin manager" } = {}
) {
  const blocks = String(profileHtml || "")
    .split('<div class="column is-4 plugin-info">')
    .slice(1);
  const plugins = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const hrefMatch = block.match(/<a href="(\/plugin\/[^"]+)"/i);
    if (!hrefMatch) continue;

    const titleMatch = block.match(/<p class="plugin-title">\s*<a href="[^"]+">([\s\S]*?)<\/a>/i);
    const descriptionMatch = block.match(/<p class="plugin-description">([\s\S]*?)<\/p>/i);
    const imageMatch = block.match(/<img class="plugin-image[^"]*"[^>]*src="([^"]+)"/i);
    const tagMatches = [...block.matchAll(/<span class="tag [^"]*">([\s\S]*?)<\/span>/gi)];
    const tags = tagMatches
      .map((match) => decodeHtmlEntities(stripHtml(match[1])))
      .map((tag) => tag.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const href = decodeHtmlEntities(hrefMatch[1]);
    const id = pluginIdFromHref(href, index);
    const name = decodeHtmlEntities(stripHtml(titleMatch ? titleMatch[1] : id)) || id;
    const description =
      decodeHtmlEntities(stripHtml(descriptionMatch ? descriptionMatch[1] : "")) || "No description provided.";

    plugins.push({
      id,
      name,
      description,
      category: "Plugin",
      status: "live",
      target: targetFromTags(tags),
      install: pluginInstallLabel,
      link: toAbsoluteOpenplanetUrl(href, openplanetOrigin),
      tone: toneForPluginId(id),
      image: imageMatch ? toAbsoluteOpenplanetUrl(decodeHtmlEntities(imageMatch[1]), openplanetOrigin) : "",
      tags,
      sourcePage: pageNumber,
    });
  }

  return plugins;
}

export function profilePageUrl(profileUrl, pageNumber) {
  const url = new URL(profileUrl);
  if (pageNumber > 1) url.searchParams.set("page", String(pageNumber));
  else url.searchParams.delete("page");
  return url.toString();
}

export { decodeHtmlEntities, stripHtml, toneForPluginId };
import { hashString } from "./hash.js";
