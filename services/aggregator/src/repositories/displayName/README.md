# Display-name boundaries

`displayNameRepository.js` is the compatibility facade used by routes and the top-level aggregator repository. It
owns no SQL or ranking policy and keeps the existing public method names.

- `displayNameCommandRepository.js` owns display-name ingestion and the normalized-name data migration.
- `displayNameQueryRepository.js` owns current-name reads and name-search queries.
- `displayNameCandidateEvidenceRepository.js` reads raw candidate evidence only. It does not assign scores, decide
  staleness, or sort candidates.
- `displayNamePersistenceError.js` gives failed storage operations one typed, fail-closed error contract and provides
  the shared transaction boundary.
- `services/displayNameCandidatePlanner.js` contains the deterministic candidate scoring and staleness policy.
- `services/displayNameCandidateService.js` coordinates evidence loading, planning, and result pagination.

An empty result from a query means the database query completed successfully. Missing tables, incompatible schemas,
and other SQLite failures throw `DisplayNamePersistenceError`; callers must not present those failures as empty data.
