import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { runJsonToolRequest, sendBufferDownload, sendFileDownload, sendJsonToolResult } from "../responses.js";

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.headersSent = false;
    this.statusCode = 200;
    this.body = undefined;
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  end(body) {
    this.body = body;
  }
}

function createStream() {
  const stream = new EventEmitter();
  stream.pipe = (response) => {
    stream.response = response;
  };
  return stream;
}

test("sendJsonToolResult preserves each tool's response contract", () => {
  const success = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  sendJsonToolResult({
    res: success,
    code: 0,
    outputText: '{"maps":2}',
    stdout: '{"ignored":true}',
    stderr: " warning \n",
    resultKey: "report",
  });
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.payload, {
    ok: true,
    toolExitCode: 0,
    report: { maps: 2 },
    stderr: "warning",
  });

  const failure = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  sendJsonToolResult({
    res: failure,
    code: 3,
    outputText: "not-json",
    stderr: "broken",
    processName: "Checker",
  });
  assert.equal(failure.statusCode, 500);
  assert.deepEqual(failure.payload, { error: "Checker failed with exit code 3.", stderr: "broken" });
});

test("runJsonToolRequest owns execution, response, error, and cleanup semantics", async () => {
  const responses = [];
  const res = {
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      responses.push({ statusCode: this.statusCode, payload });
      return this;
    },
  };
  let cleanupCalls = 0;

  await runJsonToolRequest({
    res,
    run: async () => ({ code: 0, stdout: "", stderr: "" }),
    readOutput: async () => '{"maps":2}',
    cleanup: async () => {
      cleanupCalls += 1;
    },
    resultKey: "report",
  });
  await runJsonToolRequest({
    res,
    run: async () => {
      throw new Error("tool failed");
    },
    cleanup: async () => {
      cleanupCalls += 1;
    },
  });

  assert.deepEqual(responses, [
    { statusCode: 200, payload: { ok: true, toolExitCode: 0, report: { maps: 2 }, stderr: null } },
    { statusCode: 500, payload: { error: "tool failed" } },
  ]);
  assert.equal(cleanupCalls, 2);
});

test("sendBufferDownload writes archive headers and body", () => {
  const res = new FakeResponse();
  const buffer = Buffer.from("archive");

  sendBufferDownload({ res, buffer, downloadName: 'bad/"archive.zip' });

  assert.equal(res.headers["Content-Type"], "application/zip");
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="bad_archive.zip"');
  assert.equal(res.headers["Content-Length"], String(buffer.length));
  assert.equal(res.body, buffer);
});

test("sendFileDownload streams a file and runs cleanup once", async () => {
  const res = new FakeResponse();
  const stream = createStream();
  let cleanupCalls = 0;

  const returned = sendFileDownload({
    res,
    filePath: "output.Map.Gbx",
    downloadName: "output.Map.Gbx",
    createReadStream: (filePath) => {
      assert.equal(filePath, "output.Map.Gbx");
      return stream;
    },
    cleanup: async () => {
      cleanupCalls += 1;
    },
  });

  assert.equal(returned, stream);
  assert.equal(stream.response, res);
  assert.equal(res.headers["Content-Type"], "application/octet-stream");
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="output.Map.Gbx"');

  res.emit("finish");
  res.emit("close");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleanupCalls, 1);
});

test("sendFileDownload preserves the established read-error response", async () => {
  const res = new FakeResponse();
  const stream = createStream();
  const errors = [];
  let cleanupCalls = 0;

  sendFileDownload({
    res,
    filePath: "missing.zip",
    downloadName: "result.zip",
    errorMessage: "Failed to read zip file.",
    createReadStream: () => stream,
    logger: { error: (...args) => errors.push(args) },
    cleanup: async () => {
      cleanupCalls += 1;
    },
  });

  stream.emit("error", new Error("missing"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.statusCode, 500);
  assert.equal(res.body, "Failed to read zip file.");
  assert.equal(errors.length, 1);
  assert.equal(cleanupCalls, 1);
});
