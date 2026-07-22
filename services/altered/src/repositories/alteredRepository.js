import { AlteredActivityRepository } from "./alteredActivityRepository.js";
import { AlteredAdminRepository } from "./alteredAdminRepository.js";
import { AlteredCampaignRepository } from "./alteredCampaignRepository.js";
import { AlteredCatalogRepository } from "./alteredCatalogRepository.js";
import { AlteredConfigurationRepository } from "./alteredConfigurationRepository.js";
import { AlteredIngestionRepository } from "./alteredIngestionRepository.js";
import { AlteredLeaderboardRepository } from "./alteredLeaderboardRepository.js";
import { AlteredMapFileRepository } from "./alteredMapFileRepository.js";
import { AlteredMapRepository } from "./alteredMapRepository.js";
import { AlteredMapperRepository } from "./alteredMapperRepository.js";
import { AlteredMonitoringRepository } from "./alteredMonitoringRepository.js";
import { AlteredNamingRepository } from "./alteredNamingRepository.js";

class AlteredRepository {
  constructor(db) {
    this.db = db;
    this.activity = new AlteredActivityRepository(db);
    this.admin = new AlteredAdminRepository(db);
    this.configuration = new AlteredConfigurationRepository(db);
    this.catalog = new AlteredCatalogRepository(db);
    this.leaderboard = new AlteredLeaderboardRepository(db);
    this.maps = new AlteredMapRepository(db);
    this.naming = new AlteredNamingRepository(db);
    this.mapFiles = new AlteredMapFileRepository(db);
    this.mappers = new AlteredMapperRepository(db);
    this.campaigns = new AlteredCampaignRepository({
      db,
      catalogRepository: this.catalog,
      configurationRepository: this.configuration,
      mapRepository: this.maps,
    });
    this.monitoring = new AlteredMonitoringRepository({
      db,
      configurationRepository: this.configuration,
    });
    this.ingestion = new AlteredIngestionRepository({
      db,
      campaignRepository: this.campaigns,
      configurationRepository: this.configuration,
      monitoringRepository: this.monitoring,
    });
  }
}

export { AlteredRepository };
