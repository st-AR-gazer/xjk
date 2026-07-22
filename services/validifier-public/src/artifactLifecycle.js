import fs from "node:fs";
import { validateLookupValue } from "./requestValidation.js";
import { createRequestError } from "./uploadService.js";

export function createArtifactLifecycle({ repository, logger = console, fileSystem = fs, now = Date.now } = {}) {
  if (!repository) throw new Error("repository is required for artifact lifecycle management.");

  function collectExpiredArtifacts() {
    repository.gcExpiredSubmissions();
    const stale = repository.listExpiredArtifacts();
    let removed = 0;
    for (const row of stale) {
      try {
        if (row?.storage_path && fileSystem.existsSync(row.storage_path)) {
          fileSystem.unlinkSync(row.storage_path);
        }
        if (repository.deleteExpiredArtifact(row.artifact_ref, row.storage_path)) {
          removed += 1;
        }
      } catch (error) {
        logger.warn(
          "[validifier-public] failed to delete expired artifact:",
          row?.storage_path,
          error?.message || error
        );
      }
    }
    repository.pruneUploadQuotaUsage?.();
    return removed;
  }

  function requireArtifact(artifactRef, expectedKind, label) {
    const artifact = repository.findArtifactByRef(validateLookupValue(artifactRef, label));
    if (
      !artifact ||
      artifact.kind !== expectedKind ||
      !artifact.storage_path ||
      !fileSystem.existsSync(artifact.storage_path)
    ) {
      throw createRequestError(`${label} did not resolve to a valid ${expectedKind} upload.`);
    }
    if (!artifact.expires_at || Date.parse(artifact.expires_at) <= now()) {
      throw createRequestError(`${label} is expired and must be uploaded again.`);
    }
    return artifact;
  }

  return { collectExpiredArtifacts, requireArtifact };
}

export function startArtifactCollection(lifecycle, { intervalMs = 60 * 60 * 1000 } = {}) {
  lifecycle.collectExpiredArtifacts();
  const timer = setInterval(() => lifecycle.collectExpiredArtifacts(), intervalMs);
  timer.unref?.();
  return timer;
}
