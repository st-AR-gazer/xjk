function createClientRecipes({ publicBase, ingestBase, baseUrl, ingestUrl }) {
  return [
    {
      title: "Resolve account IDs to names",
      description:
        "Best for plugins and services that already know account IDs and want current display names from the shared cache.",
      endpoint: `${publicBase}/display-names`,
      example: `curl "${baseUrl}/display-names?accountId[]=01234567-89ab-cdef-0123-456789abcdef&limit=1"`,
    },
    {
      title: "Batch validate duplicate-name groups",
      description:
        "Best for ARL-style cleanup jobs that collect many account IDs from suspicious duplicate display-name groups and want one shared-cache check before falling back to Nadeo.",
      endpoint: `${publicBase}/display-names/resolve`,
      example: `curl -X POST "${baseUrl}/display-names/resolve" -H "Content-Type: application/json" -d "{\\"accountIds\\":[\\"01234567-89ab-cdef-0123-456789abcdef\\"],\\"maxAgeSeconds\\":15552000,\\"limit\\":50}"`,
    },
    {
      title: "Exact name to candidate account IDs",
      description:
        "Best for exact display-name lookups where the caller already has a specific player name, including names with spaces.",
      endpoint: `${publicBase}/display-names/by-name`,
      example: `curl "${baseUrl}/display-names/by-name?displayName[]=Foo%20Bar"`,
    },
    {
      title: "Partial or prefix-style name search",
      description: "Friendly search endpoint for client UIs that want prefix, contains, or fuzzy matching.",
      endpoint: `${publicBase}/display-names/search`,
      example: `curl "${baseUrl}/display-names/search?q=ar&mode=prefix&limit=20"`,
    },
    {
      title: "ARL authenticated display-name contribution",
      description:
        "Openplanet-backed ingest path for ARL-style plugins that share observed accountId/displayName pairs.",
      endpoint: `${ingestBase}/display-names/arl`,
      example: `curl -X POST "${ingestUrl}/display-names/arl" -H "Content-Type: application/json" -d "{\\"opToken\\":\\"<openplanet-token>\\",\\"projectKey\\":\\"arl-player-directory\\",\\"projectName\\":\\"Arbitrary Record Loader Player Directory\\",\\"sourceLabel\\":\\"arl-player-directory\\",\\"names\\":[{\\"accountId\\":\\"01234567-89ab-cdef-0123-456789abcdef\\",\\"displayName\\":\\"ar\\",\\"observedAt\\":\\"2026-04-20T12:00:00Z\\"}]}"`,
    },
  ];
}

export { createClientRecipes };
