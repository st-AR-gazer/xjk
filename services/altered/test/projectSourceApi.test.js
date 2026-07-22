import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllPages, ProjectSourceApi } from "../src/services/altered/projectSource/projectSourceApi.js";

test("fetchAllPages reports progress and stops at the advertised total", async () => {
  const requests = [];
  const progress = [];
  const items = await fetchAllPages({
    fetchPage: async (request) => {
      requests.push(request);
      return request.offset === 0
        ? { itemCount: 3, values: ["one", "two"] }
        : { itemCount: 3, values: ["three", "ignored"] };
    },
    selectItems: (payload) => payload.values,
    length: 2,
    maxPages: 10,
    defaultLength: 25,
    defaultMaxPages: 100,
    onPageLoaded: (event) => progress.push(event),
  });

  assert.deepEqual(items, ["one", "two", "three", "ignored"]);
  assert.deepEqual(requests, [
    { length: 2, offset: 0 },
    { length: 2, offset: 2 },
  ]);
  assert.deepEqual(progress, [
    { page: 1, offset: 0, pageSize: 2, totalLoaded: 2, totalKnown: 3 },
    { page: 2, offset: 2, pageSize: 2, totalLoaded: 4, totalKnown: 3 },
  ]);
});

test("ProjectSourceApi keeps endpoint-specific arguments and page-size bounds", async () => {
  const requests = [];
  const api = new ProjectSourceApi();
  const rows = await api.fetchAllTotdMonths(
    {
      async getTotdMonths(request) {
        requests.push(request);
        return { monthList: request.offset === 0 ? ["month"] : [] };
      },
    },
    { length: 999, maxPages: 3 }
  );

  assert.deepEqual(rows, ["month"]);
  assert.deepEqual(requests, [{ length: 100, offset: 0, royal: false }]);
});
