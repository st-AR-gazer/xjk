export function createPluginService({
  config,
  openplanetClient,
  paletteService,
  now = Date.now,
  logger = console,
} = {}) {
  if (!config || !openplanetClient || !paletteService) {
    throw new Error("Plugin service config, Openplanet client, and palette service are required.");
  }

  let cache = {
    fetchedAt: "",
    expiresAt: 0,
    pageCount: 0,
    plugins: [],
  };
  let refreshInFlight = null;

  function payload(overrides = {}) {
    return {
      plugins: cache.plugins,
      fetchedAt: cache.fetchedAt,
      pageCount: cache.pageCount,
      cached: true,
      stale: false,
      warning: null,
      ...overrides,
    };
  }

  async function refreshPlugins() {
    if (refreshInFlight) return refreshInFlight;
    const refresh = (async () => {
      const fetched = await openplanetClient.fetchPlugins();
      const plugins = await paletteService.withImagePalettes(fetched.plugins);
      const refreshedAt = now();
      cache = {
        plugins,
        pageCount: fetched.pageCount,
        fetchedAt: new Date(refreshedAt).toISOString(),
        expiresAt: refreshedAt + config.pluginsCacheTtlMs,
      };
      return payload({ cached: false });
    })();
    refreshInFlight = refresh;

    try {
      return await refresh;
    } finally {
      if (refreshInFlight === refresh) refreshInFlight = null;
    }
  }

  async function getPlugins() {
    if (cache.plugins.length && now() < cache.expiresAt) return payload();
    try {
      return await refreshPlugins();
    } catch (error) {
      if (!cache.plugins.length) throw error;
      logger.warn?.("Openplanet fetch failed; returning stale cache:", error?.message || error);
      return payload({ stale: true, warning: error?.message || String(error) });
    }
  }

  return {
    get refreshPending() {
      return Boolean(refreshInFlight);
    },
    getPlugins,
    refreshPlugins,
  };
}
