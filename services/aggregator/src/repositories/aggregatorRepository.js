import { AdminDataRepository } from "./adminDataRepository.js";
import { ClubRepository } from "./clubRepository.js";
import { DashboardRepository } from "./dashboardRepository.js";
import { DisplayNameRepository } from "./displayNameRepository.js";
import { EventIngestRepository } from "./eventIngestRepository.js";
import { ProjectQueryRepository } from "./projectQueryRepository.js";
import { TrafficRepository } from "./trafficRepository.js";

class AggregatorRepository {
  constructor(db) {
    this.db = db;
    this.eventIngestRepository = new EventIngestRepository(db);
    this.trafficRepository = new TrafficRepository(db, {
      eventsRepository: this.eventIngestRepository,
    });
    this.adminDataRepository = new AdminDataRepository(db);
    this.dashboardRepository = new DashboardRepository(db, {
      trafficRepository: this.trafficRepository,
      adminDataRepository: this.adminDataRepository,
    });
    this.projectQueryRepository = new ProjectQueryRepository(db);
    this.displayNameRepository = new DisplayNameRepository(db, {
      eventsRepository: this.eventIngestRepository,
    });
    this.clubRepository = new ClubRepository(db, {
      eventsRepository: this.eventIngestRepository,
    });
  }

  bumpTrafficCacheVersion(...args) {
    return this.trafficRepository.bumpTrafficCacheVersion(...args);
  }

  withTrafficCache(...args) {
    return this.trafficRepository.withTrafficCache(...args);
  }

  insertTrafficSampleRecord(...args) {
    return this.trafficRepository.insertTrafficSampleRecord(...args);
  }

  backfillTrafficSamples(...args) {
    return this.trafficRepository.backfillTrafficSamples(...args);
  }

  getTrafficBackfillState(...args) {
    return this.trafficRepository.getTrafficBackfillState(...args);
  }

  listLegacyTrafficSamples(...args) {
    return this.trafficRepository.listLegacyTrafficSamples(...args);
  }

  ingestTraffic(...args) {
    return this.trafficRepository.ingestTraffic(...args);
  }

  listTrafficSamples(...args) {
    return this.trafficRepository.listTrafficSamples(...args);
  }

  getTrafficFacets(...args) {
    return this.trafficRepository.getTrafficFacets(...args);
  }

  getLatestObservedTrafficWindowMeta(...args) {
    return this.trafficRepository.getLatestObservedTrafficWindowMeta(...args);
  }

  getTrafficOverview(...args) {
    return this.trafficRepository.getTrafficOverview(...args);
  }

  getTrafficTimeseries(...args) {
    return this.trafficRepository.getTrafficTimeseries(...args);
  }

  getTrafficTop(...args) {
    return this.trafficRepository.getTrafficTop(...args);
  }

  getTrafficErrors(...args) {
    return this.trafficRepository.getTrafficErrors(...args);
  }

  upsertProjectSeen(...args) {
    return this.eventIngestRepository.upsertProjectSeen(...args);
  }

  appendAggregatorEvent(...args) {
    return this.eventIngestRepository.appendAggregatorEvent(...args);
  }

  ingestEvents(...args) {
    return this.eventIngestRepository.ingestEvents(...args);
  }

  ingestTrackerRun(...args) {
    return this.eventIngestRepository.ingestTrackerRun(...args);
  }

  registerInstance(...args) {
    return this.eventIngestRepository.registerInstance(...args);
  }

  heartbeatInstance(...args) {
    return this.eventIngestRepository.heartbeatInstance(...args);
  }

  getMeta(...args) {
    return this.adminDataRepository.getMeta(...args);
  }

  listDataTables(...args) {
    return this.adminDataRepository.listDataTables(...args);
  }

  getTableSchema(...args) {
    return this.adminDataRepository.getTableSchema(...args);
  }

  getTableRows(...args) {
    return this.adminDataRepository.getTableRows(...args);
  }

  getPreferredProject(...args) {
    return this.dashboardRepository.getPreferredProject(...args);
  }

  getLatestProjectInstance(...args) {
    return this.dashboardRepository.getLatestProjectInstance(...args);
  }

  getLatestIngestRun(...args) {
    return this.dashboardRepository.getLatestIngestRun(...args);
  }

  getIngestRunTotals(...args) {
    return this.dashboardRepository.getIngestRunTotals(...args);
  }

  getProjectMapStats(...args) {
    return this.dashboardRepository.getProjectMapStats(...args);
  }

  buildDbTrackerEntry(...args) {
    return this.dashboardRepository.buildDbTrackerEntry(...args);
  }

  getDisplayNameTrackerSnapshot(...args) {
    return this.dashboardRepository.getDisplayNameTrackerSnapshot(...args);
  }

  getClubTrackerSnapshot(...args) {
    return this.dashboardRepository.getClubTrackerSnapshot(...args);
  }

  getTrackerStatusSnapshots(...args) {
    return this.dashboardRepository.getTrackerStatusSnapshots(...args);
  }

  getNadeoGuardrailSnapshot(...args) {
    return this.dashboardRepository.getNadeoGuardrailSnapshot(...args);
  }

  getAlteredDashboardSummary(...args) {
    return this.dashboardRepository.getAlteredDashboardSummary(...args);
  }

  getAlteredCheckHistory(...args) {
    return this.dashboardRepository.getAlteredCheckHistory(...args);
  }

  getMetricsOverview(...args) {
    return this.dashboardRepository.getMetricsOverview(...args);
  }

  getMetricsTimeseries(...args) {
    return this.dashboardRepository.getMetricsTimeseries(...args);
  }

  listProjects(...args) {
    return this.projectQueryRepository.listProjects(...args);
  }

  listProjectInstances(...args) {
    return this.projectQueryRepository.listProjectInstances(...args);
  }

  getProject(...args) {
    return this.projectQueryRepository.getProject(...args);
  }

  getProjectMaps(...args) {
    return this.projectQueryRepository.getProjectMaps(...args);
  }

  getMapProjects(...args) {
    return this.projectQueryRepository.getMapProjects(...args);
  }

  getEventFacets(...args) {
    return this.projectQueryRepository.getEventFacets(...args);
  }

  getWrBaselineQueue(...args) {
    return this.projectQueryRepository.getWrBaselineQueue(...args);
  }

  getRecentEvents(...args) {
    return this.projectQueryRepository.getRecentEvents(...args);
  }

  backfillNormalizedDisplayNames(...args) {
    return this.displayNameRepository.backfillNormalizedDisplayNames(...args);
  }

  getDisplayNamesByName(...args) {
    return this.displayNameRepository.getDisplayNamesByName(...args);
  }

  ingestDisplayNames(...args) {
    return this.displayNameRepository.ingestDisplayNames(...args);
  }

  getDisplayNames(...args) {
    return this.displayNameRepository.getDisplayNames(...args);
  }

  searchDisplayNames(...args) {
    return this.displayNameRepository.searchDisplayNames(...args);
  }

  collectDisplayNameCandidates(...args) {
    return this.displayNameRepository.collectDisplayNameCandidates(...args);
  }

  listDisplayNameCandidateDetails(...args) {
    return this.displayNameRepository.listDisplayNameCandidateDetails(...args);
  }

  listDisplayNameCandidates(...args) {
    return this.displayNameRepository.listDisplayNameCandidates(...args);
  }

  ingestClubSnapshot(...args) {
    return this.clubRepository.ingestClubSnapshot(...args);
  }

  getClubSummary(...args) {
    return this.clubRepository.getClubSummary(...args);
  }

  getClubCampaigns(...args) {
    return this.clubRepository.getClubCampaigns(...args);
  }

  getClubMembers(...args) {
    return this.clubRepository.getClubMembers(...args);
  }

  getClubMaps(...args) {
    return this.clubRepository.getClubMaps(...args);
  }
}

export { AggregatorRepository };
