import { AlteredSnapshotRepository } from "./dashboard/alteredSnapshotRepository.js";
import { MetricsRepository } from "./dashboard/metricsRepository.js";
import { ProjectSnapshotRepository } from "./dashboard/projectSnapshotRepository.js";
import { TrackerSnapshotRepository } from "./dashboard/trackerSnapshotRepository.js";

class DashboardRepository {
  constructor(db, { trafficRepository, adminDataRepository } = {}) {
    this.db = db;
    this.trafficRepository = trafficRepository;
    this.adminDataRepository = adminDataRepository;

    this.projectRepository = new ProjectSnapshotRepository(db);
    this.trackerRepository = new TrackerSnapshotRepository(db, {
      projectRepository: this.projectRepository,
      trafficRepository,
    });
    this.alteredRepository = new AlteredSnapshotRepository(db);
    this.metricsRepository = new MetricsRepository(db, { adminDataRepository });
  }

  getPreferredProject(...args) {
    return this.projectRepository.getPreferredProject(...args);
  }

  getLatestProjectInstance(...args) {
    return this.projectRepository.getLatestProjectInstance(...args);
  }

  getLatestIngestRun(...args) {
    return this.projectRepository.getLatestIngestRun(...args);
  }

  getIngestRunTotals(...args) {
    return this.projectRepository.getIngestRunTotals(...args);
  }

  getProjectMapStats(...args) {
    return this.projectRepository.getProjectMapStats(...args);
  }

  buildDbTrackerEntry(...args) {
    return this.projectRepository.buildDbTrackerEntry(...args);
  }

  getDisplayNameTrackerSnapshot(...args) {
    return this.trackerRepository.getDisplayNameTrackerSnapshot(...args);
  }

  getClubTrackerSnapshot(...args) {
    return this.trackerRepository.getClubTrackerSnapshot(...args);
  }

  getTrackerStatusSnapshots(...args) {
    return this.trackerRepository.getTrackerStatusSnapshots(...args);
  }

  getNadeoGuardrailSnapshot(...args) {
    return this.trackerRepository.getNadeoGuardrailSnapshot(...args);
  }

  getAlteredDashboardSummary(...args) {
    return this.alteredRepository.getAlteredDashboardSummary(...args);
  }

  getAlteredCheckHistory(...args) {
    return this.alteredRepository.getAlteredCheckHistory(...args);
  }

  getMetricsOverview(...args) {
    return this.metricsRepository.getMetricsOverview(...args);
  }

  getMetricsTimeseries(...args) {
    return this.metricsRepository.getMetricsTimeseries(...args);
  }
}

export { DashboardRepository };
