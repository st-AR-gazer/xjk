import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminLoginLocation, buildCanonicalAdminLocation } from "../src/adminPageRoutes.js";

test("admin redirects remain relative to a stripped tracker mount", () => {
  assert.equal(buildAdminLoginLocation("/admin", { next: "/admin" }), "admin/login?next=%2Fadmin");
  assert.equal(buildAdminLoginLocation("/admin/", { next: "/admin/" }), "login?next=%2Fadmin%2F");
  assert.equal(buildAdminLoginLocation("/admin/logout", { logged_out: "1" }), "login?logged_out=1");
});

test("admin page variants canonicalize without escaping a stripped mount", () => {
  assert.equal(buildCanonicalAdminLocation("/admin/"), "../admin");
  assert.equal(buildCanonicalAdminLocation("/admin/login/"), "../login");
  assert.equal(buildCanonicalAdminLocation("/admin"), "");
});
