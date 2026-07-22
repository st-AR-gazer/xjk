import assert from "node:assert/strict";
import test from "node:test";

import { createDatabase } from "../src/db/index.js";
import { AlteredRepository } from "../src/repositories/alteredRepository.js";

test("admin repository delegation preserves users and sessions", () => {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    const repository = new AlteredRepository(db);
    const created = repository.admin.upsertAdminUser({
      subject: "test-subject",
      username: "test-user",
      displayName: "Test User",
      role: "owner",
    });

    assert.equal(created.adminUser.subject, "test-subject");
    assert.equal(repository.admin.countActiveAdminUsers(), 1);
    assert.equal(repository.admin.listAdminUsers().length, 1);

    const now = Date.now();
    assert.equal(
      repository.admin.upsertAdminSession({
        token: "test-session",
        record: {
          createdAt: now,
          expiresAt: now + 60_000,
          user: { adminUserId: created.adminUser.adminUserId, subject: "test-subject" },
        },
      }),
      true
    );
    assert.equal(repository.admin.getAdminSessionByToken("test-session").record.user.subject, "test-subject");
    assert.equal(repository.admin.deleteAdminSessionByToken("test-session"), 1);
  } finally {
    db.close();
  }
});

test("activity repository delegation preserves public events and requests", () => {
  const db = createDatabase({ filePath: ":memory:" });
  try {
    const repository = new AlteredRepository(db);
    const wrEvent = repository.activity.insertWrEvent({
      mapUid: "test-map",
      mapName: "Test Map",
      holder: "Test Holder",
      wrMs: 42_000,
    });
    assert.equal(repository.activity.getLatestWrEvent().eventId, wrEvent.eventId);
    assert.equal(repository.activity.getRecentWrEvents({ limit: 10 }).length, 1);

    const request = repository.activity.insertUpdateRequest({
      mapUid: "test-map",
      mapName: "Test Map",
      reason: "Refresh metadata",
    });
    assert.equal(repository.activity.getUpdateRequestById(request.requestId).status, "queued");
    assert.equal(
      repository.activity.updateUpdateRequestStatus({ requestId: request.requestId, status: "done" }).status,
      "done"
    );

    repository.activity.recordApiRequest({ endpointKey: "map", requestPath: "/api/maps/test-map" });
    assert.equal(repository.activity.getApiUsageSummary({ days: 1 }).totals.totalRequests, 1);
  } finally {
    db.close();
  }
});
