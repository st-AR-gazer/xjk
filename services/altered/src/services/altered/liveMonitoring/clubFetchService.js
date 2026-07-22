import { ClubActivityStage } from "./clubActivityStage.js";
import { ClubContentDiscoveryPipeline } from "./clubContentDiscoveryPipeline.js";
import { ClubStructureFetchService } from "./clubStructureFetchService.js";
import { LiveAuthenticationStage } from "./liveAuthenticationStage.js";

class ClubFetchService {
  constructor({ repository, liveClient, liveMonitor, contentDiscoveryPipeline = null }) {
    this.authenticationStage = new LiveAuthenticationStage({ liveClient, liveMonitor });
    this.activityStage = new ClubActivityStage();
    this.contentDiscoveryPipeline = contentDiscoveryPipeline || new ClubContentDiscoveryPipeline();
    this.structureFetchService = new ClubStructureFetchService({
      repository,
      authenticationStage: this.authenticationStage,
      activityStage: this.activityStage,
      contentDiscoveryPipeline: this.contentDiscoveryPipeline,
    });
  }

  resolveLiveClient(...args) {
    return this.authenticationStage.resolveLiveClient(...args);
  }

  resolveCoreMapClient(...args) {
    return this.authenticationStage.resolveCoreMapClient(...args);
  }

  resolveLiveOptions(...args) {
    return this.authenticationStage.resolveLiveOptions(...args);
  }

  fetchAllClubActivities(...args) {
    return this.activityStage.fetchAllActivities(...args);
  }

  fetchAllClubMembers(...args) {
    return this.activityStage.fetchAllMembers(...args);
  }

  fetchAllClubUploadBuckets(...args) {
    return this.activityStage.fetchAllUploadBuckets(...args);
  }

  fetchLiveClubStructure(...args) {
    return this.structureFetchService.fetch(...args);
  }
}

export { ClubFetchService };
