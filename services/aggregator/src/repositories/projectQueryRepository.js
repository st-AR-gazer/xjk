import { EventQueryRepository } from "./projectQuery/eventQueryRepository.js";
import { ProjectReadRepository } from "./projectQuery/projectReadRepository.js";
import { WrBaselineQueryRepository } from "./projectQuery/wrBaselineQueryRepository.js";

class ProjectQueryRepository {
  constructor(db) {
    this.db = db;
    this.projectReadRepository = new ProjectReadRepository(db);
    this.eventQueryRepository = new EventQueryRepository(db);
    this.wrBaselineQueryRepository = new WrBaselineQueryRepository(db);
  }

  listProjects(...args) {
    return this.projectReadRepository.listProjects(...args);
  }

  listProjectInstances(...args) {
    return this.projectReadRepository.listProjectInstances(...args);
  }

  getProject(...args) {
    return this.projectReadRepository.getProject(...args);
  }

  getProjectMaps(...args) {
    return this.projectReadRepository.getProjectMaps(...args);
  }

  getMapProjects(...args) {
    return this.projectReadRepository.getMapProjects(...args);
  }

  getEventFacets(...args) {
    return this.eventQueryRepository.getEventFacets(...args);
  }

  getRecentEvents(...args) {
    return this.eventQueryRepository.getRecentEvents(...args);
  }

  getWrBaselineQueue(...args) {
    return this.wrBaselineQueryRepository.getWrBaselineQueue(...args);
  }
}

export { ProjectQueryRepository };
