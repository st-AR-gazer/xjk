import { TrafficAnalyticsRepository } from "./traffic/trafficAnalyticsRepository.js";
import { TrafficIngestionRepository } from "./traffic/trafficIngestionRepository.js";
import { TrafficQueryRepository } from "./traffic/trafficQueryRepository.js";
import { TrafficRepositorySupport } from "./traffic/trafficRepositorySupport.js";

class TrafficRepository {
  constructor(db, { eventsRepository } = {}) {
    this.db = db;
    this.eventsRepository = eventsRepository;
    this.supportRepository = new TrafficRepositorySupport(db);
    this.ingestionRepository = new TrafficIngestionRepository(db, {
      eventsRepository,
      support: this.supportRepository,
    });
    this.queryRepository = new TrafficQueryRepository(db, {
      support: this.supportRepository,
    });
    this.analyticsRepository = new TrafficAnalyticsRepository(db, {
      support: this.supportRepository,
    });
  }

  bumpTrafficCacheVersion() {
    return this.supportRepository.bumpTrafficCacheVersion();
  }

  withTrafficCache(cacheKey, compute, options = {}) {
    return this.supportRepository.withTrafficCache(cacheKey, compute, options);
  }

  insertTrafficSampleRecord(eventId, sample = {}) {
    return this.ingestionRepository.insertTrafficSampleRecord(eventId, sample);
  }

  backfillTrafficSamples(options = {}) {
    return this.ingestionRepository.backfillTrafficSamples(options);
  }

  getTrafficBackfillState(options = {}) {
    return this.supportRepository.getTrafficBackfillState(options);
  }

  listLegacyTrafficSamples(options = {}) {
    return this.queryRepository.listLegacyTrafficSamples(options);
  }

  ingestTraffic(payload = {}) {
    return this.ingestionRepository.ingestTraffic(payload);
  }

  listTrafficSamples(options = {}) {
    return this.queryRepository.listTrafficSamples(options);
  }

  getTrafficFacets(options = {}) {
    return this.queryRepository.getTrafficFacets(options);
  }

  getLatestObservedTrafficWindowMeta(options = {}) {
    return this.queryRepository.getLatestObservedTrafficWindowMeta(options);
  }

  getTrafficOverview(options = {}) {
    return this.analyticsRepository.getTrafficOverview(options);
  }

  getTrafficTimeseries(options = {}) {
    return this.analyticsRepository.getTrafficTimeseries(options);
  }

  getTrafficTop(options = {}) {
    return this.analyticsRepository.getTrafficTop(options);
  }

  getTrafficErrors(options = {}) {
    return this.analyticsRepository.getTrafficErrors(options);
  }
}

export { TrafficRepository };
