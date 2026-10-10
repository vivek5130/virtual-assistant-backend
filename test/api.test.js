// Integration tests: real MongoDB (MONGO_TEST_URI or local), stubbed ai-agents.
// Run: npm test   (needs `docker compose up -d` for Mongo)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
require("dotenv").config({ quiet: true });

const aiCalls = [];
const fakeAi = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const payload = body ? JSON.parse(body) : {};
    aiCalls.push({ path: req.url, payload });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/agents/validate") return res.end(JSON.stringify({ valid: true, errors: [] }));
    if (req.url === "/v1/agents/run") {
      return res.end(
        JSON.stringify({
          thread_id: payload.thread_id,
          mode: payload.mode,
          reply: `echo: ${payload.message}`,
          citations: [],
          products: [{ id: "p1", name: "Thing", price: 10 }],
          actions: [],
          tool_calls: [{ name: "product_search", args: {}, ok: true, latency_ms: 1 }],
          retrieval: {},
          plan: {},
          memory: payload.history.length >= 2
            ? { mode: "long_term", summary: "shopper likes things", summarized_count: 2, facts_upsert: [{ key: "size", value: "M" }] }
            : { mode: "long_term" },
          grounded: true,
          abstained: false,
          blocked: false,
          model: { provider: "mock", name: "stub" },
          usage: {},
          latency_ms: 5,
          trace: [{ node: "agent", latency_ms: 1, data: {} }],
          agent: {},
        })
      );
    }
    res.statusCode = 404;
    res.end("{}");
  });
});

let base;
let server;
let mongoose;
let adminToken;
const guest = { "X-Guest-Id": "guest-test-0001" };

// Atlas users often lack dropDatabase; empty each collection instead.
async function clearDb() {
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});
}

async function api(method, path, { body, headers = {}, token } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  await new Promise((r) => fakeAi.listen(0, r));
  // Always a dedicated database: these tests drop it.
  process.env.MONGO_URI = process.env.MONGO_TEST_URI || process.env.MONGO_URI || "mongodb://localhost:27017";
  process.env.MONGO_DB_NAME = "shopsmart_test";
  process.env.JWT_SECRET = "test-secret";
  process.env.PLATFORM_API_URL = ""; // no syncing from tests
  process.env.MERCHANT_ID = "test-merchant";
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  // Stub Google's token verification: "good:<sub>:<email>" tokens are valid.
  const { OAuth2Client } = require("google-auth-library");
  OAuth2Client.prototype.verifyIdToken = async function ({ idToken, audience }) {
    assert.equal(audience, "test-client.apps.googleusercontent.com");
    const [kind, sub, email] = idToken.split(":");
    if (kind !== "good") throw new Error("bad token");
    return { getPayload: () => ({ sub, email, email_verified: true, name: "G User", picture: "https://example.com/a.png" }) };
  };

  mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGO_URI, { dbName: "shopsmart_test" });
  assert.equal(mongoose.connection.name, "shopsmart_test");
  await clearDb();

  const Product = require("../models/Product");
  const User = require("../models/User");
  const bcrypt = require("bcryptjs");
  await Product.syncIndexes();
  const Collection = require("../models/Collection");
  const { toDocument } = require("../services/productAdmin");
  await Collection.create({ merchantId: "test-merchant", handle: "featured", title: "Featured" });
  for (const input of [
    { title: "Red Runner", vendor: "Stride", productType: "Running Shoes", category: "Apparel & Accessories > Shoes", description: "running shoe", images: ["x"], tags: ["running"], collections: ["featured"], rating: 4.5,
      options: [{ name: "Color", values: ["Red", "Black"] }, { name: "Size", values: ["UK 8", "UK 9"] }], variantDefaults: { price: 3000, inventoryQuantity: 5, weight: 500 } },
    { title: "Blue Hiker", vendor: "Ridge", productType: "Hiking Boots", category: "Apparel & Accessories > Shoes", description: "hiking boot", images: ["x"], tags: ["hiking"], rating: 4.1,
      options: [], variantDefaults: { price: 6000, inventoryQuantity: 1, weight: 1, weightUnit: "kg" } },
    { title: "Steel Bottle", vendor: "Carry", productType: "Water Bottles", category: "Home & Garden > Kitchen", description: "bottle", images: ["x"], tags: ["gym"], rating: 4.8,
      options: [{ name: "Capacity", values: ["500 ml", "1 L"] }], variantDefaults: { price: 800, inventoryQuantity: 9, priceAdjustments: { Capacity: { "1 L": 200 } } } },
  ]) await Product.create(await toDocument("test-merchant", input));
  await User.create({ merchantId: "test-merchant", name: "Admin", username: "boss", email: "admin@test.local", passwordHash: await bcrypt.hash("password123", 4), role: "admin" });

  server = require("../app").listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  adminToken = (await api("POST", "/auth/login", { body: { email: "admin@test.local", password: "password123" } })).body.token;
});

after(async () => {
  await clearDb();
  await mongoose.disconnect();
  server.close();
  fakeAi.close();
});

test("catalog: variants, option/price/collection filters, facets, relaxing", async () => {
  let r = await api("GET", "/products?category=shoes&maxPrice=4000");
  assert.deepEqual(r.body.products.map((p) => p.name), ["Red Runner"]);
  r = await api("GET", "/products?color=black&size=UK%209");
  assert.deepEqual(r.body.products.map((p) => p.name), ["Red Runner"]);
  r = await api("GET", "/products?collection=featured");
  assert.equal(r.body.total, 1);
  r = await api("GET", "/products?q=hiking");
  assert.equal(r.body.products[0].name, "Blue Hiker");
  r = await api("GET", "/products?category=running%20shoes");
  assert.equal(r.body.relaxed[0].field, "category");
  assert.equal(r.body.products[0].name, "Red Runner");
  r = await api("GET", "/products?maxPrice=900");
  assert.equal(r.body.products[0].price, 800, "price range uses cheapest variant");
  r = await api("GET", "/products/facets");
  assert.deepEqual(r.body.options.Color.map((o) => o.value).sort(), ["Black", "Red"]);
  assert.equal(r.body.collections[0].productCount, 1);
  r = await api("GET", "/products/steel-bottle");
  assert.equal(r.body.product.variants.length, 2);
  assert.equal(r.body.product.priceMax, 1000);
});

test("guest cart → checkout → track; variants and stock enforced", async () => {
  const runner = (await api("GET", "/products/red-runner")).body.product;
  let r = await api("POST", "/cart/items", { headers: guest, body: { productId: runner.id } });
  assert.equal(r.status, 409, "multi-variant product needs a variant");
  assert.match(r.body.error, /variant_id/);
  const blackNine = runner.variants.find((v) => v.options.Color === "Black" && v.options.Size === "UK 9");
  r = await api("POST", "/cart/items", { headers: guest, body: { productId: runner.id, variantId: blackNine.id } });
  assert.equal(r.body.cart.items[0].variant.title, "Black / UK 9");

  const hiker = (await api("GET", "/products/blue-hiker")).body.product;
  r = await api("POST", "/cart/items", { headers: guest, body: { productId: hiker.id, quantity: 2 } });
  assert.equal(r.status, 409, "only 1 in stock");
  r = await api("POST", "/cart/items", { headers: guest, body: { productId: hiker.id } });
  assert.equal(r.body.cart.count, 2);
  assert.equal(r.body.cart.weightGrams, 1500);

  r = await api("POST", "/orders", {
    headers: guest,
    body: { email: "g@test.local", paymentMethod: "cod", shippingAddress: { name: "G", phone: "1", line1: "x", city: "c", state: "s", postalCode: "1" } },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const orderNumber = r.body.order.orderNumber;
  assert.equal(r.body.order.items[0].variantTitle, "Black / UK 9");
  assert.equal((await api("GET", "/cart", { headers: guest })).body.cart.count, 0);
  const after = (await api("GET", "/products/blue-hiker")).body.product;
  assert.equal(after.inStock, false, "stock reserved and availability recomputed");

  assert.equal((await api("GET", `/orders/track/${orderNumber}`)).status, 404, "stranger without email");
  assert.equal((await api("GET", `/orders/track/${orderNumber}?email=g@test.local`)).body.order.status, "placed");
  r = await api("PATCH", `/admin/orders/${orderNumber}/status`, { token: adminToken, body: { status: "shipped" } });
  assert.equal(r.body.order.status, "shipped");
});

test("login works with username or email", async () => {
  const byUser = await api("POST", "/auth/login", { body: { identifier: "boss", password: "password123" } });
  assert.equal(byUser.body.user.role, "admin");
});

test("admin can create a product with generated variants", async () => {
  const r = await api("POST", "/admin/products", {
    token: adminToken,
    body: { title: "Test Tee", vendor: "Lab", productType: "T-Shirts", images: ["x"], options: [{ name: "Size", values: ["S", "M", "L"] }], variantDefaults: { price: 500, priceAdjustments: { Size: { L: 50 } } } },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.product.variants.length, 3);
  assert.equal(r.body.product.priceMax, 550);
});

test("google sign-in: verifies token, creates customer, links existing account, never grants admin", async () => {
  assert.equal((await api("GET", "/auth/providers")).body.google.clientId, "test-client.apps.googleusercontent.com");
  assert.equal((await api("POST", "/auth/google", { body: { credential: "forged" } })).status, 401);

  let r = await api("POST", "/auth/google", { body: { credential: "good:sub-1:new.person@gmail.com" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "customer");
  assert.deepEqual(r.body.user.providers, ["google"]);
  const again = await api("POST", "/auth/google", { body: { credential: "good:sub-1:new.person@gmail.com" } });
  assert.equal(again.body.user.id, r.body.user.id, "same Google account → same user");
  assert.equal((await api("POST", "/auth/login", { body: { identifier: "new.person@gmail.com", password: "anything" } })).status, 401, "no password on Google-only accounts");

  r = await api("POST", "/auth/google", { body: { credential: "good:sub-2:admin@test.local" } });
  assert.equal(r.body.user.role, "admin", "linking keeps the existing account's role");
  assert.deepEqual(r.body.user.providers.sort(), ["google", "password"]);
});

test("admin routes require admin", async () => {
  assert.equal((await api("GET", "/admin/agents")).status, 401);
  const reg = await api("POST", "/auth/register", { body: { name: "C", email: "c@test.local", password: "password123" } });
  assert.equal((await api("GET", "/admin/agents", { token: reg.body.token })).status, 403);
});

