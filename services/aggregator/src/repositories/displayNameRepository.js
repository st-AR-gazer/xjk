import { DisplayNameCandidateService } from "../services/displayNameCandidateService.js";
import { DisplayNameCandidateEvidenceRepository } from "./displayName/displayNameCandidateEvidenceRepository.js";
import { DisplayNameCommandRepository } from "./displayName/displayNameCommandRepository.js";
import { DisplayNameQueryRepository } from "./displayName/displayNameQueryRepository.js";

class DisplayNameRepository {
  constructor(db, { eventsRepository, now = Date.now } = {}) {
    this.db = db;
    this.eventsRepository = eventsRepository;
    this.commandRepository = new DisplayNameCommandRepository(db, { eventsRepository });
    this.queryRepository = new DisplayNameQueryRepository(db);
    this.candidateEvidenceRepository = new DisplayNameCandidateEvidenceRepository(db);
    this.candidateService = new DisplayNameCandidateService({
      evidenceRepository: this.candidateEvidenceRepository,
      now,
    });
  }

  backfillNormalizedDisplayNames(...args) {
    return this.commandRepository.backfillNormalizedDisplayNames(...args);
  }

  getDisplayNamesByName(...args) {
    return this.queryRepository.getDisplayNamesByName(...args);
  }

  ingestDisplayNames(...args) {
    return this.commandRepository.ingestDisplayNames(...args);
  }

  getDisplayNames(...args) {
    return this.queryRepository.getDisplayNames(...args);
  }

  searchDisplayNames(...args) {
    return this.queryRepository.searchDisplayNames(...args);
  }

  collectDisplayNameCandidates(...args) {
    return this.candidateService.collectDisplayNameCandidates(...args);
  }

  listDisplayNameCandidateDetails(...args) {
    return this.candidateService.listDisplayNameCandidateDetails(...args);
  }

  listDisplayNameCandidates(...args) {
    return this.candidateService.listDisplayNameCandidates(...args);
  }
}

export { DisplayNameRepository };
