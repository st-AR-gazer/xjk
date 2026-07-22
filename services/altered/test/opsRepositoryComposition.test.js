import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import * as opsModule from "../src/repositories/opsRepository.js";

const methodArities = {
  ensureDefaults: 0,
  listUserTypes: 0,
  getUser: 1,
  listUsers: 0,
  createUser: 0,
  addUserAddress: 1,
  listUserAddresses: 1,
  createSchedule: 1,
  listSchedules: 0,
  getSchedule: 1,
  updateScheduleRuntime: 1,
  listDueSchedules: 0,
  markScheduleRunComplete: 1,
  upsertMonitoredMap: 1,
  getMonitoredMap: 1,
  listMonitoredMaps: 0,
  updateMonitoredMapState: 1,
  createMapPollRun: 1,
  finishMapPollRun: 1,
  recordMapPollEvent: 1,
  listMapPollRuns: 0,
  listMapPollEvents: 0,
  getDiscordBotConfig: 0,
  updateDiscordBotConfig: 0,
  enqueueDiscordCommand: 1,
  listDiscordCommands: 0,
  updateDiscordCommandStatus: 1,
  getCounts: 0,
};

test("OpsRepository preserves its facade contract, arities, collaborators, and live db reference", () => {
  assert.deepEqual(Object.keys(opsModule), ["OpsRepository"]);
  assert.equal(opsModule.OpsRepository.length, 1);
  const methods = Object.getOwnPropertyNames(opsModule.OpsRepository.prototype)
    .filter((name) => name !== "constructor")
    .sort();
  assert.deepEqual(methods, Object.keys(methodArities).sort());
  for (const [method, arity] of Object.entries(methodArities)) {
    assert.equal(opsModule.OpsRepository.prototype[method].length, arity, `${method} arity drifted`);
  }

  const initialDb = { name: "initial" };
  const replacementDb = { name: "replacement" };
  const repository = new opsModule.OpsRepository(initialDb);
  assert.equal(repository.db, initialDb);
  repository.db = replacementDb;
  for (const domain of ["userAddressRepository", "scheduleRepository", "monitoringRepository", "discordRepository"]) {
    assert.equal(repository[domain].db, replacementDb);
  }
});

test("ensureDefaults and getCounts preserve cross-domain statement ordering", () => {
  const events = [];
  const countByTable = {
    users: 1,
    user_schedules: 2,
    monitored_maps: 3,
    user_schedule_runtime: 4,
    discord_bot_commands: 5,
  };
  const db = {
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      events.push(["prepare", normalized]);
      return {
        all: () => [],
        run(...args) {
          events.push(["run", ...args]);
          return {};
        },
        get() {
          const table = Object.keys(countByTable).find((name) => normalized.includes(`FROM ${name}`));
          return { count: countByTable[table] || 0 };
        },
      };
    },
  };
  const repository = new opsModule.OpsRepository(db);

  repository.ensureDefaults();
  assert.match(events[0][1], /INSERT OR IGNORE INTO user_types/);
  assert.deepEqual(events.filter(([type]) => type === "run").slice(0, 3), [
    ["run", "admin"],
    ["run", "operator"],
    ["run", "viewer"],
  ]);
  assert.match(events[4][1], /INSERT OR IGNORE INTO discord_bot_config/);

  events.length = 0;
  assert.deepEqual(repository.getCounts(), {
    users: 1,
    schedules: 2,
    monitoredMaps: 3,
    dueSchedules: 4,
    queuedBotCommands: 5,
  });
  assert.deepEqual(
    events.map(([, sql]) => Object.keys(countByTable).find((name) => sql.includes(`FROM ${name}`))),
    ["users", "user_schedules", "monitored_maps", "user_schedule_runtime", "discord_bot_commands"]
  );
});

test("OpsRepository composes each domain end to end with in-memory sqlite", () => {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    const repository = new opsModule.OpsRepository(db);
    repository.ensureDefaults();
    repository.ensureDefaults();

    assert.deepEqual(
      repository.listUserTypes().map(({ type }) => type),
      ["admin", "operator", "viewer"]
    );
    assert.equal(repository.getDiscordBotConfig().botName, "altered-bot");

    const createdUser = repository.createUser({
      userTypeId: 1,
      email: "ops@example.com",
      password: "secret",
      loggedIn: true,
      tokenExpiration: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(createdUser.user.email, "ops@example.com");
    assert.equal(createdUser.user.password, "secret");
    const userId = createdUser.user.id;
    const address = repository.addUserAddress({ userId, title: "Primary" });
    assert.ok(address.addressId > 0);
    assert.equal(repository.listUserAddresses(userId)[0].title, "Primary");

    const { scheduleId } = repository.createSchedule({
      userId,
      goal: "Poll maps",
      intervalHours: 2,
    });
    assert.equal(repository.getSchedule(scheduleId).goal, "Poll maps");
    repository.updateScheduleRuntime({
      scheduleId,
      enabled: true,
      intervalHours: 2,
      nextRunAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(repository.listDueSchedules({ nowIso: "2026-01-01T00:00:00.000Z" }).length, 1);

    const monitored = repository.upsertMonitoredMap({
      userId,
      mapUid: "map-uid",
      mapName: "Map Name",
    });
    assert.equal(monitored.map.mapName, "Map Name");
    const checkedAt = "2026-01-01T01:00:00.000Z";
    assert.equal(
      repository.updateMonitoredMapState({
        userId,
        mapUid: "map-uid",
        lastWrMs: 1234,
        lastWrHolder: "Player",
        lastCheckedAt: checkedAt,
      }).lastWrHolder,
      "Player"
    );

    const runId = repository.createMapPollRun({ scheduleId, userId, mapsTotal: 1 });
    repository.recordMapPollEvent({
      runId,
      scheduleId,
      userId,
      mapUid: "map-uid",
      mapName: "Map Name",
      checkedAt,
      changed: true,
      oldWrMs: 1300,
      newWrMs: 1234,
      oldWrHolder: "Old",
      newWrHolder: "Player",
    });
    repository.finishMapPollRun({ runId, mapsChecked: 1, mapsChanged: 1, note: "done" });
    assert.equal(repository.listMapPollRuns()[0].status, "ok");
    assert.equal(repository.listMapPollEvents({ mapUid: "map-uid" })[0].changed, true);

    const config = repository.updateDiscordBotConfig({
      enabled: true,
      botName: "ops-bot",
      channelId: "channel",
    });
    assert.equal(config.botName, "ops-bot");
    const { commandId } = repository.enqueueDiscordCommand({
      commandType: "announce",
      payload: { mapUid: "map-uid" },
    });
    assert.deepEqual(repository.listDiscordCommands()[0].payload, { mapUid: "map-uid" });

    assert.deepEqual(repository.getCounts(), {
      users: 1,
      schedules: 1,
      monitoredMaps: 1,
      dueSchedules: 1,
      queuedBotCommands: 1,
    });

    assert.equal(repository.updateDiscordCommandStatus({ commandId, status: "sent" }).status, "sent");
    const completed = repository.markScheduleRunComplete({
      scheduleId,
      ranAt: "2026-01-01T01:00:00.000Z",
      intervalHours: 2,
    });
    assert.equal(completed.nextRunAt, "2026-01-01T03:00:00.000Z");
  } finally {
    db.close();
  }
});
