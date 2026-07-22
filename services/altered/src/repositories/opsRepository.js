import { OpsDiscordRepository } from "./ops/discordRepository.js";
import { OpsMonitoringRepository } from "./ops/monitoringRepository.js";
import { OpsScheduleRepository } from "./ops/scheduleRepository.js";
import { OpsUserAddressRepository } from "./ops/userAddressRepository.js";

function bindFacadeDatabase(repository, facade) {
  Object.defineProperty(repository, "db", {
    configurable: true,
    enumerable: true,
    get: () => facade.db,
  });
  return repository;
}

class OpsRepository {
  constructor(db) {
    this.db = db;
    this.userAddressRepository = bindFacadeDatabase(new OpsUserAddressRepository(db), this);
    this.scheduleRepository = bindFacadeDatabase(new OpsScheduleRepository(db, this.userAddressRepository), this);
    this.monitoringRepository = bindFacadeDatabase(new OpsMonitoringRepository(db, this.userAddressRepository), this);
    this.discordRepository = bindFacadeDatabase(new OpsDiscordRepository(db), this);
  }

  ensureDefaults() {
    const now = new Date().toISOString();
    this.userAddressRepository.ensureDefaultUserTypes();
    this.discordRepository.ensureDefaultConfig(now);
  }

  listUserTypes() {
    return this.userAddressRepository.listUserTypes();
  }

  getUser(userId) {
    return this.userAddressRepository.getUser(userId);
  }

  listUsers(options = {}) {
    return this.userAddressRepository.listUsers(options);
  }

  createUser(payload = {}) {
    return this.userAddressRepository.createUser(payload);
  }

  addUserAddress(payload) {
    return this.userAddressRepository.addUserAddress(payload);
  }

  listUserAddresses(userId, options = {}) {
    return this.userAddressRepository.listUserAddresses(userId, options);
  }

  createSchedule(payload) {
    return this.scheduleRepository.createSchedule(payload);
  }

  listSchedules(options = {}) {
    return this.scheduleRepository.listSchedules(options);
  }

  getSchedule(scheduleId) {
    return this.scheduleRepository.getSchedule(scheduleId);
  }

  updateScheduleRuntime(payload) {
    return this.scheduleRepository.updateScheduleRuntime(payload);
  }

  listDueSchedules(options = {}) {
    return this.scheduleRepository.listDueSchedules(options);
  }

  markScheduleRunComplete(payload) {
    return this.scheduleRepository.markScheduleRunComplete(payload);
  }

  upsertMonitoredMap(payload) {
    return this.monitoringRepository.upsertMonitoredMap(payload);
  }

  getMonitoredMap(payload) {
    return this.monitoringRepository.getMonitoredMap(payload);
  }

  listMonitoredMaps(options = {}) {
    return this.monitoringRepository.listMonitoredMaps(options);
  }

  updateMonitoredMapState(payload) {
    return this.monitoringRepository.updateMonitoredMapState(payload);
  }

  createMapPollRun(payload) {
    return this.monitoringRepository.createMapPollRun(payload);
  }

  finishMapPollRun(payload) {
    return this.monitoringRepository.finishMapPollRun(payload);
  }

  recordMapPollEvent(payload) {
    return this.monitoringRepository.recordMapPollEvent(payload);
  }

  listMapPollRuns(options = {}) {
    return this.monitoringRepository.listMapPollRuns(options);
  }

  listMapPollEvents(options = {}) {
    return this.monitoringRepository.listMapPollEvents(options);
  }

  getDiscordBotConfig() {
    return this.discordRepository.getDiscordBotConfig();
  }

  updateDiscordBotConfig(payload = {}) {
    return this.discordRepository.updateDiscordBotConfig(payload);
  }

  enqueueDiscordCommand(payload) {
    return this.discordRepository.enqueueDiscordCommand(payload);
  }

  listDiscordCommands(options = {}) {
    return this.discordRepository.listDiscordCommands(options);
  }

  updateDiscordCommandStatus(payload) {
    return this.discordRepository.updateDiscordCommandStatus(payload);
  }

  getCounts() {
    const users = this.userAddressRepository.countUsers();
    const schedules = this.scheduleRepository.countSchedules();
    const monitoredMaps = this.monitoringRepository.countMonitoredMaps();
    const dueSchedules = this.scheduleRepository.countDueSchedules(new Date().toISOString());
    const queuedBotCommands = this.discordRepository.countQueuedCommands();
    return {
      users,
      schedules,
      monitoredMaps,
      dueSchedules,
      queuedBotCommands,
    };
  }
}

export { OpsRepository };
