const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");

test("backend requires a private JWT secret and database URL", () => {
  const source = read("server.js");
  assert.match(source, /JWT_SECRET must be set/);
  assert.match(source, /DATABASE_URL is required/);
});
test("backend exposes health, catalogue, auth and sourcing routes", () => {
  const source = read("server.js");
  for (const route of [
    'app.get("/api/health"',
    'app.get("/api/catalogue"',
    'app.get("/api/retailers"',
    'app.post("/api/auth/register"',
    'app.post("/api/auth/login"',
    'app.post("/api/inquiries"',
    'app.post("/api/order-requests"'
  ]) assert.ok(source.includes(route), "Missing route: " + route);
});
test("order requests require verified stock and resale authorisation", () => {
  const source = read("server.js");
  assert.match(source, /availability_status !== "in_stock"/);
  assert.match(source, /!p\.is_authorised_for_resale/);
  assert.match(source, /payment_status VARCHAR\(30\) NOT NULL DEFAULT 'not_enabled'/);
});
test("admin routes are protected by admin role middleware", () => {
  const source = read("server.js");
  for (const route of ['app.get("/api/admin/inquiries", auth("admin")','app.post("/api/admin/products", auth("admin")','app.get("/api/admin/orders", auth("admin")']) assert.ok(source.includes(route));
});
test("service worker does not cache API responses", () => {
  const source = read("sw.js");
  assert.match(source, /pathname\.startsWith\("\/api\/"\)/);
});
test("customer account and admin pages exist", () => {
  assert.match(read("account.html"), /Create account/);
  assert.match(read("admin.html"), /Administrator sign in/);
});
