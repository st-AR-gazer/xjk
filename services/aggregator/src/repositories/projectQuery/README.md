# Project query repositories

`projectQueryRepository.js` is the compatibility facade used by routes and the top-level aggregator repository. It owns no SQL and delegates to three read boundaries:

- `projectReadRepository.js` owns project summaries, instances, project maps, and reverse map-to-project lookups.
- `eventQueryRepository.js` owns event facets and the merged recent-event timeline.
- `wrBaselineQueryRepository.js` owns WR-baseline queue filtering, counts, and page clamping.

Keep query normalization beside the SQL that consumes it. New writes belong in the ingest or admin repositories, not in this read facade.
