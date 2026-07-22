import { fetchPublicHttp } from "../../../../../services/shared/httpEgressPolicy.js";
import { parsePluginCards, parseTotalPages, profilePageUrl } from "./openplanet-parser.js";

export function createOpenplanetClient({ config, fetchImpl = fetch, lookup } = {}) {
  if (!config) throw new Error("Plugins Hub config is required.");

  async function request(url, { accept, responseType }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.openplanetFetchTimeoutMs);
    try {
      const result = await fetchPublicHttp(url, {
        allowedOrigins: [config.openplanetOrigin],
        fetchImpl,
        lookup,
        maxRedirects: 5,
        signal: controller.signal,
        headers: { Accept: accept, "User-Agent": config.requestUserAgent },
      });
      const { response } = result;
      if (!response.ok) {
        throw new Error(
          `${responseType === "image" ? "Image fetch" : "Fetch"} failed for ${result.url} (HTTP ${response.status})`
        );
      }
      if (responseType === "image") {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.startsWith("image/")) {
          throw new Error(`Expected image content type for ${result.url}, received "${contentType}"`);
        }
        return Buffer.from(await response.arrayBuffer());
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  const fetchHtml = (url) => request(url, { accept: "text/html,application/xhtml+xml", responseType: "html" });
  const fetchImageBuffer = (url) => request(url, { accept: "image/*", responseType: "image" });

  async function fetchPlugins() {
    const firstPageHtml = await fetchHtml(profilePageUrl(config.openplanetProfileUrl, 1));
    const pageCount = parseTotalPages(firstPageHtml, { maxPages: config.openplanetMaxPages });
    const pages = [{ pageNumber: 1, html: firstPageHtml }];

    if (pageCount > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, async (_unused, index) => {
          const pageNumber = index + 2;
          return {
            pageNumber,
            html: await fetchHtml(profilePageUrl(config.openplanetProfileUrl, pageNumber)),
          };
        })
      );
      remainingPages.sort((left, right) => left.pageNumber - right.pageNumber);
      pages.push(...remainingPages);
    }

    const pluginsById = new Map();
    for (const page of pages) {
      const plugins = parsePluginCards(page.html, page.pageNumber, config);
      for (const plugin of plugins) {
        if (!pluginsById.has(plugin.id)) pluginsById.set(plugin.id, plugin);
        if (pluginsById.size >= config.openplanetMaxPlugins) break;
      }
      if (pluginsById.size >= config.openplanetMaxPlugins) break;
    }

    const plugins = [...pluginsById.values()];
    if (!plugins.length) throw new Error("No plugins could be parsed from Openplanet profile HTML.");
    return { plugins, pageCount };
  }

  return { fetchHtml, fetchImageBuffer, fetchPlugins };
}
