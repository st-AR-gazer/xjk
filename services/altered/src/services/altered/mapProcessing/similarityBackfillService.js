import {
  buildManagedProcessIdentity,
  isProcessAlive,
  killProcessTree,
  managedProcessIdentityMatches,
  readProcessIdentity,
} from "../serviceSupport.js";
import {
  buildNamingSimilaritySummaryFromExternalProgress,
  createNamingSimilarityBackfillState,
  getNamingSimilarityBackfillStatus,
  updateNamingSimilarityBackfillProgress,
} from "./similarityBackfill/backfillState.js";
import {
  cancelNamingSimilarityBackfill,
  clearNamingSimilarityBackfillExternalArtifacts,
  launchExternalNamingSimilarityBackfill,
  readNamingSimilarityBackfillExternalProgress,
  recoverNamingSimilarityBackfillExternalState,
  refreshNamingSimilarityBackfillExternalState,
} from "./similarityBackfill/externalWorkerLifecycle.js";
import { startNamingSimilarityBackfill } from "./similarityBackfill/internalBackfillRunner.js";
import {
  buildNamingSimilarityBackfillTargets,
  shouldUseExternalNamingSimilarityBackfill,
} from "./similarityBackfill/targetPlanning.js";

class SimilarityBackfillService {
  constructor({
    repository,
    logger = console,
    getMapLocalFileService,
    getMapNameWorkspaceService,
    processRuntime = {},
  }) {
    this.repository = repository;
    this.logger = logger;
    this.getMapLocalFileService = getMapLocalFileService;
    this.getMapNameWorkspaceService = getMapNameWorkspaceService;
    this.processRuntime = {
      isProcessAlive: processRuntime.isProcessAlive || isProcessAlive,
      killProcessTree: processRuntime.killProcessTree || killProcessTree,
      readProcessIdentity: processRuntime.readProcessIdentity || readProcessIdentity,
      buildManagedProcessIdentity: processRuntime.buildManagedProcessIdentity || buildManagedProcessIdentity,
      managedProcessIdentityMatches: processRuntime.managedProcessIdentityMatches || managedProcessIdentityMatches,
    };
    this.namingSimilarityBackfill = createNamingSimilarityBackfillState(this.mapCopy.dataDir);
  }

  get mapCopy() {
    return this.getMapLocalFileService().mapCopy;
  }

  buildNamingSimilarityBackfillTargets(options = {}) {
    return buildNamingSimilarityBackfillTargets(this, options);
  }

  shouldUseExternalNamingSimilarityBackfill(options = {}) {
    return shouldUseExternalNamingSimilarityBackfill(this, options);
  }

  buildNamingSimilaritySummaryFromExternalProgress(progress = null) {
    return buildNamingSimilaritySummaryFromExternalProgress(this, progress);
  }

  readNamingSimilarityBackfillExternalProgress() {
    return readNamingSimilarityBackfillExternalProgress(this);
  }

  clearNamingSimilarityBackfillExternalArtifacts(options = {}) {
    return clearNamingSimilarityBackfillExternalArtifacts(this, options);
  }

  recoverNamingSimilarityBackfillExternalState() {
    return recoverNamingSimilarityBackfillExternalState(this);
  }

  refreshNamingSimilarityBackfillExternalState() {
    return refreshNamingSimilarityBackfillExternalState(this);
  }

  launchExternalNamingSimilarityBackfill(options = {}) {
    return launchExternalNamingSimilarityBackfill(this, options);
  }

  getNamingSimilarityBackfillStatus() {
    return getNamingSimilarityBackfillStatus(this);
  }

  cancelNamingSimilarityBackfill(options = {}) {
    return cancelNamingSimilarityBackfill(this, options);
  }

  updateNamingSimilarityBackfillProgress(partial = {}) {
    return updateNamingSimilarityBackfillProgress(this, partial);
  }

  startNamingSimilarityBackfill(options = {}) {
    return startNamingSimilarityBackfill(this, options);
  }
}

export { SimilarityBackfillService };
