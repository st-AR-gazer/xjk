import assert from "node:assert/strict";
import test from "node:test";

import { openConsoleHubDatabase } from "../src/database.js";
import { createConsoleRepository } from "../src/repository.js";

async function createRepositoryHarness() {
  const db = await openConsoleHubDatabase({ dbFile: ":memory:" });
  let timestamp = 1000;
  const settings = new Map();
  const repository = createConsoleRepository({
    auth: {
      getSetting(key, fallback) {
        return settings.has(key) ? settings.get(key) : fallback;
      },
    },
    config: {
      clubId: 42,
      serviceLogin: "",
      servicePassword: "",
      operatorAccessToken: "",
      operatorRefreshToken: "",
      bingoAuthSecret: "",
      bingoAllowDevKeyExchange: false,
    },
    db,
    directory: {
      directoryState: { ready: false },
      getDirectoryIdentity() {
        return null;
      },
    },
    displayNames: {
      aggregatorClient: { isConfigured: () => false },
      trackerDisplaynameClient: { isConfigured: () => false },
    },
    helpers: {
      jsonTryParse(value, fallback) {
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      },
      nowMs() {
        timestamp += 1;
        return timestamp;
      },
    },
    matchEvents: {
      buildClaimStatus(binding) {
        return { status: binding?.status || "missing" };
      },
      roomBindingPath(binding) {
        return JSON.parse(binding?.path_json || "[]");
      },
    },
  });
  return { db, repository, settings };
}

test("Console repository preserves its flat facade while delegating domain persistence", async (t) => {
  const { db, repository, settings } = await createRepositoryHarness();
  t.after(() => db.close());

  assert.deepEqual(Object.keys(repository), [
    "serializeRoomBindingForClient",
    "getRoomBinding",
    "getRoomBindingsForMatch",
    "deleteRoomBinding",
    "markRoomBindingStatus",
    "activeRoomBindingCountForMatch",
    "getPlayerBinding",
    "getPlayerBindingByJoinCode",
    "getPlayerBindingsForAccount",
    "deletePlayerBinding",
    "deletePlayerBindingByJoinCode",
    "deletePlayerBindingById",
    "getMatchBinding",
    "deleteMatchMirror",
    "getLatestMatchBindingByJoinCode",
    "getMatchStateMirror",
    "buildJoinedMatchPayload",
    "matchStateHasBoard",
    "findAccountTeamIdInTeams",
    "playerBindingRequiresTeamChoice",
    "upsertPlayerBinding",
    "upsertMatchBinding",
    "upsertRoomBinding",
    "insertClaimCheck",
    "buildReadiness",
  ]);

  const player = repository.upsertPlayerBinding({
    accountId: "account-one",
    matchUid: "match-one",
    joinCode: "JOIN",
    requiresTeamChoice: true,
  });
  assert.equal(repository.getPlayerBindingByJoinCode("account-one", "JOIN").binding_id, player.binding_id);
  assert.equal(repository.getPlayerBindingsForAccount("account-one").length, 1);
  assert.equal(repository.playerBindingRequiresTeamChoice(player), true);

  const roomSummary = { name: "Room", config: { public: true }, matchConfig: { mode: "bingo" } };
  const matchState = { uid: "match-one", phase: 1, cells: [{ cell_id: 0 }], config: { mode: "bingo" } };
  repository.upsertMatchBinding({ matchUid: "match-one", joinCode: "JOIN", roomSummary, matchState });
  assert.equal(repository.getMatchBinding("match-one").room_name, "Room");
  assert.deepEqual(repository.getMatchStateMirror("match-one"), matchState);
  assert.equal(repository.matchStateHasBoard(matchState), true);

  const room = repository.upsertRoomBinding({
    accountId: "account-one",
    matchUid: "match-one",
    joinCode: "JOIN",
    matchSlug: "match",
    playerSlug: "player",
    roomActivityId: 12,
    roomName: "Console room",
    status: "idle",
    clubPath: ["Console", "Match", "Player"],
  });
  assert.equal(repository.activeRoomBindingCountForMatch("match-one"), 1);
  assert.deepEqual(repository.serializeRoomBindingForClient(room).clubPath, ["Console", "Match", "Player"]);
  repository.markRoomBindingStatus("account-one", "match-one", "ready");
  assert.equal(repository.getRoomBinding("account-one", "match-one").status, "ready");

  const payload = repository.buildJoinedMatchPayload({
    accountId: "account-one",
    matchUid: "match-one",
    roomSummary,
    matchState,
  });
  assert.equal(payload.roomBinding.roomActivityId, 12);
  assert.deepEqual(payload.claimStatus, { status: "ready" });
  assert.equal(
    repository.findAccountTeamIdInTeams(
      [{ base: { id: 7 }, members: [{ profile: { account_id: "account-one" } }] }],
      "account-one"
    ),
    7
  );

  repository.insertClaimCheck({ accountId: "account-one", matchUid: "match-one", status: "verified" });
  assert.equal(db.prepare("SELECT status FROM bingo_claim_checks").get().status, "verified");
  assert.equal(repository.buildReadiness().operatorReady, false);
  settings.set("operator_session", { accessToken: "token" });
  assert.equal(repository.buildReadiness().operatorReady, true);
});

test("match and mirror upserts roll back together when mirror persistence fails", async (t) => {
  const { db, repository } = await createRepositoryHarness();
  t.after(() => db.close());
  db.exec(`
    CREATE TRIGGER reject_match_mirror
    BEFORE INSERT ON bingo_match_state_mirror
    WHEN NEW.match_uid = 'rollback-match'
    BEGIN
      SELECT RAISE(ABORT, 'mirror write rejected');
    END;
  `);

  assert.throws(
    () =>
      repository.upsertMatchBinding({
        matchUid: "rollback-match",
        joinCode: "JOIN",
        roomSummary: { name: "Must roll back" },
        matchState: { uid: "rollback-match", phase: 1, cells: [] },
      }),
    /mirror write rejected/
  );
  assert.equal(repository.getMatchBinding("rollback-match"), null);
  assert.equal(repository.getMatchStateMirror("rollback-match"), null);
});

test("match and mirror deletes roll back together when the binding delete fails", async (t) => {
  const { db, repository } = await createRepositoryHarness();
  t.after(() => db.close());
  repository.upsertMatchBinding({
    matchUid: "delete-match",
    joinCode: "JOIN",
    roomSummary: { name: "Retained" },
    matchState: { uid: "delete-match", phase: 1, cells: [] },
  });
  db.exec(`
    CREATE TRIGGER reject_match_delete
    BEFORE DELETE ON bingo_match_bindings
    WHEN OLD.match_uid = 'delete-match'
    BEGIN
      SELECT RAISE(ABORT, 'binding delete rejected');
    END;
  `);

  assert.throws(() => repository.deleteMatchMirror("delete-match"), /binding delete rejected/);
  assert.equal(repository.getMatchBinding("delete-match").room_name, "Retained");
  assert.equal(repository.getMatchStateMirror("delete-match").uid, "delete-match");
});
