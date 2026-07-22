import { planDisplayNameCandidates } from "./displayNameCandidatePlanner.js";

class DisplayNameCandidateService {
  constructor({ evidenceRepository, now = Date.now } = {}) {
    if (typeof evidenceRepository?.loadCandidateEvidence !== "function") {
      throw new TypeError("DisplayNameCandidateService requires a candidate evidence repository.");
    }
    if (typeof now !== "function") {
      throw new TypeError("DisplayNameCandidateService requires a clock function.");
    }
    this.evidenceRepository = evidenceRepository;
    this.now = now;
  }

  collectDisplayNameCandidates({ staleAfterSeconds = 86400 } = {}) {
    return planDisplayNameCandidates(this.evidenceRepository.loadCandidateEvidence(), {
      staleAfterSeconds,
      nowMs: this.now(),
    });
  }

  listDisplayNameCandidateDetails({ staleAfterSeconds = 86400, limit = 200, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const candidates = this.collectDisplayNameCandidates({ staleAfterSeconds });
    return {
      count: candidates.length,
      limit: safeLimit,
      offset: safeOffset,
      candidates: candidates.slice(safeOffset, safeOffset + safeLimit),
    };
  }

  listDisplayNameCandidates({ staleAfterSeconds = 86400, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
    return this.collectDisplayNameCandidates({ staleAfterSeconds })
      .slice(0, safeLimit)
      .map(({ accountId }) => accountId)
      .filter(Boolean);
  }
}

export { DisplayNameCandidateService };
