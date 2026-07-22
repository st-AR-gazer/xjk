import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createToolJobCapacity } from "../capacity.js";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function runIfAdmitted(capacity, clientKey, runner) {
  const lease = capacity.tryAcquire(clientKey);
  if (!lease) return false;
  try {
    await runner();
    return true;
  } finally {
    lease.release();
  }
}

test("tool capacity never invokes a runner above global or per-client limits and recovers", async () => {
  const capacity = createToolJobCapacity({ maxActiveJobs: 2, maxActiveJobsPerClient: 1 });
  const firstDone = deferred();
  const secondDone = deferred();
  let activeRunners = 0;
  let peakRunners = 0;
  let runnerInvocations = 0;

  const runner = (completion) => async () => {
    runnerInvocations += 1;
    activeRunners += 1;
    peakRunners = Math.max(peakRunners, activeRunners);
    await completion.promise;
    activeRunners -= 1;
  };

  const first = runIfAdmitted(capacity, "client-a", runner(firstDone));
  const second = runIfAdmitted(capacity, "client-b", runner(secondDone));
  const immediate = { promise: Promise.resolve() };
  assert.equal(await runIfAdmitted(capacity, "client-a", runner(immediate)), false);
  assert.equal(await runIfAdmitted(capacity, "client-c", runner(immediate)), false);
  assert.equal(runnerInvocations, 2);
  assert.equal(peakRunners, 2);

  firstDone.resolve();
  assert.equal(await first, true);

  const recoveredDone = deferred();
  const recovered = runIfAdmitted(capacity, "client-a", runner(recoveredDone));
  await Promise.resolve();
  assert.equal(runnerInvocations, 3);
  assert.equal(peakRunners, 2);

  recoveredDone.resolve();
  secondDone.resolve();
  assert.equal(await recovered, true);
  assert.equal(await second, true);
  assert.equal(capacity.getActiveJobs(), 0);
});

test("capacity middleware fails fast with retry guidance and releases on response completion", () => {
  const capacity = createToolJobCapacity({
    maxActiveJobs: 1,
    maxActiveJobsPerClient: 1,
    busyRetryAfterSeconds: 7,
  });

  const createResponse = () => {
    const response = new EventEmitter();
    response.headers = {};
    response.statusCode = 200;
    response.payload = null;
    response.setHeader = (name, value) => {
      response.headers[name] = value;
    };
    response.status = (statusCode) => {
      response.statusCode = statusCode;
      return response;
    };
    response.json = (payload) => {
      response.payload = payload;
      return response;
    };
    return response;
  };

  const acceptedResponse = createResponse();
  let nextCalls = 0;
  capacity.admit({ ip: "client-a" }, acceptedResponse, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);

  const rejectedResponse = createResponse();
  capacity.admit({ ip: "client-b" }, rejectedResponse, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
  assert.equal(rejectedResponse.statusCode, 503);
  assert.equal(rejectedResponse.headers["Retry-After"], "7");
  assert.equal(rejectedResponse.payload.code, "TOOL_CAPACITY_EXHAUSTED");

  acceptedResponse.emit("finish");
  assert.equal(capacity.getActiveJobs(), 0);
  const recoveredResponse = createResponse();
  capacity.admit({ ip: "client-b" }, recoveredResponse, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 2);
  recoveredResponse.emit("close");
  assert.equal(capacity.getActiveJobs(), 0);
});

test("retained leases stay active past the HTTP response until background work releases them", () => {
  const capacity = createToolJobCapacity({ maxActiveJobs: 1, maxActiveJobsPerClient: 1 });
  const response = new EventEmitter();
  response.setHeader = () => undefined;
  response.status = () => response;
  response.json = () => response;
  const request = { ip: "client-a" };

  capacity.admit(request, response, () => undefined);
  request.toolJobLease.retain();
  response.emit("finish");
  assert.equal(capacity.getActiveJobs(), 1);
  assert.equal(capacity.tryAcquire("client-b"), null);

  request.toolJobLease.release();
  assert.equal(capacity.getActiveJobs(), 0);
  assert.throws(() => request.toolJobLease.retain(), /Cannot retain a released/);
  const recovered = capacity.tryAcquire("client-b");
  assert.ok(recovered);
  recovered.release();
});
