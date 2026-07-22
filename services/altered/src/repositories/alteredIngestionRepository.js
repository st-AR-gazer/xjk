import { ingestHookSnapshot } from "./alteredIngestion/hookSnapshot.js";
import { ingestProjectSourceSnapshot } from "./alteredIngestion/projectSourceSnapshot.js";

class AlteredIngestionRepository {
  constructor({ db, campaignRepository, configurationRepository, monitoringRepository }) {
    this.db = db;
    this.campaignRepository = campaignRepository;
    this.configurationRepository = configurationRepository;
    this.monitoringRepository = monitoringRepository;
  }

  ingestProjectSourceSnapshot(options = {}) {
    return ingestProjectSourceSnapshot(this, options);
  }

  ingestHookSnapshot(options = {}) {
    return ingestHookSnapshot(this, options);
  }
}

export { AlteredIngestionRepository };
